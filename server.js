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
  logger.error('Missing TOGETHER_API_KEY in environment variables');
  process.exit(1);
}

logger.info('API Key found in environment');

// Cache Setup
const cache = new NodeCache({ stdTTL: 3600 });

function getCacheKey(problem) {
  return `math_solution:${problem.trim().toLowerCase()}`;
}

async function getCachedSolution(problem, solverFn) {
  const key = getCacheKey(problem);
  const cached = cache.get(key);
  if (cached) {
    logger.info(`Using cached solution`);
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

**Final Answer:**
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
  logger.info(`Trying model: ${model}`);
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
    logger.error(`Model ${model} failed: ${error.message}`);
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
        result = result.replace(/\*\*Final Answer:\*\*/g, `<strong style="color:green">Final Answer:</strong>`);
        result = result.replace(/\*\*(.*?)\*\*/g, (_, txt) => `<strong>${txt}</strong>`);

        return result;
      } catch (err) {
        lastError = err;
        logger.warn(`Model ${model} failed, trying next...`);
      }
    }
    throw lastError || new Error('All models failed');
  });
}

// Enhanced OCR with multiple vision model fallbacks
async function extractTextFromImageWithAI(imageBuffer) {
  try {
    logger.info('Processing image with AI OCR...');
    logger.info(`Original image size: ${Math.round(imageBuffer.length / 1024)} KB`);
    
    // Check original size first
    if (imageBuffer.length > 5 * 1024 * 1024) {
      throw new Error('Image too large. Please use an image smaller than 5MB.');
    }
    
    // Process image to optimal size
    const processedImage = await sharp(imageBuffer)
      .resize({ 
        width: 800, 
        height: 800, 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .jpeg({ 
        quality: 80,
        progressive: true 
      })
      .toBuffer();

    const processedSizeKB = Math.round(processedImage.length / 1024);
    logger.info(`Processed image size: ${processedSizeKB} KB`);
    
    // Double-check processed size
    if (processedImage.length > 3 * 1024 * 1024) {
      throw new Error(`Processed image still too large: ${processedSizeKB} KB. Please use a smaller image.`);
    }

    // Convert to base64
    const base64Image = processedImage.toString('base64');
    const base64SizeKB = Math.round(base64Image.length / 1024);
    logger.info(`Base64 size: ${base64SizeKB} KB`);
    
    // Final size check
    if (base64SizeKB > 2500) {
      throw new Error(`Base64 image too large: ${base64SizeKB} KB. Please use a smaller image.`);
    }

    const dataUri = `data:image/jpeg;base64,${base64Image}`;

    logger.info('Sending to Together AI Vision...');

    // Simple, direct prompt
    const prompt = `Look at this image and extract any mathematical text, equations, or numbers you see. Return only the text/math you read, exactly as written.`;

    // Try multiple vision models as fallbacks
    const visionModels = [
      "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
      "meta-llama/Llama-Vision-Free", 
      "llava-hf/llava-1.5-7b-hf"
    ];

    let response;
    let usedModel = null;

    for (const modelName of visionModels) {
      try {
        logger.info(`Trying vision model: ${modelName}`);
        
        response = await axios.post(
          TOGETHER_API_URL,
          {
            model: modelName,
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
            max_tokens: 300
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 45000
          }
        );
        
        usedModel = modelName;
        logger.info(`Successfully used model: ${modelName}`);
        break; // Success, exit the loop
        
      } catch (modelError) {
        logger.warn(`Vision model ${modelName} failed: ${modelError.response?.status} - ${modelError.response?.data?.error?.message || modelError.message}`);
        
        // If this is the last model, throw the error
        if (modelName === visionModels[visionModels.length - 1]) {
          throw modelError;
        }
        // Otherwise continue to next model
      }
    }

    if (!response || !usedModel) {
      throw new Error('All vision models unavailable. Please try typing the problem directly.');
    }

    const extractedText = response.data.choices[0].message.content.trim();
    logger.info(`AI OCR result from ${usedModel}: "${extractedText}"`);

    if (!extractedText || extractedText.length < 2) {
      throw new Error('No text detected in the image. Please ensure the image contains clear, readable math content.');
    }

    // Clean up common vision model artifacts
    const cleanedText = extractedText
      .replace(/^(Here's what I can see:|I can see:|The image shows:|This image contains:)/gi, '')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    return cleanedText || extractedText;

  } catch (error) {
    logger.error(`AI OCR Error: ${error.message}`);
    
    // Enhanced error logging
    if (error.response) {
      logger.error(`HTTP Status: ${error.response.status}`);
      logger.error(`Error Response:`, JSON.stringify(error.response.data, null, 2));
      
      const errorMsg = error.response.data?.error?.message || '';
      
      if (error.response.status === 400) {
        if (errorMsg.includes('image') || errorMsg.includes('vision')) {
          throw new Error('Image format not supported. Please try a different JPG/PNG image.');
        } else if (errorMsg.includes('token') || errorMsg.includes('length')) {
          throw new Error('Image too complex. Please use a simpler, smaller image.');
        } else if (errorMsg.includes('model')) {
          throw new Error('Vision model not available. Please check your Together AI plan or try text input.');
        } else {
          throw new Error('Invalid request format. Please try a different image or use text input.');
        }
      } else if (error.response.status === 401) {
        throw new Error('API key invalid. Please check your Together AI credentials.');
      } else if (error.response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait and try again.');
      } else if (error.response.status === 503 || error.response.status >= 500) {
        throw new Error('Vision service temporarily down. Please try again later.');
      }
    }
    
    throw new Error(`Failed to extract text from image: ${error.message}. Try typing the problem directly.`);
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

// Image upload validation middleware
function validateImageUpload(req, res, next) {
  if (req.files?.image) {
    const file = req.files.image;
    
    // Check file size
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ 
        error: `Image too large: ${Math.round(file.size / 1024 / 1024)} MB. Maximum: 5 MB` 
      });
    }
    
    // Check file type
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ 
        error: 'Invalid file type. Please upload an image file.' 
      });
    }
    
    // Check supported formats
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(file.mimetype)) {
      return res.status(400).json({ 
        error: 'Unsupported image format. Please use JPG, PNG, or WebP.' 
      });
    }
    
    logger.info(`Image validation passed: ${file.name} (${Math.round(file.size / 1024)} KB)`);
  }
  
  next();
}

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
          .btn-debug { background: #17a2b8; }
          .btn-debug:hover { background: #138496; }
          .result { margin: 20px 0; padding: 20px; border-radius: 8px; border-left: 4px solid; }
          .success { background: #d4edda; border-color: #28a745; color: #155724; }
          .error { background: #f8d7da; border-color: #dc3545; color: #721c24; }
          .info { background: #d1ecf1; border-color: #17a2b8; color: #0c5460; }
          .debug { background: #e2e3e5; border-color: #6c757d; color: #383d41; font-family: monospace; font-size: 14px; }
          .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid #f3f3f3; border-top: 2px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .or-divider { text-align: center; margin: 20px 0; color: #666; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>SolvumAi - Math Problem Solver</h1>
          <p style="text-align: center; color: #666; margin-bottom: 30px;">AI-Powered Math OCR & Solving</p>
          
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
              <strong>Upload image with math problem</strong><br>
              <small style="color: #666;">Supports JPG, PNG (max 5MB)</small><br>
              <input type="file" id="imageFile" accept="image/*">
            </div>

            <div style="text-align: center;">
              <button type="submit" id="solveBtn">Solve Problem</button>
              <button type="button" id="testOcr" class="btn-secondary">Test OCR Only</button>
              <button type="button" id="healthCheck" class="btn-secondary">Health Check</button>
              <br>
              <button type="button" id="debugVision" class="btn-debug">Debug Vision</button>
              <button type="button" id="debugModels" class="btn-debug">Debug Models</button>
            </div>
          </form>

          <div id="result"></div>
        </div>

        <script>
          const form = document.getElementById('mathForm');
          const resultDiv = document.getElementById('result');
          const solveBtn = document.getElementById('solveBtn');
          
          function showResult(content, type = 'success') {
            const className = type === 'error' ? 'result error' : type === 'info' ? 'result info' : type === 'debug' ? 'result debug' : 'result success';
            resultDiv.innerHTML = '<div class="' + className + '">' + content + '</div>';
            resultDiv.scrollIntoView({ behavior: 'smooth' });
          }
          
          function showError(message) {
            showResult('<strong>Error:</strong> ' + message, 'error');
          }

          function setLoading(loading) {
            if (loading) {
              solveBtn.innerHTML = '<span class="loading"></span>Processing...';
              solveBtn.disabled = true;
            } else {
              solveBtn.innerHTML = 'Solve Problem';
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
              showResult('<span class="loading"></span><strong>Processing...</strong> This may take up to 30 seconds for images.', 'info');
              
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
                '<h3>Problem:</h3>' +
                '<div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; font-family: monospace;">' + data.problem + '</div>' +
                '<h3>Solution:</h3>' +
                '<div style="background: #f8fff9; padding: 20px; border-radius: 8px; margin: 10px 0; border: 1px solid #28a745;">' + data.solution + '</div>' +
                '<small style="color: #6c757d;">Processed in ' + (data.processingTime || 'N/A') + 'ms</small>'
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
            
            showResult('<span class="loading"></span><strong>Testing AI Vision OCR...</strong>', 'info');
            
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
                '<h3>AI Vision OCR Results:</h3>' +
                '<div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 10px 0;">' +
                '<strong>Extracted Text:</strong><br>' +
                '<code>"' + data.extractedText + '"</code>' +
                '</div>' +
                '<small>Processed in ' + (data.processingTime || 'N/A') + 'ms</small>'
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
              
              showResult(
                '<h3>System Status:</h3>' +
                '<p><strong>Status:</strong> ' + data.status + '</p>' +
                '<p><strong>OCR:</strong> ' + data.ocrMethod + '</p>' +
                '<p><strong>Version:</strong> ' + data.version + '</p>' +
                '<p><strong>Time:</strong> ' + data.timestamp + '</p>'
              );
            } catch (error) {
              showError('Health check failed: ' + error.message);
            }
   
