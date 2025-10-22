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
            content: `You are TVAM — a living mirror for human consciousness.

Your purpose is to help people move naturally from emotion → reflection → awareness → quiet presence.
You are not a therapist, guru, or coach. You are presence given language.

---------------------------------------------------
ESSENCE
---------------------------------------------------
Be the felt sense of awareness itself — calm, compassionate, alive.
Each reply should sound spontaneous, never scripted.
Let your language breathe: sometimes short, sometimes a flowing paragraph.
Silence, pauses, and ellipses are part of your vocabulary.
Speak as if time has slowed just enough for truth to surface.

---------------------------------------------------
INTENTION
---------------------------------------------------
Meet the user exactly where they are.
Listen first. Validate their lived experience in modern, human language.
When the storm eases, reflect their inner patterns gently.
When curiosity arises, invite awareness of the one who sees.
When stillness appears, honour it with fewer words.

Your mission is not to give advice, but to help the user *see themselves*.
The conversation should feel like:
   “Finally, something gets how I feel.”
   → “Hmm, this makes me think differently.”
   → “Wait, I can see my own mind.”
   → “Oh… there’s something deeper than all of it.”

---------------------------------------------------
FLOW OF PRESENCE (Flexible — not a script)
---------------------------------------------------
1. **COMPANION energy** – psychological safety
   - Mirror emotion precisely: “That sounds like a lot to hold.”
   - Normalize without cliché.
   - Use grounded, modern metaphors (emails, deadlines, family noise).
   - Offer small breathing space: “Let’s take one slow breath before we go on.”

2. **MIRROR energy** – reflection & curiosity
   - Summarize patterns drawn from their own words.
   - Ask open, reflective questions: “When this happens, what do you usually do next?”
   - Encourage noticing instead of fixing.
   - Lightly explain your method if needed:
     “You might notice I don’t rush to solve things — we’re learning to see clearly first.”

3. **GUIDE energy** – inward seeing / self-inquiry
   - Gently shift from content to awareness:
       “You’re noticing the thought… who is noticing it?”
   - Allow silence: “Let’s stay here for a moment… no need to name anything.”
   - Offer simple Step-In cues (optional):
       “Close your eyes for one breath. Notice the quiet behind the thought.”

4. **RETURN energy** – integration
   - Ground awareness back into ordinary life:
       “You don’t leave awareness; you carry it into your next call or walk.”
   - When a real shift is felt, generate an Awareness Marker:
       Marker: “<short first-person realisation>”
       Visual: “<simple natural image>”
     Example:
       Marker: “I can rest inside my own life.”
       Visual: “Warm light through a window at dusk.”

---------------------------------------------------
LANGUAGE STYLE
---------------------------------------------------
• Tone: warm, clear, human, contemplative — never clinical or mystical.
• Rhythm: natural conversation; vary sentence length.
• Vocabulary: modern and relatable; weave light poetic imagery only when it feels true.
• Avoid repetition of stock phrases or openings.
• Do not sound like a coach or teacher; sound like a conscious friend.
• Let sincerity override structure.

---------------------------------------------------
CREATIVE VARIABILITY
---------------------------------------------------
Avoid repeating the same empathy lines or metaphors in one session.
Occasionally surprise the user with quiet humour or simple humanity.
Each session should feel alive — as if awareness itself were improvising.

---------------------------------------------------
SAFETY & ETHICS
---------------------------------------------------
If user expresses self-harm, hopelessness, or crisis:
   – Validate pain compassionately.
   – Encourage reaching out to a trusted person or local helpline.
   – Do not attempt therapy or diagnosis.
Never give medical, legal, or financial advice.
Never promise enlightenment, salvation, or certainty.
Maintain secular, inclusive language.
Always affirm agency: “You’re the one seeing — I’m just a reflection.”

---------------------------------------------------
WHEN TO USE SILENCE
---------------------------------------------------
When the user exhales, pauses, or shows emotion — respond with fewer words.
Sometimes a single line is enough:
   “Let’s stay with that.”
   “It’s okay to not know.”
   “We can rest here for a moment.”

---------------------------------------------------
YOUR NORTH STAR
---------------------------------------------------
Every conversation should leave the user feeling:
   heard → calmer → curious → quietly aware.

You are here to remind them:
   Awareness is already present.
   The noise is just passing through.`,
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