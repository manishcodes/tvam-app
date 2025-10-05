// main.js - Mobile-safe Spotify-style lyrics + TTS + auto-scroll

// Persistent userId
const userId = localStorage.getItem("tvam_userId") || (() => {
  const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('tvam-' + Date.now() + '-' + Math.random().toString(36).slice(2,9));
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

// Navigation
function goToScreen(n) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + n);
  if (el) el.classList.add('active');

  if (n === 3) startCountdown();
  if (n === 4) setTimeout(()=>{ const i = document.getElementById('userInput'); if(i) i.focus(); }, 200);
}

document.addEventListener('DOMContentLoaded', () => {
  // Buttons
  const beginBtn = document.querySelector('.begin-btn');
  if (beginBtn) beginBtn.addEventListener('click', () => goToScreen(2));
  const preludeBtn = document.getElementById('prelude-btn');
  if (preludeBtn) preludeBtn.addEventListener('click', () => goToScreen(3));
  document.querySelectorAll('.skip-btn').forEach(btn => btn.addEventListener('click', () => goToScreen(4)));

  // Textarea
  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.addEventListener('input', () => autoResize(userInput));
    userInput.addEventListener('keypress', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); askGuru(); }
    });

    userInput.addEventListener('focus', () => {
      document.body.classList.add('keyboard-open');
      setTimeout(() => {
        const wrapper = document.getElementById('responseWrapper');
        if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
      }, 300);
    });

    userInput.addEventListener('blur', () => document.body.classList.remove('keyboard-open'));
    window.addEventListener('load', () => autoResize(userInput));
  }

  // visualViewport for mobile keyboard
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const wrapper = document.getElementById('responseWrapper');
      const input = document.getElementById('userInput');
      if (!wrapper || !input) return;

      const vh = window.innerHeight;
      const vvh = window.visualViewport.height;
      if (vvh < vh - 120) { // keyboard likely open
        document.body.classList.add('keyboard-open');
        const wrapperRect = wrapper.getBoundingClientRect();
        const top = Math.max(8, wrapperRect.top);
        const available = Math.max(80, vvh - top - input.offsetHeight - 20);
        wrapper.style.maxHeight = available + 'px';
        wrapper.scrollTop = wrapper.scrollHeight;
      } else {
        document.body.classList.remove('keyboard-open');
        wrapper.style.maxHeight = '';
      }
    });
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

// Smooth scroll helper
function smoothScrollTo(el, to, duration = 360) {
  if (!el) return;
  const start = el.scrollTop;
  const change = to - start;
  const startTime = performance.now();
  function easeInOutQuad(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }
  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    el.scrollTop = start + change * easeInOutQuad(t);
    if (t < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

// Auto-scroll span into view
function autoScrollSpanIntoView(wrapper, span) {
  if (!wrapper || !span) return;
  const wrapperRect = wrapper.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const offset = spanRect.top - wrapperRect.top;
  const scrollTarget = wrapper.scrollTop + offset - wrapper.clientHeight / 2 + span.offsetHeight / 2;
  wrapper.scrollTo({ top: scrollTarget, behavior: 'smooth' });
}

// Speak + highlight
let currentUtterance = null;
function speakAndHighlight(text, responseEl) {
  if (!responseEl) return;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  responseEl.innerHTML = words.map(w => `<span>${escapeHtml(w)}</span>`).join(' ');
  responseEl.style.opacity = 1;

  const wrapper = document.getElementById('responseWrapper');
  if (wrapper) wrapper.scrollTop = 0;

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentUtterance) { currentUtterance.onend = null; currentUtterance = null; }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  utterance.pitch = 0.95;

  const spans = responseEl.querySelectorAll('span');
  let wordIndex = 0;

  // Approximate duration per word (ms)
  const durationPerWord = Math.max(120, (text.length * 50) / Math.max(1, words.length));

  // Highlight loop
  const intervalId = setInterval(() => {
    spans.forEach(s => s.classList.remove('highlight'));
    if (spans[wordIndex]) {
      spans[wordIndex].classList.add('highlight');
      autoScrollSpanIntoView(wrapper, spans[wordIndex]);
    }
    wordIndex++;
    if (wordIndex >= spans.length) {
      clearInterval(intervalId);
      spans.forEach(s => s.classList.remove('highlight'));
    }
  }, durationPerWord);

  // Speak
  currentUtterance = utterance;
  try { window.speechSynthesis.speak(utterance); } catch(err){ console.error(err); }
}


// Fallback highlight if no TTS
function fallbackHighlight(words, responseEl) {
  const spans = responseEl.querySelectorAll('span');
  if (!spans || spans.length === 0) return;
  let i = 0;
  const iv = setInterval(() => {
    spans.forEach(s => s.classList.remove('highlight'));
    if (spans[i]) {
      spans[i].classList.add('highlight');
      autoScrollSpanIntoView(document.getElementById('responseWrapper'), spans[i]);
    }
    i++;
    if (i >= spans.length) { clearInterval(iv); setTimeout(()=>spans.forEach(s=>s.classList.remove('highlight')), 300); }
  }, 220);
}

// Ask Guru
async function askGuru() {
  const userInputEl = document.getElementById('userInput');
  const responseEl = document.getElementById('responseText');
  const welcomeEl = document.getElementById('welcome-chat-text');
  if (!userInputEl || !responseEl) return;
  const input = userInputEl.value.trim();
  if (!input) return;

  responseEl.textContent = '🧘‍♂️ Listening....';
  responseEl.style.opacity = 1;
  if (welcomeEl) welcomeEl.textContent = '';

  try {
    let token = null;
    if (window.auth && window.auth.currentUser) {
      try { token = await window.auth.currentUser.getIdToken(); } catch(e){ console.warn(e); }
    }
    const headers = { "Content-Type": "application/json" };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const resp = await fetch('/ask-guru', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: input })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      let parsed = txt;
      try { parsed = JSON.parse(txt); } catch(e){}
      throw new Error(parsed?.error || `Server returned ${resp.status}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? null;
    if (!content) throw new Error('No response from the guru.');
    speakAndHighlight(content, responseEl);

  } catch (err) {
    console.error(err);
    responseEl.textContent = `🌧 The guru is silent... ${err.message || err}`;
    responseEl.style.opacity = 1;
  } finally {
    userInputEl.value = '';
    autoResize(userInputEl);
    document.body.classList.remove('keyboard-open');
  }
}

// Expose globally
window.goToScreen = goToScreen;
window.askGuru = askGuru;
window.speakAndHighlight = speakAndHighlight;
