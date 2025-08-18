require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const sharp = require('sharp');
const NodeCache = require('node-cache');
const axios = require('axios');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Add global polyfills for Tesseract.js
global.DOMException = global.DOMException || class DOMException extends Error {
  constructor(message, name) {
    super(message);
    this.name = name || 'DOMException';
  }
};

// Add fetch polyfill if not available
if (!global.fetch) {
  const fetch = require('node-fetch');
  global.fetch = fetch;
  global.Headers = fetch.Headers;
  global.Request = fetch.Request;
  global.Response = fetch.Response;
}

// Now import tesseract after polyfills
const { createWorker, PSM } = require('tesseract.js');

// Create logs directory if it doesn't exist
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

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

logger.info('✅ API Key found in environment');

// Cache Setup
const cache = new NodeCache({ stdTTL: 3600 });

function getCacheKey(problem) {
  return `math_solution:${problem.trim().toLowerCase()}`;
}

async function getCachedSolution(problem, solverFn) {
  const key = getCacheKey(problem);
  const cached = cache.get(key);
  if (cached) {
    logger.info(`✅ Using cached solution`);
    return cached;
  }
  const solution = await solverFn();
  cache.set(key, solution);
  return solution;
}

// AI Configuration
const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const SYSTEM_PROMPT = `You are a smart and concise math tutor. Return clean step-by-step math solutions using this exact structure:

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
- Each step should start with "**Step X: [short heading]**" and follow with clear math.
- Keep it minimal, avoid extra words.`;

const models = [
  "mistralai/Mixtral-8x7B-Instruct-v0.1",
  "meta-llama/Llama-3-8b-chat-hf"
];

async function tryModel(model, problem) {
  logger.info(`🔍 Trying model: ${model}`);
  try {
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
        },
        timeout: 30000
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    logger.error(`❌ Model ${model} failed: ${error.message}`);
    throw error;
  }
}

async function solveMathProblem(problem) {
  return await getCachedSolution(problem, async () => {
    let lastError;
    for (let model of models) {
      try {
        let result = await tryModel(model, problem);

        // Format the result
        result = result.replace(/\*\*Step (\d+):\s*(.*?)\*\*/g, (_, num, desc) => {
          return `<strong style="color:black">Step ${num}: ${desc}</strong>`;
        });
        result = result.replace(/\*\*✅ Final Answer:\*\*/g, `<strong style="color:green">✅ Final Answer:</strong>`);
        result = result.replace(/\*\*(.*?)\*\*/g, (_, txt) => `<strong>${txt}</strong>`);

        return result;
      } catch (err) {
        lastError = err;
        logger.warn(`⚠️ Model ${model} failed, trying next...`);
      }
    }
    throw lastError || new Error('All models failed');
  });
}

// Post-Processing Functions
function postProcessMathText(text) {
  logger.info(`🧹 Post-processing text: "${text}"`);
  const processed = text
    .replace(/\bV\b/g, '√')
    .replace(/\bpi\b/gi, 'π')
    .replace(/n\s*=\s*\d+/gi, 'π')
    .replace(/O/g, '0')
    .replace(/l(?=\s|$|\d)/g, '1')
    .replace(/\/\s*/g, '/')
    .replace(/\s{2,}/g, ' ')
    .trim();
  logger.info(`🧹 Post-processed result: "${processed}"`);
  return processed;
}

async function refineMathTextWithAI(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    return rawText;
  }

  try {
    const prompt = `Fix OCR errors in this math text: "${rawText}"

Correct common errors:
- V → √ (square root)  
- pi or n → π when it means pi
- O → 0 (zero)
- l → 1 when it's a number
- Fix spacing

Return ONLY the corrected text.`;

    const response = await axios.post(
      TOGETHER_API_URL,
      {
        model: "meta-llama/Llama-3-8b-chat-hf",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 300
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    logger.warn(`⚠️ AI refinement failed, using original text`);
    return rawText;
  }
}

// Tesseract Worker Management
let ocrWorker;
let isWorkerReady = false;

async function initializeWorker() {
  try {
    logger.info('🔧 Initializing Tesseract worker with safe configuration...');
    
    ocrWorker = await createWorker({
      logger: (m) => {
        if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract') {
          logger.info(`Tesseract: ${m.status} ${Math.round(m.progress * 100)}%`);
        }
      },
      // Safe configuration for server environments
      workerPath: require.resolve('tesseract.js/dist/worker.min.js'),
      corePath: require.resolve('tesseract.js-core/tesseract-core.wasm.js'),
    });

    logger.info('📥 Loading English language pack...');
    await ocrWorker.loadLanguage('eng');
    await ocrWorker.initialize('eng');
    
    logger.info('⚙️ Setting OCR parameters...');
    await ocrWorker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1'
    });

    isWorkerReady = true;
    logger.info("✅ Tesseract worker ready");
    return true;
  } catch (error) {
    logger.error(`❌ Tesseract initialization failed: ${error.message}`);
    logger.info('📝 OCR will be disabled, but text input will still work');
    isWorkerReady = false;
    return false;
  }
}

