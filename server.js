require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const { createWorker } = require('tesseract.js');
const NodeCache = require('node-cache');
const axios = require('axios');
const winston = require('winston');
const path = require('path');
const sharp = require('sharp'); // For image preprocessing

// Logger Setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Validate API Key
if (!process.env.TOGETHER_API_KEY) {
  logger.error('❌ Missing TOGETHER_API_KEY in environment variables');
  process.exit(1);
}

// Cache Setup
const cache = new NodeCache({ stdTTL: 3600 });
function getCacheKey(problem) {
  return `math_solution:${problem.trim().toLowerCase()}`;
}
async function getCachedSolution(problem, solverFn) {
  const key = getCacheKey(problem);
  const cached = cache.get(key);
  if (cached) {
    logger.info(`✅ Using cached solution for: ${problem}`);
    return cached;
  }
  const solution = await solverFn();
  cache.set(key, solution);
  return solution;
}

// AI Prompt
const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const SYSTEM_PROMPT = `
You are a smart and concise math tutor.

Return clean step-by-step math solutions using this exact structure:

**Problem:**
[original math expression]

**Step 1: [What is being done]**
[equation or transformation]

**Step 2: [Next operation]**
[...]

**✅ Final Answer:**
[final result]

Rules:
- Do not explain anything in paragraphs.
- Use **bold headings** exactly as shown.
- Each step should start with "**Step X: [short heading]**" and follow with clear LaTeX or simple math.
- Keep it minimal, avoid extra words or commentary.
`;

const models = [
  "mistralai/Mixtral-8x7B-Instruct-v0.1",
  "meta-llama/Llama-3-8b-chat-hf"
];

async function tryModel(model, problem) {
  logger.info(`🔍 Trying model: ${model}`);
  const response = await axios.post(
    TOGETHER_API_URL,
    {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: problem }
      ],
      temperature: 0.3,
      max_tokens: 1500
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data.choices[0].message.content;
}

async function solveMathProblem(problem) {
  return await getCachedSolution(problem, async () => {
    for (let model of models) {
      try {
        let result = await tryModel(model, problem);

        result = result.replace(/\*\*Step (\d+):\s*(.*?)\*\*/g, (_, num, desc) => {
          return `<strong style="color:black">Step ${num}: ${desc}</strong>`;
        });
        result = result.replace(/\*\*✅ Final Answer:\*\*/g, `<strong style="color:green">✅ Final Answer:</strong>`);
        result = result.replace(/\*\*(.*?)\*\*/g, (_, txt) => `<strong>${txt}</strong>`);

        return result;
      } catch (err) {
        logger.warn(`⚠️ Model ${model} failed: ${err.response?.data?.error?.message || err.message}`);
      }
    }
    throw new Error('Failed to get solution from any model');
  });
}

function postProcessMathText(text) {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2') // 2x → 2 x
    .replace(/([a-zA-Z])(\d)/g, '$1^$2') // x2 → x^2
    .replace(/(?<=\d)\s*\/\s*(?=\d)/g, '/') // 1 / 2 → 1/2
    .replace(/[\u221A]/g, '√') // Replace unicode root if any
    .replace(/_/g, '') // Clean subscript underscores if Tesseract misreads
    .trim();
}

async function refineMathTextWithAI(rawText) {
  const refinedPrompt = `
You are a math-aware OCR correction assistant.

A user has scanned a handwritten or typed math question using OCR. Your job is to correct all math-related OCR mistakes and return the properly written math expression or question.

Instructions:
- Interpret what the OCR *meant*, not just what it says.
- Fix common OCR issues:
  - √222 or V222 might be 2x^2
  - x2 → x^2, 3x2 → 3x^2
  - pi → π
  - O → 0, l → 1
  - Extra or missing minus/plus signs
  - Fix broken combined fractions or subscripts like a_{i+1}
- Preserve structure, brackets, and math notation

OCR Text:
"""${rawText}"""
`;

  const response = await axios.post(
    TOGETHER_API_URL,
    {
      model: "meta-llama/Llama-3-8b-chat-hf",
      messages: [{ role: "system", content: refinedPrompt }],
      temperature: 0,
      max_tokens: 600
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.choices[0].message.content.trim();
}

async function extractTextFromImage(imageBuffer) {
  try {
    const enhancedImage = await sharp(imageBuffer)
      .grayscale()
      .normalize()
      .resize({ width: 1000 })
      .sharpen()
      .toBuffer();

    const worker = await createWorker({
      logger: m => logger.info(`📜 OCR Log: ${m.status}`),
    });
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text: rawText } } = await worker.recognize(enhancedImage);
    await worker.terminate();

    const postProcessed = postProcessMathText(rawText);
    const refined = await refineMathTextWithAI(postProcessed);

    logger.info(`🖼️ OCR Raw: ${rawText}`);
    logger.info(`🧹 Post-Processed: ${postProcessed}`);
    logger.info(`🤖 AI Refined: ${refined}`);

    return refined;
  } catch (error) {
    logger.error(`❌ OCR Error: ${error.message}`);
    throw new Error('Failed to process image');
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/solve', async (req, res) => {
  try {
    let problem = req.body.problem;

    if (req.files?.image) {
      problem = await extractTextFromImage(req.files.image.data);
      logger.info(`🖼️ Final OCR-processed text: ${problem}`);
    }

    if (!problem) {
      return res.status(400).json({ error: 'No problem provided' });
    }

    let solution = await solveMathProblem(problem);
    res.json({ problem, solution });
  } catch (error) {
    logger.error(`❌ API Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ocr-preview', async (req, res) => {
  try {
    if (!req.files?.image) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const enhancedImage = await sharp(req.files.image.data)
      .grayscale()
      .normalize()
      .resize({ width: 1000 })
      .sharpen()
      .toBuffer();

    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    const { data: { text: rawText } } = await worker.recognize(enhancedImage);
    await worker.terminate();

    const postProcessed = postProcessMathText(rawText);
    const corrected = await refineMathTextWithAI(postProcessed);

    logger.info(`🖼️ Preview OCR Raw: ${rawText}`);
    logger.info(`🧼 Preview Post-Processed: ${postProcessed}`);
    logger.info(`✅ Preview AI Refined: ${corrected}`);

    res.json({
      raw: rawText.trim(),
      cleaned: postProcessed,
      corrected
    });
  } catch (error) {
    logger.error(`❌ OCR Preview Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/check', async (req, res) => {
  try {
    const response = await tryModel(models[0], "What is 2 + 2?");
    res.json({ ok: true, answer: response });
  } catch (err) {
    logger.error('❌ Check Endpoint Error:', err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  console.log(`➡️  Server ready at http://localhost:${PORT}`);
});
