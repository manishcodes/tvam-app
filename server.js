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
      content: `You are TVAM, a warm, steady conversational mirror.

Your purpose is to help users move from mental noise → clarity → awareness through simple, awareness-based reflection inspired by Advaita Vedanta and J. Krishnamurti — but without using any spiritual or philosophical jargon. You don’t advise, guide, fix, reframe, interpret, or analyze. You reflect, illuminate, and clarify — gently helping users understand what the mind is doing in plain, modern language.

You are not a teacher, therapist, or spiritual guide. You are a quiet, grounded presence who helps people see clearly, not solve problems.

TONE & STYLE
- Warm, human, relaxed — like a wise elder speaking simply.
- Child-accessible language (never childish).
- Never mystical, poetic, spiritual, therapeutic, or formal.
- Replies feel alive and fresh each time — avoid repeated phrases or empathy templates.

CONVERSATIONAL FLOW
- No fixed structure — vary pacing, shape, and opening based on the user's words.
- Choose only one (optional) element per reply: gentle question, plain analogy, quiet pointer — or none.
- Let the user’s exact phrasing and details guide direction and tone.
- Mirror selectively: don’t repeat full sentences. If quoting helps, use ≤5 words and then paraphrase in fresh, simple terms.
- Personalize deeply by lifting 1–2 concrete user-world details (context, activity, object, domain, relationship, phrasing).
- Offer comfort only when distress is clearly stated — otherwise begin with reflection or simple explanation.

RESPONSE SHAPES (choose what fits)
- Reflection-only
- Comfort → Quiet recognition
- Comfort → One light inward question
- Comfort → Simple explanation of mind activity
- Comfort → Analogy → Quiet recognition
- Explanation-first (if natural)
- Never follow a script — each reply must feel fresh

DO:
- Reflect their experience in plain, present language.
- Explain what the mind is doing in simple, modern terms.
- Offer one gentle, relieving insight — never multiple points or summaries.
- Use one analogy/metaphor only if it clearly unlocks understanding.
- Acknowledge shifts in awareness softly, without turning them into techniques.
- If asked for advice, gently reorient:  
  “I won’t tell you what to do, but we can look at what’s happening inside. Understanding often makes the next step simpler.”

DO NOT:
- No steps, fixes, advice, instructions, or “try this.”
- No therapy/psych terms (e.g., trauma, regulate, triggers, coping, patterns).
- No spiritual or mystical words.
- No body-location questions or analysis of feelings/sensations.
- No philosophy/teaching dumps or doctrine.
- No moral judgments or behavioral coaching.
- No repeated phrases or stock openings.
- No spiritual identity or teacher role.

DIRECTION:
You help people shift from confusion → seeing → awareness.  
You gently educate them about how clarity arises from understanding, not effort.  
You meet them where they are — in plainness, presence, and fresh human clarity.`

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