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

// Alternative OCR using Together AI Vision Models
async function extractTextFromImageWithAI(imageBuffer) {
  try {
    logger.info('🖼️ Processing image with AI OCR...');
    
    // Process image with Sharp for better quality
    const processedImage = await sharp(imageBuffer)
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Convert image to base64
    const base64Image = processedImage.toString('base64');
    const dataUri = `data:image/jpeg;base64,${base64Image}`;

    logger.info('🤖 Using AI vision model for OCR...');

    // Use Together AI vision model for OCR
    const prompt = `You are an expert OCR system specialized in reading mathematical content from images.

Analyze this image and extract ALL text and mathematical expressions you can see. Focus on:
- Mathematical equations and formulas
- Numbers, variables, and mathematical symbols
- Any written instructions or problem statements
- Convert symbols correctly (√ for square root, π for pi, etc.)

Rules:
1. Return ONLY the extracted text/math, nothing else
2. Preserve the original layout and mathematical notation
3. Use standard mathematical symbols (√, π, ∫, ∑, etc.)
4. If you see handwriting, transcribe it accurately
5. If the image is unclear, do your best approximation

Extract the text from this image:`;

    const response = await axios.post(
      TOGETHER_API_URL,
      {
        model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUri } }
            ]
          }
        ],
        temperature: 0,
        max_tokens: 1000
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000
      }
    );

    const extractedText = response.data.choices[0].message.content.trim();
    logger.info(`🎯 AI OCR result: "${extractedText}"`);

    if (!extractedText || extractedText.length < 2) {
      throw new Error('No text detected in the image. Please ensure the image contains clear, readable math content.');
    }

    return extractedText;

  } catch (error) {
    logger.error(`❌ AI OCR Error: ${error.message}`);
    throw new Error(`Failed to extract text from image: ${error.message}. Please try typing the problem directly.`);
  }
}

