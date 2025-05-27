const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const axios = require("axios");
const path = require("path");
const { OpenAI } = require("openai");
const fs = require("fs");

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
const upload = multer({ storage: multer.memoryStorage() });

const solveWithGPT = async (problem) => {
  try {
    const prompt = `Solve this math problem with steps: ${problem}`;
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const steps = response.choices[0].message.content.trim();
    return { provider: "gpt", steps };
  } catch (err) {
    console.error("GPT error:", err.message);
    return null;
  }
};

const solveWithWolfram = async (query) => {
  try {
    const response = await axios.get("https://api.wolframalpha.com/v2/query", {
      params: {
        input: query,
        appid: process.env.WOLFRAM_APP_ID,
        output: "JSON",
        podstate: "Step-by-step solution",
      },
    });

    const pods = response.data.queryresult.pods;
    const stepPod = pods.find((pod) =>
      pod.title.toLowerCase().includes("step-by-step")
    );

    if (stepPod) {
      return { provider: "wolfram", steps: stepPod.subpods[0].plaintext };
    } else {
      return null;
    }
  } catch (err) {
    console.error("Wolfram error:", err.message);
    return null;
  }
};

const solveWithNewton = async (operation, expression) => {
  try {
    const url = `https://newton.now.sh/api/v2/${operation}/${encodeURIComponent(expression)}`;
    const response = await axios.get(url);
    return { provider: "newton", steps: response.data.result };
  } catch (err) {
    console.error("Newton error:", err.message);
    return null;
  }
};

app.post("/solve", async (req, res) => {
  const { problem, operation, expression } = req.body;

  const gptResult = await solveWithGPT(problem);
  if (gptResult) return res.json(gptResult);

  const wolframResult = await solveWithWolfram(problem);
  if (wolframResult) return res.json(wolframResult);

  const newtonResult = await solveWithNewton(operation, expression);
  if (newtonResult) return res.json(newtonResult);

  res.status(500).send("Failed to solve the problem.");
});

app.post("/solve-image", upload.single("image"), async (req, res) => {
  const imageBuffer = req.file.buffer;

  try {
    const ocrResult = await Tesseract.recognize(imageBuffer, "eng");
    const extractedText = ocrResult.data.text;

    const gptResult = await solveWithGPT(extractedText);
    if (gptResult) return res.json({ extractedText, ...gptResult });

    const wolframResult = await solveWithWolfram(extractedText);
    if (wolframResult) return res.json({ extractedText, ...wolframResult });

    const newtonResult = await solveWithNewton("simplify", extractedText);
    if (newtonResult) return res.json({ extractedText, ...newtonResult });

    res.status(500).send("Error processing image.");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing image.");
  }
});

// GPT Vision Extraction Route
app.post("/extract-gpt", upload.single("image"), async (req, res) => {
  try {
    const base64Image = req.file.buffer.toString("base64");
    const imageDataUrl = `data:image/jpeg;base64,${base64Image}`;

    const visionPrompt = [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the math problem text from this image" },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ];

    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: visionPrompt,
      max_tokens: 500,
    });

    const extractedText = visionResponse.choices[0].message.content.trim();

    const gptResult = await solveWithGPT(extractedText);
    if (gptResult) return res.json({ extractedText, ...gptResult });

    const wolframResult = await solveWithWolfram(extractedText);
    if (wolframResult) return res.json({ extractedText, ...wolframResult });

    const newtonResult = await solveWithNewton("simplify", extractedText);
    if (newtonResult) return res.json({ extractedText, ...newtonResult });

    res.status(500).send("Error solving extracted math.");
  } catch (err) {
    console.error("GPT Vision error:", err.message);
    res.status(500).send("Vision model failed.");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
