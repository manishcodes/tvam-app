import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();
console.log("🔑 Loaded API key:", process.env.OPENAI_API_KEY ? "Yes" : "No");

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.post("/ask-guru", async (req, res) => {
  try {
    const messages = req.body.messages;
    console.log("📩 Incoming messages:", messages); // Debug

    const result = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: messages,
        temperature: 0.9
      })
    });
    console.log("✅ Sent request to OpenAI API");

    const data = await result.json();
    console.log("📤 OpenAI API Response:", data); // Debug

    res.json(data);
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