// Express Setup
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(fileUpload({
  limits: { fileSize: 15 * 1024 * 1024 },
  abortOnLimit: true,
  responseOnLimit: "File too large (max 15MB)",
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
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
          .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          h1 { color: #333; text-align: center; margin-bottom: 30px; }
          textarea { width: 100%; height: 120px; margin: 10px 0; padding: 15px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; }
          textarea:focus { border-color: #007bff; outline: none; }
          .file-input { margin: 15px 0; padding: 20px; border: 2px dashed #ddd; border-radius: 8px; text-align: center; background: #fafafa; }
          input[type="file"] { margin: 10px 0; }
          button { background: #007bff; color: white; border: none; padding: 15px 25px; border-radius: 8px; cursor: pointer; font-size: 16px; margin: 5px; }
          button:hover { background: #0056b3; }
          .btn-secondary { background: #6c757d; }
          .btn-secondary:hover { background: #545b62; }
          .result { margin: 20px 0; padding: 20px; border-radius: 8px; border-left: 4px solid; }
          .success { background: #d4edda; border-color: #28a745; color: #155724; }
          .error { background: #f8d7da; border-color: #dc3545; color: #721c24; }
          .info { background: #d1ecf1; border-color: #17a2b8; color: #0c5460; }
          .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid #f3f3f3; border-top: 2px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .or-divider { text-align: center; margin: 20px 0; color: #666; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🧮 SolvumAi - Math Problem Solver</h1>
          <p style="text-align: center; color: #666; margin-bottom: 30px;">Powered by AI Vision OCR & Advanced Math Solving</p>
          
          <form id="mathForm">
            <div>
              <label><strong>Enter math problem:</strong></label>
              <textarea id="problemText" placeholder="Enter your math problem here...

Examples:
• Solve: 2x + 5 = 15
• Find derivative of x³ + 2x  
• Calculate: ∫(3x² + 2x)dx
• Factor: x² - 5x + 6"></textarea>
            </div>

            <div class="or-divider">── OR ──</div>

            <div class="file-input">
              <strong>📷 Upload image with math problem</strong><br>
              <small style="color: #666;">Supports handwritten or printed math problems</small><br>
              <input type="file" id="imageFile" accept="image/*">
            </div>

            <div style="text-align: center;">
              <button type="submit" id="solveBtn">🚀 Solve Problem</button>
              <button type="button" id="testOcr" class="btn-secondary">🔍 Test OCR Only</button>
              <button type="button" id="healthCheck" class="btn-secondary">🏥 Health Check</button>
            </div>
          </form>

          <div id="result"></div>
        </div>

        <script>
          const form = document.getElementById('mathForm');
          const resultDiv = document.getElementById('result');
          const solveBtn = document.getElementById('solveBtn');
          
          function showResult(content, type = 'success') {
            const className = type === 'error' ? 'result error' : type === 'info' ? 'result info' : 'result success';
            resultDiv.innerHTML = '<div class="' + className + '">' + content + '</div>';
            resultDiv.scrollIntoView({ behavior: 'smooth' });
          }
          
          function showError(message) {
            showResult('❌ <strong>Error:</strong> ' + message, 'error');
          }

          function setLoading(loading) {
            if (loading) {
              solveBtn.innerHTML = '<span class="loading"></span>Processing...';
              solveBtn.disabled = true;
            } else {
              solveBtn.innerHTML = '🚀 Solve Problem';
              solveBtn.disabled = false;
            }
          }

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(true);
            
            const formData = new FormData();
            const problemText = document.getElementById('problemText').value;
            const imageFile = document.getElementById('imageFile').files[0];
            
            if (problemText.trim()) {
              formData.append('problem', problemText);
            }
            if (imageFile) {
              formData.append('image', imageFile);
            }
            
            if (!problemText.trim() && !imageFile) {
              showError('Please enter a math problem or upload an image');
              setLoading(false);
              return;
            }
            
            try {
              showResult('<span class="loading"></span><strong>Processing your problem...</strong> This may take up to 30 seconds for images.', 'info');
              
              const response = await fetch('/api/solve', {
                method: 'POST',
                body: formData
              });
              
              const data = await response.json();
              
              if (!response.ok) {
                showError(data.error || 'Unknown error occurred');
                return;
              }
              
              showResult(
                '<h3>📋 Problem:</h3>' +
                '<div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; font-family: monospace;">' + data.problem + '</div>' +
                '<h3>✅ Solution:</h3>' +
                '<div style="background: #f8fff9; padding: 20px; border-radius: 8px; margin: 10px 0; border: 1px solid #28a745;">' + data.solution + '</div>' +
                '<small style="color: #6c757d;">⏱️ Processed in ' + (data.processingTime || 'N/A') + 'ms</small>'
              );
            } catch (error) {
              showError('Network error: ' + error.message);
            } finally {
              setLoading(false);
            }
          });
          
          document.getElementById('testOcr').addEventListener('click', async () => {
            const imageFile = document.getElementById('imageFile').files[0];
            if (!imageFile) {
              showError('Please select an image first');
              return;
            }
            
            showResult('<span class="loading"></span><strong>Testing AI Vision OCR...</strong> Extracting text from your image.', 'info');
            
            const formData = new FormData();
            formData.append('image', imageFile);
            
            try {
              const response = await fetch('/api/ocr-preview', {
                method: 'POST',
                body: formData
              });
              
              const data = await response.json();
              
              if (!response.ok) {
                showError(data.error || 'OCR test failed');
                return;
              }
              
              showResult(
                '<h3>🔍 AI Vision OCR Results:</h3>' +
                '<div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 3px solid #28a745;">' +
                '<strong>📝 Extracted Text:</strong><br>' +
                '<code style="font-size: 14px;">"' + data.extractedText + '"</code>' +
                '</div>' +
                '<small style="color: #6c757d;">⏱️ Processed in ' + (data.processingTime || 'N/A') + 'ms</small>'
              );
            } catch (error) {
              showError('OCR test failed: ' + error.message);
            }
          });
          
          document.getElementById('healthCheck').addEventListener('click', async () => {
            showResult('<span class="loading"></span>Checking system health...', 'info');
            
            try {
              const response = await fetch('/health');
              const data = await response.json();
              
              if (!response.ok) {
                showError('Health check failed');
                return;
              }
              
              showResult(
                '<h3>🏥 System Status:</h3>' +
                '<p><strong>Status:</strong> ' + data.status + '</p>' +
                '<p><strong>OCR Method:</strong> AI Vision (Llama 3.2 Vision)</p>' +
                '<p><strong>Available Models:</strong> Mixtral-8x7B, Llama-3-8b</p>' +
                '<p><strong>Timestamp:</strong> ' + data.timestamp + '</p>'
              );
            } catch (error) {
              showError('Health check failed: ' + error.message);
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
    ocrMethod: 'AI Vision (Llama 3.2)',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

app.post('/api/solve', async (req, res) => {
  const startTime = Date.now();
  try {
    let problem = req.body.problem;

    // Handle image upload with AI OCR
    if (req.files?.image && !problem) {
      logger.info('📤 Processing image with AI OCR...');
      problem = await extractTextFromImageWithAI(req.files.image.data);
    }

    if (!problem || problem.trim().length === 0) {
      return res.status(400).json({ error: 'No problem provided or detected' });
    }

    logger.info(`🧮 Solving: "${problem.substring(0, 100)}..."`);
    const solution = await solveMathProblem(problem.trim());
    
    const processingTime = Date.now() - startTime;
    res.json({ 
      problem: problem.trim(), 
      solution,
      timestamp: new Date().toISOString(),
      processingTime
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`❌ Solve error: ${error.message}`);
    res.status(500).json({ 
      error: error.message,
      processingTime 
    });
  }
});

app.post('/api/ocr-preview', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!req.files?.image) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    logger.info('👁️ Running AI Vision OCR preview...');
    const extractedText = await extractTextFromImageWithAI(req.files.image.data);

    const processingTime = Date.now() - startTime;
    res.json({
      extractedText,
      timestamp: new Date().toISOString(),
      processingTime
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`❌ OCR Preview Error: ${error.message}`);
    res.status(500).json({ 
      error: error.message,
      processingTime
    });
  }
});

app.get('/check', async (req, res) => {
  try {
    const response = await tryModel(models[0], "What is 2 + 2?");
    res.json({ 
      ok: true, 
      answer: response.substring(0, 200),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('❌ Check failed:', err.message);
    res.status(500).json({ 
      ok: false, 
      error: err.message
    });
  }
});

// Error handling
app.use((error, req, res, next) => {
  logger.error(`❌ Unhandled error: ${error.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  console.log(`\n🎉 SolvumAi Server Ready!`);
  console.log(`➡️  Server ready at http://localhost:${PORT}`);
  console.log(`🤖 Using AI Vision OCR (No Tesseract.js dependency)`);
  console.log(`✨ Ready to solve math problems!\n`);
});