// OCR Function with fallback
async function extractTextFromImage(imageBuffer) {
  if (!isWorkerReady) {
    throw new Error('OCR service is temporarily unavailable. Please try entering the problem as text instead.');
  }

  try {
    logger.info('🖼️ Processing image for OCR...');
    
    const processedImage = await sharp(imageBuffer)
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .normalize()
      .png()
      .toBuffer();

    logger.info('🔍 Running OCR...');
    const { data: { text: rawText, confidence } } = await ocrWorker.recognize(processedImage);

    logger.info(`🎯 OCR confidence: ${Math.round(confidence)}%`);
    logger.info(`📝 Raw text: "${rawText}"`);

    if (!rawText || rawText.trim().length === 0) {
      throw new Error('No text detected. Please ensure image has clear text or try typing the problem instead.');
    }

    const postProcessed = postProcessMathText(rawText);
    const refined = await refineMathTextWithAI(postProcessed);

    logger.info(`✅ Final text: "${refined}"`);
    return refined;

  } catch (error) {
    logger.error(`❌ OCR Error: ${error.message}`);
    throw new Error(`Image processing failed: ${error.message}. Try entering the problem as text instead.`);
  }
}

// Express Setup
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 },
  abortOnLimit: true,
  responseOnLimit: "File too large (max 10MB)",
}));

app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SolvumAi - Math Problem Solver</title>
        <style>body{font-family:Arial;max-width:800px;margin:0 auto;padding:20px}</style>
      </head>
      <body>
        <h1>🧮 SolvumAi - Math Problem Solver</h1>
        <form id="form">
          <textarea id="problem" placeholder="Enter math problem..." style="width:100%;height:100px"></textarea><br><br>
          <input type="file" id="image" accept="image/*"><br><br>
          <button type="submit">Solve</button>
        </form>
        <div id="result"></div>
        
        <script>
          document.getElementById('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData();
            const problem = document.getElementById('problem').value;
            const image = document.getElementById('image').files[0];
            
            if (problem) formData.append('problem', problem);
            if (image) formData.append('image', image);
            
            if (!problem && !image) {
              alert('Please enter a problem or select an image');
              return;
            }
            
            document.getElementById('result').innerHTML = 'Processing...';
            
            try {
              const response = await fetch('/api/solve', {method: 'POST', body: formData});
              const data = await response.json();
              
              if (response.ok) {
                document.getElementById('result').innerHTML = 
                  '<h3>Problem:</h3>' + data.problem + 
                  '<h3>Solution:</h3>' + data.solution;
              } else {
                document.getElementById('result').innerHTML = 'Error: ' + data.error;
              }
            } catch (error) {
              document.getElementById('result').innerHTML = 'Error: ' + error.message;
            }
          });
        </script>
      </body>
      </html>
    `);
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    tesseract: isWorkerReady,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/solve', async (req, res) => {
  try {
    let problem = req.body.problem;

    // Handle image upload
    if (req.files?.image && !problem) {
      if (!isWorkerReady) {
        return res.status(503).json({ 
          error: 'OCR service is temporarily unavailable. Please enter the problem as text instead.' 
        });
      }

      logger.info('📤 Processing image...');
      problem = await extractTextFromImage(req.files.image.data);
    }

    if (!problem || problem.trim().length === 0) {
      return res.status(400).json({ error: 'No problem provided' });
    }

    logger.info(`🧮 Solving: "${problem.substring(0, 50)}..."`);
    const solution = await solveMathProblem(problem.trim());
    
    res.json({ 
      problem: problem.trim(), 
      solution,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`❌ Solve error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ocr-preview', async (req, res) => {
  try {
    if (!req.files?.image) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    if (!isWorkerReady) {
      return res.status(503).json({ 
        error: 'OCR service is temporarily unavailable.' 
      });
    }

    const processedImage = await sharp(req.files.image.data)
      .resize({ width: 1200, fit: 'inside' })
      .grayscale()
      .normalize()
      .png()
      .toBuffer();

    const { data: { text: rawText, confidence } } = await ocrWorker.recognize(processedImage);
    const postProcessed = postProcessMathText(rawText);
    const refined = await refineMathTextWithAI(postProcessed);

    res.json({
      raw: rawText.trim(),
      cleaned: postProcessed,
      corrected: refined,
      confidence: Math.round(confidence)
    });
  } catch (error) {
    logger.error(`❌ OCR Preview Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((error, req, res, next) => {
  logger.error(`❌ Unhandled error: ${error.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Shutting down...');
  if (ocrWorker && isWorkerReady) {
    await ocrWorker.terminate();
  }
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      console.log(`\n🎉 SolvumAi Server Ready!`);
      console.log(`➡️  Server ready at http://localhost:${PORT}`);
      
      // Initialize Tesseract in background
      initializeWorker().then(success => {
        if (success) {
          logger.info('✅ All services ready including OCR');
        } else {
          logger.info('⚠️ Server running without OCR - text input still works');
        }
      });
    });
  } catch (error) {
    logger.error(`❌ Failed to start: ${error.message}`);
    process.exit(1);
  }
}

startServer();
