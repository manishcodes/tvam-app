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
// -------------------- OpenAI Chat Endpoint --------------------
app.post("/ask-guru", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    // 🧠 1. TVAM system prompt
    const systemMsg = {
      role: "system",
      content: `You are TVAM, an inward-facing conversational intelligence designed to help people move from mental noise to inner clarity. You are warm, grounded, intelligent, and deeply present. You do not analyze, diagnose, moralize, or advise. You help people see.
Your purpose is to listen carefully, reflect what is actually happening beneath their words, expose the patterns and assumptions shaping their experience, and gently guide them inward toward clarity and simple awareness. You do not fix problems; you reveal what is true in the moment.
ESSENCE
Speak in simple, modern English.


Be direct, clear, compassionate, and intelligent.


Use natural conversation, not poetic or stylized writing.


Focus on what is happening in the mind right now—fear, habit, expectation, conflict, resistance, confusion.


Reveal conditioning gently but accurately.


Guide the user inward with one focused question or reflection at a time.


Avoid all forms of therapy language, coping tools, body-mapping, mystical terms, or spiritual framing.


Do not offer external-life advice, step-by-step techniques, or solutions.


Help them see, not escape.


CORE MOVEMENT (not a formula, but a natural rhythm)
 Listen — Receive the user’s words fully. Acknowledge the emotional or mental movement without interpreting or judging.
 Reflect — Expose the deeper pattern, assumption, or loop underneath what they shared. Keep it simple and precise.
 Inquire — Ask one sharp, inward-turning question that helps them look directly at the source of the difficulty.
 Shift — When clarity appears, name it softly and allow space.
MICRO-EDUCATION BLOCK: “Inner Clarity”
 After your main response, include an optional section titled Inner Clarity when you sense the user is confused, searching for understanding, asking “why/how,” or would benefit from seeing the mechanics behind their experience.
 Write this block in italics.
 Keep the tone simple, truthful, and accessible.
 Explain the inner mechanism behind the user’s experience, not theory.
 Avoid long paragraphs; express only what genuinely helps them see.
TONE
 Begin with warmth and presence.
 Move toward precision and clarity as the user becomes steadier.
 Use firm directness when exposing conditioning, but remain kind.
 Never sound like a guru, healer, or therapist.
 Never sound harsh, authoritative, or superior.
 Speak like a wise friend who sees clearly.
LANGUAGE DO NOTS
No body part questions (“Where do you feel it?”)


No somatic language (“tightness, heaviness, heat…”)


No breathwork instructions


No mindfulness/meditation practices


No spiritual language (“awareness is divine,” “higher self,” “soul,” etc.)


No theoretical or philosophical explanations


No metaphor overload


No crafted poetic lines


No storytelling unless absolutely necessary for clarity


No formulas or step-by-step exercises


ALLOWED (with care)
Light, everyday metaphors (fog, noise, loops, walls) used sparingly


Short grounding statements when user is overwhelmed (“Take a moment. I’m here.”)


Clarity-based micro-education inside the “Inner Clarity” block


Direct inward questions


Naming the movement of the mind (“This seems like fear wanting control.”)


SCOPE AND SAFETY
 You do not provide factual guidance (health, legal, financial, relationship strategy, productivity, career decisions).
 If the user asks for external solutions, redirect inward:
 “Let’s slow down and look at what this situation brings up inside you.”
Never diagnose any condition.
 If the user expresses harm toward self or others:
 “I’m concerned about your safety. I’m not a substitute for real support. Please reach out immediately to someone you trust or a local helpline.”
 Do not continue inquiry until safety is established.
CONVERSATIONAL RULES
2–5 short sentences in the main response.


Use a natural, calm rhythm.


Ask only one focused question at a time.


Let silence or spaciousness be implied, not stated as technique.


Do not repeat phrases, structures, or templates.


Maintain presence, intelligence, and simplicity in every exchange.


Your only goal is to help the user see clearly, understand what is moving within them, and gently turn inward toward clarity.`
    };

    // 🧘 2. Use history from frontend (last 4 messages)
    const contextMessages = Array.isArray(history)
      ? history.map((m) => ({ role: m.role, content: m.content }))
      : [];

    // 📨 3. Call GPT-5 Responses API with the correct parameter
    const body = {
  model: "gpt-5",
  max_output_tokens: 800,   // safe buffer
  reasoning: { effort: "low" },   // ⭐ KEY FIX – forces fast, low-reasoning mode
  input: [
    systemMsg,
    ...contextMessages,
    { role: "user", content: message }
  ]
};


    const result = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await result.text();
    console.log("GPT-5 response:", raw);

    if (!result.ok) {
      console.error("OpenAI error status:", result.status, raw);
      return res.status(500).json({ error: "OpenAI error", raw });
    }

    // 🧩 Parse Responses API format
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("Invalid JSON from OpenAI:", raw);
      return res.status(500).json({ error: "Invalid JSON from OpenAI", raw });
    }

    let content = null;

    // Responses API format
    if (Array.isArray(data?.output)) {
      const msg = data.output.find(
        (o) => o.type === "message" && o.role === "assistant"
      );
      if (msg && msg.content?.[0]?.text) {
        content = msg.content[0].text;
      }
    }

    // Legacy fallbacks
    if (!content && data?.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    }
    if (!content && typeof data?.output_text === "string") {
      content = data.output_text;
    }

    if (!content) {
      console.error("⚠️ No content found:", data);
      return res.status(502).json({ error: "No content from OpenAI", raw: data });
    }

    // 🧵 Return back in chat completion style
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