require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const { createWorker } = require('tesseract.js');
const NodeCache = require('node-cache');
const axios = require('axios');
const winston = require('winston');
const path = require('path');
const sharp = require('sharp'); // ✅ Added sharp for preprocessing

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

// OCR Processing with worker mode + preprocessing
async function extractTextFromImage(imageBuffer) {
  try {
    // ✅ Preprocess image: grayscale + binarize + resize
    const processedImage = await sharp(imageBuffer)
      .grayscale()
      .threshold(128) // binarization
      .resize(2000, null, { fit: 'inside' }) // resize to improve OCR
      .toBuffer();

    // ✅ Use Tesseract worker mode
    const worker = await createWorker({
      workerPath: require('tesseract.js').workerPath(),
      langPath: path.join(__dirname, 'traineddata'), // folder containing equ.traineddata
      corePath: require('tesseract.js-core').workerPath(),
      logger: m => console.log(m) // Optional progress log
    });

    await worker.loadLanguage('equ');
    await worker.initialize('equ');
    const { data: { text } } = await worker.recognize(processedImage);
    await worker.terminate();

    return text.trim();
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

// Serve everything in public/
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
      logger.info(`🖼️ Extracted text: ${problem.substring(0, 100)}...`);
    }

    if (!problem) {
      return res.status(400).json({ error: 'No problem provided' });
    }

    let solution = await solveMathProblem(problem);

    res.json({ problem, solution });
  } catch (error) {
    logger.error(`❌ Solve API Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});
