const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const axios = require("axios");

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Use memory storage for Render compatibility
const upload = multer({ storage: multer.memoryStorage() });

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

app.post("/solve-wolfram", async (req, res) => {
  const { problem } = req.body;

  const result = await solveWithWolfram(problem);
  if (result) {
    return res.json(result);
  } else {
    res.status(500).send("Failed to get step-by-step solution from Wolfram Alpha.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("Arith API is running. Use POST /solve or /solve-image.");
});
