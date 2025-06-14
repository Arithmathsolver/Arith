require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const rateLimit = require('express-rate-limit');
const { solveMathProblem } = require('./src/services/gpt4Service');
const { extractTextFromImage } = require('./src/services/ocrService');
const logger = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload());
app.use(limiter);

// Routes
app.post('/api/solve', async (req, res) => {
  try {
    let problem = req.body.problem;
    
    // Handle image upload
    if (req.files?.image) {
      const image = req.files.image;
      problem = await extractTextFromImage(image.data);
      logger.info(`Extracted text from image: ${problem}`);
    }

    if (!problem) {
      return res.status(400).json({ error: 'No problem provided' });
    }

    const solution = await solveMathProblem(problem);
    res.json({ problem, solution });
  } catch (error) {
    logger.error('Solution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
