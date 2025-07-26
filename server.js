require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const NodeCache = require('node-cache');
const axios = require('axios');
const winston = require('winston');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const { exec } = require('child_process');

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

if (!process.env.TOGETHER_API_KEY) {
  logger.error('❌ Missing TOGETHER_API_KEY in environment variables');
  process.exit(1);
}

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

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const SYSTEM_PROMPT = `You are a smart and concise math tutor.
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
- Keep it minimal, avoid extra words or commentary
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
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1^$2')
    .replace(/(?<=\d)\s*\/\s*(?=\d)/g, '/')
    .replace(/[\u221A]/g, '√')
    .replace(/_/g, '')
    .trim();
}

async function refineMathTextWithAI(rawText) {
  const refinedPrompt = `
You are a math-aware OCR correction assistant.
A user has scanned a handwritten or typed math question using OCR. Your job is to correct all math-related OCR mistakes and return the properly written math expression or question.
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

    const tempImagePath = path.join(__dirname, 'uploads', `img_${Date.now()}.jpg`);
    fs.writeFileSync(tempImagePath, enhancedImage);

    const ocrOutput = await new Promise((resolve, reject) => {
      exec(`python3 extractText.py "${tempImagePath}"`, (error, stdout, stderr) => {
        fs.unlinkSync(tempImagePath);
        if (error) {
          logger.error(`❌ TrOCR Error: ${stderr || error.message}`);
          return reject(new Error('Failed to extract text using TrOCR'));
        }
        resolve(stdout.trim());
      });
    });

    const postProcessed = postProcessMathText(ocrOutput);
    const refined = await refineMathTextWithAI(postProcessed);

    logger.info(`🖼️ OCR Raw (TrOCR): ${ocrOutput}`);
    logger.info(`🧹 Post-Processed: ${postProcessed}`);
    logger.info(`🤖 AI Refined: ${refined}`);

    return refined;
  } catch (error) {
    logger.error(`❌ OCR Error: ${error.message}`);
    throw new Error('Failed to process image');
  }
}

// Express App
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
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

    const text = await extractTextFromImage(req.files.image.data);

    res.json({
      raw: text,
      cleaned: text,
      corrected: text
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
