import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import WebSocket, { WebSocketServer } from "ws";

dotenv.config();

// -------------------- Firebase Setup --------------------
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountBase64) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env variable");
const serviceAccountJson = JSON.parse(Buffer.from(serviceAccountBase64, "base64").toString("utf-8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccountJson) });

// -------------------- Express Setup --------------------
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// -------------------- OpenAI Chat Endpoint --------------------
app.post("/ask-guru", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    const result = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
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

If silence feels uneasy → return to breath/body gently.`,
          },
          { role: "user", content: message },
        ],
        temperature: 0.8,
      }),
    });

    const data = await result.json();
    res.json(data);
  } catch (err) {
    console.error("❌ /ask-guru error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- WebSocket Bridge for Rime.ai --------------------
const wss = new WebSocketServer({ noServer: true });

if (process.env.NODE_ENV === "development") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}



// Integrate WebSocket upgrade with Express server
const server = app.listen(process.env.PORT || 3000, () =>
  console.log(`✅ Server running on port ${process.env.PORT || 3000}`)
);

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/tts") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (clientWs) => {
  console.log("🔊 Client connected to /tts");

  // Handle text message from client (the text to speak)
  clientWs.on("message", async (msg) => {
    const text = msg.toString().trim();
    if (!text) return;

    console.log(`🗣️ Sending text to Rime.ai: ${text}`);

    // Connect to Rime.ai
    const rimeWs = new WebSocket("wss://users.rime.ai/ws?speaker=cove&modelId=mistv2&audioFormat=mp3", {
      headers: { Authorization: `Bearer ${process.env.RIME_API_KEY}` },
    });

    let audioData = [];

    rimeWs.on("open", async () => {
      // Send tokens (clean, not streaming)
      const tokens = text.split(/\s+/);
      for (const token of tokens) {
        rimeWs.send(token + " ");
      }
      rimeWs.send("<EOS>");
    });

    // Collect audio chunks
    rimeWs.on("message", (chunk) => {
      if (Buffer.isBuffer(chunk)) {
        audioData.push(chunk);
      }
    });

    rimeWs.on("close", () => {
      console.log("🎧 Rime.ai finished sending audio");
      const combined = Buffer.concat(audioData);
      clientWs.send(combined); // Send full MP3 buffer to client
      clientWs.close();
    });

    rimeWs.on("error", (err) => {
      console.error("💥 Rime WebSocket error:", err);
      clientWs.send(JSON.stringify({ error: "TTS generation failed" }));
      clientWs.close();
    });
  });

  clientWs.on("close", () => console.log("❌ Client disconnected from /tts"));
});