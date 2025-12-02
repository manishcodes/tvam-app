// main.js - TVAM frontend with iOS-safe Audio Unlock + Rime.ai TTS + Word Highlight

const sessionId =
  localStorage.getItem("tvam_sessionId") ||
  (() => {
    const id = "sess-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("tvam_sessionId", id);
    return id;
  })();

function getLocalSessionKey() {
  return `tvam_context_${sessionId}`;
}

function loadContext() {
  try { return JSON.parse(localStorage.getItem(getLocalSessionKey())) || []; }
  catch { return []; }
}

function saveContext(context) {
  localStorage.setItem(getLocalSessionKey(), JSON.stringify(context));
}

// -------- UI Chat History (for chat bubbles) --------
const UI_HISTORY_KEY = "tvam_ui_history_" + sessionId;

function loadUIHistory() {
  try { return JSON.parse(localStorage.getItem(UI_HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveUIHistory(arr) {
  localStorage.setItem(UI_HISTORY_KEY, JSON.stringify(arr));
}

// -------- GPT Context History (last 2 exchanges only) --------
// We'll reuse loadContext/saveContext as GPT context helpers.
// (They already use a session-specific key via getLocalSessionKey())



// -----------------------------------------------------------
// Persistent userId
// -----------------------------------------------------------
const userId = localStorage.getItem("tvam_userId") || (() => {
  const id =
    (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "tvam-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
  localStorage.setItem("tvam_userId", id);
  return id;
})();

// -----------------------------------------------------------
// Escape HTML utility
// -----------------------------------------------------------
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// -----------------------------------------------------------
// iOS Audio Unlocker
// -----------------------------------------------------------
let audioCtx = null;
let audioUnlocked = false;

async function unlockAudio() {
  if (audioUnlocked) return true;

  try {
    audioCtx =
      audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") await audioCtx.resume();

    const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate || 44100);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
    audioUnlocked = true;
    console.log("🔓 Audio unlocked via WebAudio");
    return true;
  } catch (err) {
    console.warn("WebAudio unlock failed:", err);
  }

  try {
    const a = new Audio();
    a.muted = true;
    await a.play().catch(() => { });
    audioUnlocked = true;
    console.log("🔓 Audio unlocked via HTMLAudio fallback");
    return true;
  } catch (err) {
    console.warn("HTMLAudio fallback failed:", err);
  }

  return false;
}

function showEnableSoundButton() {
  if (document.getElementById("enable-sound-btn")) return;
  const btn = document.createElement("button");
  btn.id = "enable-sound-btn";
  btn.textContent = "Enable sound";
  btn.style.position = "fixed";
  btn.style.left = "50%";
  btn.style.bottom = "22%";
  btn.style.transform = "translateX(-50%)";
  btn.style.zIndex = 9999;
  btn.style.padding = "10px 18px";
  btn.style.borderRadius = "25px";
  btn.style.background = "rgba(255,255,255,0.9)";
  btn.style.color = "#000";
  btn.style.border = "1px solid rgba(0,0,0,0.1)";
  btn.style.fontSize = "15px";
  btn.onclick = async () => {
    const ok = await unlockAudio();
    if (ok) btn.remove();
  };
  document.body.appendChild(btn);
}

function attachAudioUnlockHandlers() {
  const handler = async () => {
    const ok = await unlockAudio();
    if (!ok) showEnableSoundButton();
    window.removeEventListener("touchstart", handler, { passive: true });
    window.removeEventListener("click", handler);
  };
  window.addEventListener("touchstart", handler, { passive: true });
  window.addEventListener("click", handler);
}
attachAudioUnlockHandlers();

function setPetalMode(mode) {
  const petals = [
    document.getElementById("petal-back"),
    document.getElementById("petal-middle"),
    document.getElementById("petal-front"),
  ];

  petals.forEach(p => {
    p.classList.remove("rotate-cw", "rotate-ccw", "rotate-cw-fast", "breathe");


    if (mode === "rotate") {
      if (p.id === "petal-back") p.classList.add("rotate-cw");
      if (p.id === "petal-middle") p.classList.add("rotate-ccw");
      if (p.id === "petal-front") p.classList.add("rotate-cw-fast");
    }

    if (mode === "breathing") {
      petals.forEach(p => p.classList.add("breathe"));
    }

  });
}


// -----------------------------------------------------------
// Navigation
// -----------------------------------------------------------
 let infoShown = false; // session-level flag
function goToScreen(n) {
 

  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById("screen" + n);
  if (el) el.classList.add("active");

  if (n === 1 || n === 2 || n === 4) {
    setPetalMode("rotate");
  }

  if (n === 3) {
    startCountdown();
    setPetalMode("breathing");
  }

  if (n === 4) {
     document.getElementById("infoOverlay").classList.remove("hidden");
      infoShown = true;
    // 🔄 Reset GPT + UI history for this session
    saveContext([]);      // GPT context (for API)
    saveUIHistory([]);    // UI chat (for bubbles)

    // 🌱 Seed welcome message in UI ONLY
    saveUIHistory([
      {
        role: "assistant",
        content:
          "Welcome to TVAM.\n" +
          "This is a calm place to slow down and look within.\n" +
          "Share whatever feels true — there’s no right or wrong.\n" +
          "TVAM listens and explores with you.\n" +
          "Start whenever you’re ready."
      }
    ]);

    renderMessages();
  }
}

// -----------------------------------------------------------
// Setup buttons and listeners
// -----------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {

  const beginBtn = document.querySelector(".begin-btn");
  if (beginBtn) {
    beginBtn.addEventListener("click", async () => {
      await unlockAudio(); // ✅ ensure audio works on iOS
      goToScreen(2);
    });
  }

  const preludeBtn = document.getElementById("prelude-btn");
  if (preludeBtn)
    preludeBtn.addEventListener("click", () => goToScreen(3));

  document.querySelectorAll(".skip-btn").forEach((btn) =>
    btn.addEventListener("click", () => goToScreen(4))
  );

  const userInput = document.getElementById("userInput");
  if (userInput) {
    userInput.addEventListener("input", () => autoResize(userInput));
    userInput.addEventListener("keypress", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        askGuru();
      }
    });
    window.addEventListener("load", () => autoResize(userInput));
  }

  // Mic and Send button listeners
  const micBtn = document.getElementById("mic-btn");
  const sendBtn = document.getElementById("send-btn");

  if (micBtn) {
    micBtn.addEventListener("click", () => {
      console.log("🎤 Mic button clicked — (voice input feature coming soon)");
      // Future: start/stop recording audio and transcribe
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", () => askGuru());
  }

});

// -----------------------------------------------------------
// Countdown Timer
// -----------------------------------------------------------
function startCountdown() {
  let timeLeft = 60;
  const el = document.getElementById("countdown");
  if (!el) return;
  el.textContent = timeLeft;
  const interval = setInterval(() => {
    timeLeft -= 1;
    el.textContent = Math.max(0, timeLeft);
    if (timeLeft <= 0) {
      clearInterval(interval);
      goToScreen(4);
    }
  }, 1000);
}

// -----------------------------------------------------------
// Breathing Animation Sync (Breathe In / Breathe Out)
// -----------------------------------------------------------
function startBreathingAnimation() {
  const breathingText = document.getElementById("breathingText");
  const circle = document.querySelector("#screen3 .breathing-circle");
  if (!breathingText || !circle) return;

  let isBreathingIn = true;

  // Match CSS pulse timing (12s cycle → 6s in + 6s out)
  const inhaleDuration = 6000;
  const exhaleDuration = 6000;

  breathingText.textContent = "Breathe In";

  function cycleBreath() {
    breathingText.textContent = isBreathingIn ? "Breathe In" : "Breathe Out";
    isBreathingIn = !isBreathingIn;
    setTimeout(cycleBreath, isBreathingIn ? inhaleDuration : exhaleDuration);
  }

  setTimeout(cycleBreath, inhaleDuration);
}


// -----------------------------------------------------------
// Textarea Autosize
// -----------------------------------------------------------
function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// -----------------------------------------------------------
// Play Audio (no word highlight)
// -----------------------------------------------------------
async function playWithHighlight(text) {
  // Only play if voice is ON
  if (!isVoiceOn) return;
  if (!text) return;

  if (!audioUnlocked) {
    const ok = await unlockAudio();
    if (!ok) {
      showEnableSoundButton();
      return;
    }
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const ttsSocket = new WebSocket(`${protocol}://${window.location.host}/tts`);
  ttsSocket.binaryType = "arraybuffer";

  const audioChunks = [];

  ttsSocket.onopen = () => {
    ttsSocket.send(text);
  };

  ttsSocket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) audioChunks.push(event.data);
  };

  ttsSocket.onerror = (err) => console.error("TTS socket error:", err);

  ttsSocket.onclose = async () => {
    if (audioChunks.length === 0) {
      console.warn("No audio chunks received from server");
      return;
    }

    const combined = new Blob(audioChunks, { type: "audio/mpeg" });
    const url = URL.createObjectURL(combined);

    const audio = document.createElement("audio");
    audio.src = url;
    audio.controls = false;
    audio.style.display = "none";
    document.body.appendChild(audio);

    try {
      await audio.play();
      console.log("🔊 Playing audio");
    } catch (err) {
      console.error("Audio playback blocked:", err);
      showEnableSoundButton();
    }
  };
}


// -----------------------------------------------------------
// Feedback form
// -----------------------------------------------------------
window.openFeedback = () => {
  window.open("https://docs.google.com/forms/d/e/1FAIpQLSfo6ehYOCkCCJflinhiKOGYoZ1SZNRiLVmCikFUe3ZOnjSewQ/viewform", "_blank");
};

function renderMessages() {
  const container = document.getElementById("messages");
  if (!container) return;

  const history = loadUIHistory();  // ⬅️ UI history only
  container.innerHTML = "";

  history.forEach((m) => {
    const row = document.createElement("div");
    row.className = "message-row " + (m.role === "user" ? "user" : "assistant");

    const bubble = document.createElement("div");
    bubble.className = "message-bubble " + (m.role === "user" ? "user" : "assistant");
    bubble.textContent = m.content;

    row.appendChild(bubble);
    container.appendChild(row);
  });

  // scroll to bottom
  container.scrollTop = container.scrollHeight;
}


// -----------------------------------------------------------
// Ask Guru
// -----------------------------------------------------------
async function askGuru() {
  const userInputEl = document.getElementById("userInput");
  if (!userInputEl) return;

  const input = userInputEl.value.trim();
  if (!input) return;

  // Clear input immediately
  userInputEl.value = "";
  autoResize(userInputEl);

  // ---------- 1) UI HISTORY (full chat for bubbles) ----------
  let uiHistory = loadUIHistory();
  uiHistory.push({ role: "user", content: input });

  // Keep up to 50 messages in UI (you can change this to 30 if you prefer)
  if (uiHistory.length > 50) {
    uiHistory.splice(0, uiHistory.length - 50);
  }

  saveUIHistory(uiHistory);
  renderMessages(); // show user message immediately


  // ---------- 2) GPT CONTEXT (last 2 exchanges = 4 msgs) ----------
  let gptHistory = loadContext();
  gptHistory.push({ role: "user", content: input });

  // Trim to last 4 messages
  if (gptHistory.length > 4) {
    gptHistory = gptHistory.slice(-4);
  }
  saveContext(gptHistory);


  try {
    const resp = await fetch("/ask-guru", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input,
        sessionId,
        history: gptHistory   // ⬅ only GPT context goes to API
      }),
    });

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? null;
    if (!content) throw new Error("No response from the guru.");

    // ---------- Add assistant reply to UI ----------
    uiHistory.push({ role: "assistant", content });
    if (uiHistory.length > 50) {
      uiHistory.splice(0, uiHistory.length - 50);
    }
    saveUIHistory(uiHistory);
    renderMessages();

    // ---------- Add assistant reply to GPT context ----------
    gptHistory.push({ role: "assistant", content });
    if (gptHistory.length > 4) {
      gptHistory = gptHistory.slice(-4);
    }
    saveContext(gptHistory);

    // optional: still play audio using TTS
    await playWithHighlight(content);

  } catch (err) {
    console.error(err);

    const fallback = `The guru is silent right now.\n${err.message || err}`;
    uiHistory.push({ role: "assistant", content: fallback });
    saveUIHistory(uiHistory);
    renderMessages();

  } finally {
    userInputEl.value = "";
    autoResize(userInputEl);
  }
}




