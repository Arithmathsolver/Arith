require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const { createWorker } = require('tesseract.js');
const NodeCache = require('node-cache');
const axios = require('axios');
const winston = require('winston');
const path = require('path');

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

// AI Prompt and Model Config
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
        return await tryModel(model, problem);
      } catch (err) {
        logger.warn(`⚠️ Model ${model} failed: ${err.response?.data?.error?.message || err.message}`);
      }
    }
    throw new Error('Failed to get solution from any model');
  });
}

// --- Post-Processing Logic ---
function postProcessMathText(text) {
  return text
    .replace(/\bV\b/g, '√')
    .replace(/\bpi\b/gi, 'π')
    .replace(/n\s*=\s*\d+/gi, 'π')
    .replace(/O/g, '0')
    .replace(/l/g, '1')
    .replace(/\/\s*/g, '/')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function refineMathTextWithAI(rawText) {
  const prompt = `
You are an expert OCR correction AI. The following text was extracted from an image and contains math symbols mixed with text. Some symbols and words may be wrong due to OCR errors.

Your tasks:
1. Correct math symbols: replace V with √, pi or n with π when appropriate, O with 0, l with 1, etc.
2. Correct common English words that might be misspelled due to OCR.
3. Preserve mathematical expressions, symbols, and their placement.
4. Format the corrected output clearly and coherently without changing the meaning.

Here is the raw OCR text:
""" 
${rawText}
"""

Return only the fully corrected text, no extra commentary or explanation.
`;

  const response = await axios.post(
    TOGETHER_API_URL,
    {
      model: "meta-llama/Llama-3-8b-chat-hf",
      messages: [
        { role: "system", content: prompt }
      ],
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

// --- OCR Processing ---
async function extractTextFromImage(imageBuffer) {
  try {
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text: rawText } } = await worker.recognize(imageBuffer);
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

// Express App Setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API Routes ---
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

    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    const { data: { text: rawText } } = await worker.recognize(req.files.image.data);
    await worker.terminate();

    const postProcessed = postProcessMathText(rawText);
    const refined = await refineMathTextWithAI(postProcessed);

    logger.info(`🖼️ Preview OCR Raw: ${rawText}`);
    logger.info(`🧼 Preview Post-Processed: ${postProcessed}`);
    logger.info(`✅ Preview AI Refined: ${refined}`);

    res.json({
      raw: rawText.trim(),
      cleaned: postProcessed,
      corrected: refined
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

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  console.log(`➡️  Server ready at http://localhost:${PORT}`);
});
