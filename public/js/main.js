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
    await a.play().catch(() => {});
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
// Play Audio + Highlight Words
// -----------------------------------------------------------
async function playWithHighlight(text, responseEl) {
  const words = String(text).split(/\s+/).filter(Boolean);
  responseEl.innerHTML = words.map((w) => `<span>${escapeHtml(w)}</span>`).join(" ");
  responseEl.style.opacity = 1;

  const wrapper = document.getElementById("responseWrapper");
  if (wrapper) wrapper.scrollTop = 0;

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
    console.log("✅ Connected to /tts");
    ttsSocket.send(text);
  };

  ttsSocket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) audioChunks.push(event.data);
  };

  ttsSocket.onerror = (err) => console.error("TTS socket error:", err);

  ttsSocket.onclose = async () => {
    if (audioChunks.length === 0) {
      console.warn("⚠️ No audio chunks received from server");
      return;
    }

    const combined = new Blob(audioChunks, { type: "audio/mpeg" });
    const url = URL.createObjectURL(combined);

    // create audio element to decode sound
    const audio = document.createElement("audio");
    audio.src = url;
    audio.controls = false;
    audio.style.display = "none";
    document.body.appendChild(audio);

    const spans = responseEl.querySelectorAll("span");
    let index = 0;

    audio.oncanplaythrough = async () => {
      try {
        await audio.play();
        console.log("🔊 Playing audio");
        const baseWordTime = (audio.duration * 1000) / Math.max(1, words.length);
        const punctuationPause = (w) => (/[.,!?;:]$/.test(w) ? 1.4 : 1.0);

        function highlightNext() {
          spans.forEach((s) => s.classList.remove("highlight"));
          if (index < spans.length) {
            spans[index].classList.add("highlight");
           if (wrapper) {
  const scrollTarget = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight * 0.5);
  wrapper.scrollTo({ top: scrollTarget, behavior: "smooth" });
}

            const delay = baseWordTime * punctuationPause(words[index]);
            index++;
            setTimeout(highlightNext, delay);
          }
        }

        setTimeout(highlightNext, 300);
      } catch (err) {
        console.error("Audio playback blocked:", err);
        showEnableSoundButton();
      }
    };
  };
}

// -----------------------------------------------------------
// Feedback form
// -----------------------------------------------------------
window.openFeedback = () => {
  window.open("https://docs.google.com/forms/d/e/1FAIpQLSfo6ehYOCkCCJflinhiKOGYoZ1SZNRiLVmCikFUe3ZOnjSewQ/viewform", "_blank");
};


// -----------------------------------------------------------
// Ask Guru
// -----------------------------------------------------------
async function askGuru() {
  const userInputEl = document.getElementById("userInput");
  const responseEl = document.getElementById("responseText");
  const welcomeEl = document.getElementById("welcome-chat-text");
  if (!userInputEl || !responseEl) return;

  const input = userInputEl.value.trim();
  if (!input) return;

  // --- UI behavior (yours) ---
  responseEl.textContent = "🧘‍♂️ Listening..";
  responseEl.style.opacity = 1;
  if (welcomeEl) welcomeEl.textContent = "";

  // --- Load and update local context ---
  const history = loadContext();              // read stored messages
  history.push({ role: "user", content: input });

  // 🧠 Keep only last 2 exchanges (4 total messages: 2 user + 2 assistant)
  if (history.length > 4) history.splice(0, history.length - 4);

  saveContext(history);

  try {
    // --- Send message + context to backend ---
    const resp = await fetch("/ask-guru", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input, sessionId, history }),
    });

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? null;
    if (!content) throw new Error("No response from the guru.");

    // --- Store assistant’s reply back into context ---
    history.push({ role: "assistant", content });
    if (history.length > 4) history.splice(0, history.length - 4);
    
    saveContext(history);

    // --- Play voice + highlight as before ---
    await playWithHighlight(content, responseEl);
  } catch (err) {
    console.error(err);
    responseEl.textContent = `🌧 The guru is silent... ${err.message || err}`;
    responseEl.style.opacity = 1;
  } finally {
    userInputEl.value = "";
    autoResize(userInputEl);   // keep your resizing behavior
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
    const icon = document.getElementById("voiceIcon");

    isVoiceOn = !isVoiceOn;

    if (isVoiceOn) {
      icon.src = "voice-on.png";   // 🔊 voice ON icon
      icon.alt = "Voice on";
    } else {
      icon.src = "voice-off.png";  // 🔇 voice OFF icon
      icon.alt = "Voice off";
    }
  }


// ✅ Attach mic toggle to button
document.addEventListener("DOMContentLoaded", () => {
  const micBtn = document.getElementById("mic-btn");
  if (micBtn) micBtn.addEventListener("click", toggleMic);
});


window.goToScreen = goToScreen;
window.askGuru = askGuru;
