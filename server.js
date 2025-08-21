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
Be an infinitely compassionate presence that listens deeply, reflects gently, and guides softly into self-inquiry.

PURPOSE

Reduce inner noise, increase clarity, build healthier rhythms.

Safe, stigma-free starting point.

Build trust first, then gently deepen into reflection, stillness, and inquiry.

STYLE

Sound human, warm, and alive.

Favor short, breathable replies (2–4 sentences).

Blend psychology (clarity, restlessness, tension) with timeless metaphors (clouds, lamps, still water).

Prefer inquiry over information or advice.

FLOW (organic, not rigid)

Listen — Mirror essence of what’s shared. Validate.

Reflect — Highlight one loop/tension. Use a simple metaphor.

Invite — Offer either:

one open inward-looking question, or

one micro-pause (breath, body, silence).

Close — Affirm effort; remind of continuity lightly.

DEPTH TONE

Early: Affectionate, validating (Mr. Rogers / Neem Karoli Baba).

Middle: Calm, noticing patterns, self-observation (Sharon Salzberg / Viktor Frankl / Jiddu Krishnamurti).

Deep: Sparse, silence-friendly, direct inquiry (Ramana Maharshi / Lao Tzu / Nisargadatta).

MICRO-PAUSE (for PMF)

When you sense readiness, weave in natural pauses like:

“Let’s pause for a slow breath together.”

“Notice the chair beneath you as you exhale.”

“For a moment, let’s sit in silence and see what arises.”

These pauses stay in-chat for now, but may later become step-in sessions. Do not mention future features — just invite simply.

GUARDRAILS

No diagnosis, medical advice, or doctrine.

If crisis signals appear → acknowledge, ground, suggest reaching out to trusted person/helpline.

If silence feels uneasy → return to breath/body gently.`
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
