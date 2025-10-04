// main.js - improved mobile auto-scroll + keyboard handling + speech highlight
// Persistent userId (safe fallback)
const userId = localStorage.getItem("tvam_userId") || (() => {
  const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('tvam-' + Date.now() + '-' + Math.random().toString(36).slice(2,9));
  localStorage.setItem("tvam_userId", id);
  return id;
})();

// small utility: escape HTML
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// navigation
function goToScreen(n) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + n);
  if (el) el.classList.add('active');

  if (n === 3) startCountdown();
  if (n === 4) setTimeout(()=>{ const i = document.getElementById('userInput'); if(i) i.focus(); }, 200);
}

document.addEventListener('DOMContentLoaded', () => {
  const beginBtn = document.querySelector('.begin-btn');
  if (beginBtn) beginBtn.addEventListener('click', () => goToScreen(2));
  const preludeBtn = document.getElementById('prelude-btn');
  if (preludeBtn) preludeBtn.addEventListener('click', () => goToScreen(3));
  document.querySelectorAll('.skip-btn').forEach(btn => btn.addEventListener('click', () => goToScreen(4)));

  // text area wiring
  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.addEventListener('input', () => autoResize(userInput));
    userInput.addEventListener('keypress', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); askGuru(); }
    });

    // mobile keyboard heuristics (visualViewport if present)
    userInput.addEventListener('focus', () => {
      document.body.classList.add('keyboard-open');
      // ensure wrapper content visible after keyboard opens
      setTimeout(() => {
        const wrapper = document.getElementById('responseWrapper');
        if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
      }, 300);
    });
    userInput.addEventListener('blur', () => { document.body.classList.remove('keyboard-open'); });
    window.addEventListener('load', () => autoResize(userInput));
  }

  // visualViewport: adjust wrapper sizes when keyboard opens/closes (Android Chrome / iOS)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const wrapper = document.getElementById('responseWrapper');
      const input = document.getElementById('userInput');
      if (!wrapper || !input) return;

      const vh = window.innerHeight;
      const vvh = window.visualViewport.height;
      // if viewport shrinks significantly -> keyboard likely open
      if (vvh < vh - 120) {
        document.body.classList.add('keyboard-open');
        // compute available vertical space for wrapper (visualViewport coordinates)
        const wrapperRect = wrapper.getBoundingClientRect();
        const top = Math.max(8, wrapperRect.top); // px from top
        const available = Math.max(80, vvh - top - input.offsetHeight - 20);
        wrapper.style.maxHeight = available + 'px';
        // scroll to bottom so recent words are visible
        wrapper.scrollTop = wrapper.scrollHeight;
      } else {
        document.body.classList.remove('keyboard-open');
        wrapper.style.maxHeight = '';
      }
    });
  }
});

// countdown
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

// textarea autosize
function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
}

/* ---------------------
   Smooth-scrolling helper (works reliably on mobile)
   --------------------- */
function smoothScrollTo(el, to, duration = 360) {
  if (!el) { if (typeof to === 'number') el.scrollTop = to; return; }
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

// auto-scroll wrapper so the span is centered
function autoScrollSpanIntoView(wrapper, span) {
  if (!wrapper || !span) return;
  // compute offset relative to wrapper's content
  const spanOffset = span.offsetTop;
  const target = Math.max(0, spanOffset - (wrapper.clientHeight / 2) + (span.offsetHeight / 2));
  // Use a custom smooth scroller (more reliable on Android)
  smoothScrollTo(wrapper, target, 300);
}

/* ---------------------
   Speech + highlight logic with fallback
   --------------------- */
let currentUtterance = null;
function speakAndHighlight(text, responseEl) {
  if (!responseEl) return;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  responseEl.innerHTML = words.map(w => `<span>${escapeHtml(w)}</span>`).join(' ');
  responseEl.style.opacity = 1;

  const wrapper = document.getElementById('responseWrapper');
  if (wrapper) wrapper.scrollTop = 0;

  // cancel previous
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentUtterance) { currentUtterance.onboundary = null; currentUtterance.onend = null; currentUtterance = null; }

  // If SpeechSynthesis not supported, fallback to timed highlight
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    fallbackHighlight(words, responseEl);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  utterance.pitch = 0.95;

  const spans = responseEl.querySelectorAll('span');

  // Fallback timed progression if onboundary is unreliable
  let fallbackInterval = null;
  let fallbackIndex = 0;
  const estimatedMsPerWord = Math.max(140, Math.round((text.length * 50) / Math.max(1, words.length)));

  utterance.onstart = () => {
    // schedule fallback only if boundary doesn't fire in time
    setTimeout(() => {
      if (!fallbackInterval && (!('onboundary' in SpeechSynthesisUtterance.prototype) || spans.length === 0)) {
        fallbackInterval = setInterval(() => {
          spans.forEach(s => s.classList.remove('highlight'));
          if (spans[fallbackIndex]) {
            spans[fallbackIndex].classList.add('highlight');
            autoScrollSpanIntoView(wrapper, spans[fallbackIndex]);
          }
          fallbackIndex++;
          if (fallbackIndex >= spans.length) clearInterval(fallbackInterval);
        }, estimatedMsPerWord);
      }
    }, 250);
  };

  utterance.onboundary = (event) => {
    if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
    const charIndex = event.charIndex ?? 0;
    let running = 0, idx = 0;
    for (let i = 0; i < words.length; i++) {
      running += words[i].length + 1;
      if (charIndex < running) { idx = i; break; }
    }
    spans.forEach(s => s.classList.remove('highlight'));
    if (spans[idx]) {
      spans[idx].classList.add('highlight');
      autoScrollSpanIntoView(wrapper, spans[idx]);
    }
  };

  utterance.onend = () => {
    if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
    spans.forEach(s => s.classList.remove('highlight'));
  };

  utterance.onerror = (e) => {
    console.warn('speech error', e);
    if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
  };

  currentUtterance = utterance;
  try { window.speechSynthesis.speak(utterance); } catch (err) { console.error('speak error', err); }
}

// fallback sequential highlight if no TTS available
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

/* ---------------------
   Server call: askGuru
   --------------------- */
async function askGuru() {
  const userInputEl = document.getElementById('userInput');
  const responseEl = document.getElementById('responseText');
  const welcomeEl = document.getElementById('welcome-chat-text');
  if (!userInputEl || !responseEl) return;
  const input = userInputEl.value.trim();
  if (!input) return;

  responseEl.textContent = '🧘‍♂️ Listening...';
  responseEl.style.opacity = 1;
  if (welcomeEl) welcomeEl.textContent = '';

  try {
    let token = null;
    if (window.auth && window.auth.currentUser) {
      try { token = await window.auth.currentUser.getIdToken(); } catch(e){ console.warn('token error', e); }
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

// expose for inline onclicks
window.goToScreen = goToScreen;
window.askGuru = askGuru;
window.speakAndHighlight = speakAndHighlight;
