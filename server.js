require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const { createWorker } = require('tesseract.js');
const NodeCache = require('node-cache');
const axios = require('axios');
const winston = require('winston');
const path = require('path');

// ---------------------- Logger Setup ----------------------
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

// ------------------ Environment Check ---------------------
if (!process.env.TOGETHER_API_KEY) {
  logger.error('❌ Missing TOGETHER_API_KEY in environment variables');
  process.exit(1);
}

// --------------------- Caching Setup ----------------------
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

// ----------------- Together AI Integration ----------------
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

async function solveMathProblem(problem) {
  try {
    return await getCachedSolution(problem, async () => {
      const response = await axios.post(
        TOGETHER_API_URL,
        {
          model: "deepseek-ai/DeepSeek-Math-7B",
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
    });
  } catch (error) {
    const detail = error.response?.data || error.message;
    logger.error('❌ Together AI Error:', detail);
    throw new Error('Failed to get solution');
  }
}

// ----------------------- OCR Setup ------------------------
async function extractTextFromImage(imageBuffer) {
  try {
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();
    return text.trim();
  } catch (error) {
    logger.error(`❌ OCR Error: ${error.message}`);
    throw new Error('Failed to process image');
  }
}

// -------------------- Express App Setup -------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------- API Routes ------------------------
app.post('/api/solve', async (req, res) => {
  try {
    let problem = req.body.problem;

    if (req.files?.image) {
      problem = await extractTextFromImage(req.files.image.data);
      logger.info(`🖼️ Extracted image text: ${problem.substring(0, 100)}...`);
    }

    if (!problem) {
      return res.status(400).json({ error: 'No problem provided' });
    }

    const solution = await solveMathProblem(problem);
    res.json({ problem, solution });
  } catch (error) {
    logger.error(`❌ API Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/check', async (req, res) => {
  try {
    const response = await axios.post(
      TOGETHER_API_URL,
      {
        model: "deepseek-ai/DeepSeek-Math-7B",
        messages: [{ role: "user", content: "What is 2 + 2?" }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ ok: true, answer: response.data.choices[0].message.content });
  } catch (err) {
    logger.error('❌ Check Endpoint Error:', err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.response?.data || err.message });
  }
});

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  console.log(`➡️  Server ready at http://localhost:${PORT}`);
});
