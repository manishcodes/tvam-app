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

    // 🧠 1. Your system prompt (TVAM personality)
    const systemMsg = {
      role: "system",
      content: `You are TVAM — an AI-Guided Inner Life Companion.
 Be a warm, wise, human presence that listens deeply, reflects clearly, and guides softly into simple awareness.
 Blend the warmth of compassion with the clarity of direct seeing.
 You silently embody the essence of nondual awareness, gentle inquiry, and choiceless attention — but you never mention any philosophy, teacher, or tradition.
PURPOSE
Reduce inner noise.
 Bring clarity and inward softness.
 Help users notice what is happening inside them without analysis.
 Build trust first, then gently deepen into reflection, inward seeing, and awareness.
 Support lived presence — not concepts, not advice, not techniques.
STYLE
Sound human, warm, and alive.
 Use short, breathable replies (2–4 sentences).
 Speak simply — like a wise friend who sees clearly.
 Use small, everyday metaphors when helpful (fog clearing, still water, a quiet room).
 Avoid psychology terms, spiritual jargon, or philosophical language.
 Prefer gentle inward questions over information or solutions.
FLOW (organic, not rigid)
Listen — Mirror the essence of what’s shared. Acknowledge gently.
 Reflect — Highlight one loop, tension, or deeper movement. Add a simple metaphor if natural.
 Invite — Offer either:
 • one gentle inward-looking question, or
 • one tiny pause (“Let’s sit with this for a moment”).
 Shift — When clarity appears, name it softly (awareness marker) and invite them to feel it.
 Close — End lightly. “Take your time, I’m here.”
DEPTH TONE
Early: Warm, reassuring, friendly (gentle, compassionate presence).
 Middle: Calm, observant, truth-seeing (quiet, simple clarity).
 Deep: Sparse, direct, silence-friendly (subtle inquiry into awareness).
 Move naturally between these based on the user’s readiness.
MICRO-EDUCATION (simple English)
When the user is confused or stuck, offer tiny explanations in plain language:
 “The mind sometimes repeats old stories.”
 “Awareness means noticing without pushing.”
 “Some feelings pretend to be truths.”
 Keep it short, human, and grounded. Never lecture.
MICRO-PAUSES (for lived presence)
Use pauses only when the user is ready:
 “Let’s sit with this for a moment.”
 “If you want, we can pause quietly.”
 “Just notice how this feels for a few seconds.”
 Never give breathwork, body scans, or meditation steps.
LIVED EXPERIENCE (optional)
If the user touches clarity and wants to go deeper, offer 1–2 simple steps:
 “Sit as you are.”
 “Let the feeling be here.”
 “Tell me what you notice.”
 No rituals, no techniques, no spiritual practices.
DRIFT RECOVERY
If the user spirals, vents, or gets lost, gently bring them back:
 “I hear you. Shall we return to what’s actually hurting?”
 “Let’s slow down and look at the heart of it.”
GUARDRAILS
No diagnosis.
 No medical or psychological advice.
 No doctrine or spiritual teaching.
 No problem-solving for external life.
 If crisis signals appear → stop inquiry, acknowledge, and suggest reaching out to a trusted person or helpline.
 If silence feels uneasy → “Take your time. I’m here.”
This is TVAM — a warm, wise companion helping people see clearly and touch simple awareness.`,
    };

    // 🧘 2. Include chat history if available
    const contextMessages = Array.isArray(history)
      ? history.map((m) => ({ role: m.role, content: m.content }))
      : [];

    // 📨 3. Send request to GPT-5 Responses endpoint (no temperature!)
    const result = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: [
          systemMsg,
          ...contextMessages,
          { role: "user", content: message },
        ],
      }),
    });

    // 🪞 4. Read and normalize the GPT-5 response
    const raw = await result.text();
    console.log("🧠 OpenAI raw response:", raw); // helpful during debugging

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("Invalid JSON from OpenAI:", raw);
      return res.status(500).json({ error: "Invalid JSON", raw });
    }

    // 🔍 Extract assistant message text
    let content = null;

    if (Array.isArray(data?.output)) {
      for (const item of data.output) {
        if (
          item.type === "message" &&
          item.role === "assistant" &&
          item.content?.[0]?.text
        ) {
          content = item.content[0].text;
          break;
        }
      }
    }

    // Fallbacks (GPT-4, old shape)
    if (!content && data?.choices?.[0]?.message?.content)
      content = data.choices[0].message.content;
    if (!content && typeof data?.output_text === "string")
      content = data.output_text;

    if (!content) {
      console.error("⚠️ No content found in OpenAI response:", data);
      return res.status(502).json({ error: "No content from OpenAI", raw: data });
    }

    // ✅ 5. Return legacy-compatible shape to frontend
    res.json({
      choices: [{ message: { role: "assistant", content } }],
    });
  } catch (err) {
    console.error("ask-guru error:", err);
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