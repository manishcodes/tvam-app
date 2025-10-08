// main.js - TVAM frontend with clean (non-streaming) Rime.ai TTS + word highlighting

// Persistent userId
const userId = localStorage.getItem("tvam_userId") || (() => {
  const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('tvam-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
  localStorage.setItem("tvam_userId", id);
  return id;
})();

// Escape HTML utility
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- NAVIGATION ---
function goToScreen(n) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + n);
  if (el) el.classList.add('active');
  if (n === 3) startCountdown();
  if (n === 4) setTimeout(() => {
    const i = document.getElementById('userInput');
    if (i) i.focus();
  }, 200);
}

document.addEventListener('DOMContentLoaded', () => {
  const beginBtn = document.querySelector('.begin-btn');
  if (beginBtn) beginBtn.addEventListener('click', () => goToScreen(2));
  const preludeBtn = document.getElementById('prelude-btn');
  if (preludeBtn) preludeBtn.addEventListener('click', () => goToScreen(3));
  document.querySelectorAll('.skip-btn').forEach(btn => btn.addEventListener('click', () => goToScreen(4)));

  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.addEventListener('input', () => autoResize(userInput));
    userInput.addEventListener('keypress', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); askGuru(); }
    });
    window.addEventListener('load', () => autoResize(userInput));
  }
});

// Countdown
function startCountdown() {
  let timeLeft = 60;
  const el = document.getElementById('countdown');
  if (!el) return;
  el.textContent = timeLeft;
  const interval = setInterval(() => {
    timeLeft -= 1;
    el.textContent = Math.max(0, timeLeft);
    if (timeLeft <= 0) { clearInterval(interval); goToScreen(4); }
  }, 1000);
}

// Textarea autosize
function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
}

// --- TTS with Highlight ---
// --- TTS with Improved Highlight Sync ---
// --- iOS-Compatible TTS + Highlight ---
async function playWithHighlight(text, responseEl) {
  const words = String(text).split(/\s+/).filter(Boolean);
  responseEl.innerHTML = words.map(w => `<span>${escapeHtml(w)}</span>`).join(' ');
  responseEl.style.opacity = 1;

  const wrapper = document.getElementById('responseWrapper');
  if (wrapper) wrapper.scrollTop = 0;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const ttsSocket = new WebSocket(`${protocol}://${window.location.host}/tts`);
  ttsSocket.binaryType = "arraybuffer";

  const audioChunks = [];

  // 🧠 iOS audio unlocker: must run at least once
  async function unlockAudio() {
    return new Promise((resolve) => {
      const temp = document.createElement("audio");
      temp.src = "";
      temp.play().catch(() => {}); // ignored by Safari
      resolve();
    });
  }

  ttsSocket.onopen = async () => {
    console.log("✅ Connected to /tts");
    await unlockAudio(); // 🔓 unlocks iOS audio
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

    // Force Safari to render and decode
    const audio = document.createElement("audio");
    audio.src = url;
    audio.controls = false;
    audio.style.display = "none";
    document.body.appendChild(audio);

    // 🪄 Ensure metadata loads
    const spans = responseEl.querySelectorAll('span');
    let index = 0;

    function startHighlight() {
      const baseWordTime = (audio.duration * 1000) / Math.max(1, words.length);
      const punctuationPause = (w) => (/[.,!?;:]$/.test(w) ? 1.4 : 1.0);

      function step() {
        spans.forEach(s => s.classList.remove('highlight'));
        if (index < spans.length) {
          spans[index].classList.add('highlight');
          if (wrapper)
            wrapper.scrollTo({ top: wrapper.scrollHeight, behavior: 'smooth' });
          const delay = baseWordTime * punctuationPause(words[index]);
          index++;
          setTimeout(step, delay);
        }
      }

      console.log("🎵 Starting highlight sync");
      step();
    }

    // 🧘 Audio playback and sync
    audio.oncanplaythrough = async () => {
      try {
        await audio.play();
        setTimeout(startHighlight, 300); // slight delay for sync
      } catch (err) {
        console.error("Audio playback blocked:", err);
        alert("🔇 Tap anywhere to enable sound (Safari restriction).");
      }
    };
  };
}



// --- ASK GURU ---
async function askGuru() {
  const userInputEl = document.getElementById('userInput');
  const responseEl = document.getElementById('responseText');
  const welcomeEl = document.getElementById('welcome-chat-text');
  if (!userInputEl || !responseEl) return;
  const input = userInputEl.value.trim();
  if (!input) return;

  responseEl.textContent = '🧘‍♂️ Listening..';
  responseEl.style.opacity = 1;
  if (welcomeEl) welcomeEl.textContent = '';

  try {
    const resp = await fetch('/ask-guru', {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input })
    });

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? null;
    if (!content) throw new Error('No response from the guru.');

    // Show response + TTS
    await playWithHighlight(content, responseEl);

  } catch (err) {
    console.error(err);
    responseEl.textContent = `🌧 The guru is silent... ${err.message || err}`;
    responseEl.style.opacity = 1;
  } finally {
    userInputEl.value = '';
    autoResize(userInputEl);
  }
}

window.goToScreen = goToScreen;
window.askGuru = askGuru;