// -----------------------------------------------------------
// 🎤 Voice Input (Speech-to-Text)
// -----------------------------------------------------------
let recognition;
let isListening = false;

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition not supported in this browser. Please use Chrome or Edge.");
    return null;
  }

  const recog = new SpeechRecognition();
  recog.lang = "en-US";
  recog.continuous = true;       // keeps listening until user stops
  recog.interimResults = true;   // live text while speaking
  recog.maxAlternatives = 1;
  return recog;
}

// 🧘‍♂️ Toggle mic on/off
function toggleMic() {
  const micBtn = document.getElementById("mic-btn");
  const userInput = document.getElementById("userInput");

  if (!recognition) recognition = initSpeechRecognition();
  if (!recognition || !userInput) return;

  if (!isListening) {
    // Start listening
    try {
      recognition.start();
      isListening = true;
      micBtn.classList.add("listening");
      micBtn.querySelector("img").style.filter = "invert(38%) sepia(74%) saturate(493%) hue-rotate(20deg) brightness(95%) contrast(91%)";
      console.log("🎙️ Listening...");
    } catch (err) {
      console.error("Speech recognition error:", err);
    }
  } else {
    // Stop listening
    recognition.stop();
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.querySelector("img").style.filter = "brightness(0)";
    console.log("🛑 Mic stopped");
  }

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    userInput.value = transcript.trim();
    autoResize(userInput);
  };

  recognition.onend = () => {
    console.log("🎤 Recognition ended");
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.querySelector("img").style.filter = "brightness(0)";
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.querySelector("img").style.filter = "brightness(0)";
  };
}

