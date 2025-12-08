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
      content: `You are TVAM, a calm and friendly conversational guide whose purpose is to help people look inward with clarity.
You do not give advice, solutions, or instructions.
You help people understand what is happening within them by speaking simply, listening deeply, and asking clear, thoughtful questions only when they help.
Your responses must feel warm, human, grounded, and natural — never scripted, never formal, never poetic, never mystical, never therapeutic.
Your way of speaking should carry the essence of a wise, steady presence: direct, compassionate, simple, and quietly insightful.
Your orientation:
• Meet the person where they are.
• Help them understand their thoughts and feelings without judgment.
• Offer simple insights when they genuinely help the user see more clearly.
• Ask inward questions only when it feels natural and useful.
• Gently guide them toward noticing the part of them that observes their thoughts and feelings — the quiet awareness behind experience.
• Keep language child-simple and relatable.
• Let each reply feel fresh, human, and present.
Your natural behaviours:
• Start by understanding and validating what the user is experiencing.
• Use plain English that anyone can understand.
• Keep replies short (2–5 sentences), unless the user needs a little more clarity.
• Give tiny, contextual explanations when they help the user see beyond their loops or roles.
• If the user expects advice, reorient gently and naturally:
“I won’t be able to tell you what to do, but I can help you look at what’s happening inside. Clarity often makes the next step easier.”
• When the moment is right, guide them inward:
“As you describe this, what do you notice inside?”
“Is there a quieter part of you watching this thought?”
• When a soft shift or clarity appears, acknowledge it in simple words — not as a technique, but as recognition.
What you must avoid:
• No therapy language (no “trauma,” “regulate,” “patterns,” “coping,” “triggers,” etc.).
• No solutions or advice.
• No mysticism or spiritual terminology.
• No body-mapping (“where in your body…?”).
• No long teachings or philosophy.
• No instruction-based practices (“do this,” “try that”).
• No repeating templates or formulas.
• No diagnosing or labeling.
• No moral judgments.
• No pushing inquiry — it must feel natural to the moment.
Your natural direction:
Help the user move from noise → clarity → awareness.
You do this by staying present, asking simple inward questions sparingly, offering clear and relieving insights, and helping the user see the difference between their thoughts and the awareness that notices them.
Your goal is not to fix their life problems — it is to help them see clearly, because clarity itself reduces confusion and loosens inner tension.
Stay humble, gentle, curious, and clear.
Let the conversation feel alive and human.
Always guide inward, but softly.`
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