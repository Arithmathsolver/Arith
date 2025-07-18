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
You are an expert mathematics tutor that solves problems from primary to university level.
Rules:
1. Provide step-by-step solutions.
2. Use LaTeX for math expressions.
3. Highlight key concepts.
4. Box final answers: \\boxed{answer}
5. Support: Arithmetic, Algebra, Calculus, Geometry, Statistics.
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
You are an OCR correction AI. The following text is OCR'd from a math image, but some symbols may be wrong. Fix common math OCR errors like replacing V with √, n with π, O with 0, l with 1.

Original OCR text:
${rawText}

Return the cleaned and corrected math expression only, no explanations.
`;

  const response = await axios.post(
    TOGETHER_API_URL,
    {
      model: "meta-llama/Llama-3-8b-chat-hf",
      messages: [
        { role: "system", content: prompt }
      ],
      temperature: 0,
      max_tokens: 300
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
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();

    const postProcessed = postProcessMathText(text);
    const refined = await refineMathTextWithAI(postProcessed);

    logger.info(`🖼️ OCR Raw: ${text}`);
    logger.info(`🔍 Post-Processed: ${postProcessed}`);
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

// API Routes
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

    if (!solution.includes('\\(') && !solution.includes('\\[')) {
      solution = `\\(${solution}\\)`;
    }

    res.json({ problem, solution });
  } catch (error) {
    logger.error(`❌ API Error: ${error.message}`);
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