let isVoiceOn = false;

function toggleVoice() {
  isVoiceOn = !isVoiceOn;

  const offIcon = document.getElementById("voiceOffIcon");
  const onIcon = document.getElementById("voiceOnIcon");

  if (isVoiceOn) {
    offIcon.classList.add("hidden");
    onIcon.classList.remove("hidden");
  } else {
    onIcon.classList.add("hidden");
    offIcon.classList.remove("hidden");
  }
}


function goBack() {
  goToScreen(1); // or 2/3 depending on what you want
}

window.goToScreen = goToScreen;
window.askGuru = askGuru;
window.toggleVoice = toggleVoice;
window.goBack = goBack;



// ✅ Attach mic toggle to button
document.addEventListener("DOMContentLoaded", () => {
  const micBtn = document.getElementById("mic-btn");
  if (micBtn) micBtn.addEventListener("click", toggleMic);

  const infoBtn = document.getElementById("infoBtn");
const infoClose = document.getElementById("infoClose");
const infoOverlay = document.getElementById("infoOverlay");

if (infoBtn && infoOverlay) {
  infoBtn.addEventListener("click", () => {
    infoOverlay.classList.remove("hidden");
  });
}

if (infoClose && infoOverlay) {
  infoClose.addEventListener("click", () => {
    infoOverlay.classList.add("hidden");
  });
}

});


window.goToScreen = goToScreen;
window.askGuru = askGuru;
