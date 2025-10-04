import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountBase64) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env variable");
const serviceAccountJson = JSON.parse(Buffer.from(serviceAccountBase64, "base64").toString("utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccountJson) });

const app = express();
app.use(cors());
app.use(bodyParser.json());

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

// Firebase auth middleware
async function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const idToken = authHeader.split("Bearer ")[1];
  try { req.user = await admin.auth().verifyIdToken(idToken); next(); } 
  catch(err){ return res.status(401).json({ error: "Unauthorized" }); }
}

// Ask Guru
app.post("/ask-guru", authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    const userId = req.user.uid;
    if (!conversations[userId]) conversations[userId] = [SYSTEM_PROMPT];
    conversations[userId].push({ role: "user", content: message });

    const result = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: conversations[userId],
        temperature: 0.9,
      }),
    });

    const data = await result.json();

    if (data.choices && data.choices[0]) conversations[userId].push({ role: "assistant", content: data.choices[0].message.content });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
