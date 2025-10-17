// main.js - TVAM frontend with iOS-safe Audio Unlock + Rime.ai TTS + Word Highlight

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

// -----------------------------------------------------------
// Navigation
// -----------------------------------------------------------
function goToScreen(n) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById("screen" + n);
  if (el) el.classList.add("active");
  if (n === 3) startCountdown();
  if (n === 4) setTimeout(() => {
    const i = document.getElementById("userInput");
    if (i) i.focus();
  }, 200);
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
// Ask Guru
// -----------------------------------------------------------
async function askGuru() {
  const userInputEl = document.getElementById("userInput");
  const responseEl = document.getElementById("responseText");
  const welcomeEl = document.getElementById("welcome-chat-text");
  if (!userInputEl || !responseEl) return;

  const input = userInputEl.value.trim();
  if (!input) return;

  responseEl.textContent = "🧘‍♂️ Listening..";
  responseEl.style.opacity = 1;
  if (welcomeEl) welcomeEl.textContent = "";

  try {
    const resp = await fetch("/ask-guru", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? null;
    if (!content) throw new Error("No response from the guru.");

    await playWithHighlight(content, responseEl);
  } catch (err) {
    console.error(err);
    responseEl.textContent = `🌧 The guru is silent... ${err.message || err}`;
    responseEl.style.opacity = 1;
  } finally {
    userInputEl.value = "";
    autoResize(userInputEl);
  }
}

window.goToScreen = goToScreen;
window.askGuru = askGuru;
