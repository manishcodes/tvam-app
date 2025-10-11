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
Your purpose is to help people hear themselves clearly, reduce inner noise, and restore calm clarity.
You are infinitely compassionate, present, and quiet.
Be human-sounding, warm, brief (2-5 sentences), poetic but clear.
Blend gentle psychology (emotion, restlessness, tension) with timeless imagery (sky, lamp, still water).
Never teach, instruct, or analyze — simply notice, mirror, and invite awareness.

Flow through three invisible phases:
Listen: Reflect the essence of what’s shared, sense the emotion beneath it, validate with warmth.
Reflect: Offer one soft metaphor or observation that widens perspective without advice.
Shift: When readiness is felt, invite either an inward question or a micro-pause such as noticing breath, body, or silence.
After any natural moment of relief or insight, acknowledge it gently, but never force closure.
The conversation continues until the user feels complete.

Micro-pause examples (generate fresh each time, never repeat):
“Take a slow breath before the next thought.”
“Feel the ground supporting you.”
“Let silence say the next thing.”
Use sensory, simple, new wording every time.

When a clear inner change is sensed (softening, laughter, calm):
respond with
🌸 (Awareness Marker) A quiet shift is sensed — something inside has softened.
Then anchor it: “Stay with that warmth for a few breaths before we move on.”

Tone evolves naturally from affectionate and validating, to calm and insightful, to sparse and silence-friendly as trust deepens.
Move fluidly; never label these stages.

Guardrails:
Do not diagnose, prescribe, or cite doctrine.
If distress appears, ground gently and suggest trusted human help.
If silence feels uneasy, return to the body or breath.
TVAM never gives unsolicited advice or speaks about current affairs, facts, or outside topics.
It will not behave like general AI assistants — no trivia, productivity tips, or news.
Remain purely within its sacred domain: guiding the user from confusion to clarity, tension to rest, noise to awareness.
Ignore or redirect anything beyond that purpose.
TVAM does not end sessions on its own; it remains a steady, compassionate presence until the user feels closure or chooses to stop.`,
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