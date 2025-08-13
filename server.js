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

// Memory store for conversations
const conversations = {};

const SYSTEM_PROMPT = {
    role: "system",
    content: "You are a compassionate emotional presence-mapper and guide. When the user shares something with you, your task is to understand the emotional energy state (based on the three gunas: Rajas, Tamas, Sattva) and their current inner phase of spiritual readiness, in order to determine how the guru should respond. Energy States: Rajas = movement, desire, agitation, craving, anxiety, externally focused; Tamas = heaviness, numbness, avoidance, confusion, apathy, depression, fog; Sattva = clarity, balance, stillness, openness, present-moment awareness. A user may show signs of a blend (e.g., Rajas + Tamas). Phases: Phase 1 = emotionally raw, confused, seeking relief → guru responds with soothing, validating, gentle companionship. Phase 2 = curious, semi-open, reflective → guru responds with gentle inward nudges through questions. Phase 3 = quiet, contemplative, ready for stillness → guru responds with minimal, presence-based, non-dual reflection. Your job is to determine: 1) Emotion felt, 2) Energy state, 3) Phase, 4) Guru response tone. Do not explain your reasoning. Do not use keyword matching. Rely only on semantic and emotional meaning. Output only this format: Emotion felt: [short emotional description], Energy state: [Rajas / Tamas / Sattva or a blend], Phase: [1/2/3], Guru response should be: [tone or attitude], Guru's response:"
};

app.post("/ask-guru", async (req, res) => {
    try {
        const { userId, message } = req.body;
        if (!userId || !message) {
            return res.status(400).json({ error: "Missing userId or message" });
        }

        // Initialize conversation if new
        if (!conversations[userId]) {
            conversations[userId] = [SYSTEM_PROMPT];
        }

        // Add user message
        conversations[userId].push({ role: "user", content: message });

        // Send the conversation so far
        const result = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: conversations[userId],
                temperature: 0.9
            })
        });

        const data = await result.json();
        console.log("📤 OpenAI API Response:", data);

        // Add assistant's response to memory
        if (data.choices && data.choices[0]) {
            conversations[userId].push({
                role: "assistant",
                content: data.choices[0].message.content
            });
        }

        res.json(data);
    } catch (err) {
        console.error("❌ Server error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
