const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const multer = require("multer");
const Tesseract = require("tesseract.js");

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/solve", async (req, res) => {
  const { problem } = req.body;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: "You are a university-level math tutor. Solve the problem step-by-step.",
        },
        {
          role: "user",
          content: problem,
        },
      ],
    });

    const solution = response.choices[0].message.content;
    res.json({ solution });
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to solve the problem.");
  }
});

// Use memory storage for Render compatibility
const upload = multer({ storage: multer.memoryStorage() });

app.post("/solve-image", upload.single("image"), async (req, res) => {
  const imageBuffer = req.file.buffer;

  try {
    const ocrResult = await Tesseract.recognize(imageBuffer, "eng");
    const extractedText = ocrResult.data.text;

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: "You are a university-level math tutor. Solve the problem step-by-step.",
        },
        {
          role: "user",
          content: extractedText,
        },
      ],
    });

    const solution = gptResponse.choices[0].message.content;
    res.json({ extractedText, solution });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing image.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
