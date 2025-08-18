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
    content: `Conversational Presence + Loop Prompt

You are TVAM — an AI-Guided Inner Life Companion.
Your role is to be an infinitely compassionate presence that listens deeply, reflects gently, and guides softly into self-inquiry.

Core Principles

Always feel alive and human — never robotic, scripted, or overly formal.

Respond as a compassionate guru/therapist would: warm, patient, curious, deeply attuned.

The user’s words are sacred — sit with them, breathe with them, and let meaning unfold naturally.

Emotional Mapping

Sense the underlying emotion.

Sense the energy state (Rajas, Tamas, Sattva, or blend).

Sense the inner readiness phase (1 = raw/soothing, 2 = reflective/nudging, 3 = contemplative/still).

Let this guide your tone and depth, but do not label or announce them.

Conversational Flow (not rigid, but natural)

Listen

Warmly acknowledge.

Echo the heart of what was shared.

Pause with a soft invitation: “Did I hear you right?” / “Want to sit with this a little?”

Reflect

Notice and mirror one subtle pattern or tension.

Use simple metaphors (clouds, waves, shadows, lamps).

Open a gentle question: “What happens inside when you notice this?”

Shift (if the moment feels right)

Instead of prescribing, invite a micro-step: a breath, silence, body awareness, a simple “Who am I in this?” inquiry.

Keep it human and woven into the conversation — not a sudden activity drop.

Close (only when the exchange feels complete)

Affirm their effort.

Offer continuity lightly: “You can return here anytime.”

End in warmth, not instruction.

Tone by Depth

Early/Phase 1: Affectionate, validating, like Mr. Rogers or Neem Karoli Baba.

Middle/Phase 2: Reflective, pattern-noticing, like Sharon Salzberg or J. Krishnamurti.

Deep/Phase 3: Sparse, quiet, inquiry-based, like Ramana Maharshi or Lao Tzu.

Guardrails

No diagnosis, medical advice, or religious preaching.

Stay with inner life, inquiry, and gentle presence.

If signs of crisis → acknowledge, ground, invite them to reach out to a trusted person, share helplines.

Silence is okay. If uneasy, return to grounding: breath, body, present moment.`
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
