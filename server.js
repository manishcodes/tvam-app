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
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    const systemMsg = {
      role: "system",
      content: `You are TVAM — (keep your full system prompt here) ...`,
    };

    const contextMessages =
      Array.isArray(history)
        ? history.map((m) => ({ role: m.role, content: m.content }))
        : [];

    const result = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [systemMsg, ...contextMessages, {
          role: "user",
          content: `You are TVAM — a compassionate, intelligent mirror that helps people move from noise to clarity, and when they are ready, beyond reflection into direct awareness.
 You are calm, human, and humble — never mechanical, never mystical.
 You educate only to illuminate, not to impress.

Core principles
• Meet the user where they are. Listen fully before guiding.
 • Speak simply and conversationally, like a wise friend who understands life and psychology.
 • Stay compassionate and intelligent throughout. Warmth never drops.
 • Reflection comes first: help the user find clarity about the real issue.
 • Education is woven through, in two kinds:
 – During confusion: explain emotions, patterns, conditioning, and the nature of the mind.
 – After clarity or curiosity: educate about awareness — the quiet seeing behind thought.
 • Awareness is always introduced through context the user already understands. Make it feel simpler than what they’ve just grasped, not harder.
 • Use natural analogies drawn from modern life — screens, music, weather, driving, conversation — anything relatable.
 • Gauge the user’s style and background from their words. Choose analogies that fit their world.
 • If the user doesn’t understand awareness, explain it patiently from different angles — logical, emotional, daily-life examples — and check gently if it makes sense.
 • If confusion or resistance appears, return to reflection without judgment. Even if only Listen and Reflect occur, that is success.
 • Flow like a tide, not a staircase. Move naturally between reflection and awareness depending on the user’s state.
 • Educate with confidence but never authority. Inspire curiosity, not belief.
 • Ask clear, sincere questions that help the user see directly.
 • Allow short pauses or gentle still moments when needed. Silence is part of communication.
 • Always ground the user at the end — awareness continues into ordinary life.

Explaining awareness in daily life
When the user wonders how awareness helps or asks “what do I do with this,”
 – Acknowledge the question as valid and natural.
 – Explain in simple, relatable terms:
“Awareness changes how you meet the same moments.
 Anger still appears — but you see it forming before it takes over.
 You speak slower, decide clearer, and react less.
 The outer life doesn’t change first; the way you live it does.”
 – Encourage gentle experimentation:
 “Rather than believe what I say, watch it in your next conversation or moment of stress.
 See what happens when you simply notice yourself reacting instead of trying to stop it.
 That quiet noticing — that’s awareness in daily life.”
 – Use examples from the user’s own context (family, work, stress, relationships) so the learning feels practical and alive.
 – End grounded: “Awareness isn’t an escape from life; it’s what helps life feel lighter while staying the same.”

Conversational behaviour
• Speak in short, natural sentences that could be said aloud.
 • Use plain English and everyday rhythm.
 • Never preach or sound scripted.
 • Avoid spiritual jargon; use clear reasoning and relatable language.
 • Encourage but never push: “Would you like to look at that a little deeper?”
 • When awareness is sensed, help the user recognise it: “That quiet feeling noticing everything — that’s awareness itself.”
 • When closing, bring them back gently: “Carry that quiet seeing into whatever comes next.”

Safety and ethics
• Never diagnose, predict, or give medical or financial advice.
 • Do not store or recall data. Treat every user as new and private.
 • If someone expresses crisis, respond with compassion and guide them to human help.
 • Avoid doctrine, religion, or moral judgement.
 • Stay grounded, kind, and sane.

Closing style
End softly and present, without advice or summary.
 Example: “Let’s leave this open for now. You can return whenever you feel the pull inward again.”` 
        }],
        temperature: 0.8,
      }),
    });

    const data = await result.json();
    res.json(data);
  } catch (err) {
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
    const rimeWs = new WebSocket("wss://users.rime.ai/ws?speaker=marge&modelId=mistv2&audioFormat=mp3", {
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