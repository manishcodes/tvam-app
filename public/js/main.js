// Generate a persistent userId for this browser session
const userId = localStorage.getItem("tvam_userId") || (() => {
    const id = crypto.randomUUID();
    localStorage.setItem("tvam_userId", id);
    return id;
})();

function goToScreen(n) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen' + n).classList.add('active');
    if (n === 3) {
        startCountdown();
        // startBreathingText(); // (kept for reference; no longer needed because CSS syncs the text)
    }
}

function startCountdown() {
   let timeLeft = 60;
    const el = document.getElementById("countdown");
    const progressBar = document.querySelector(".progress-bar");
    const thumb = document.querySelector(".progress-thumb");

    const interval = setInterval(() => {
        el.textContent = timeLeft--;
        // const progressPercent = ((60 - timeLeft) / 60) * 100;
        // progressBar.style.setProperty('--progress', `${progressPercent}%`);
        // thumb.style.setProperty('--progress', `${progressPercent}%`);

        if (timeLeft < 0) {
            clearInterval(interval);
            goToScreen(4);
        }
    }, 1000);
}

/* --------- Old JS-driven breathing text (kept as-is per your request)
   We now use CSS animations to keep the "Breathe in / out" text perfectly in
   sync with the expanding ring, so this function is not called.
*/
function startBreathingText() {
    const textEl = document.getElementById("breathingText");
    let isInhale = true;

    function cycle() {
        if (isInhale) {
            if (textEl) {
              textEl.textContent = "Breathe In";
              textEl.classList.add("show");
            }
            setTimeout(() => {
                if (textEl) textEl.classList.remove("show");
                isInhale = false;
                setTimeout(cycle, 1000); // wait for fade out before switching
            }, 4000); // inhale 4s
        } else {
            if (textEl) {
              textEl.textContent = "Breathe Out";
              textEl.classList.add("show");
            }
            setTimeout(() => {
                if (textEl) textEl.classList.remove("show");
                isInhale = true;
                setTimeout(cycle, 1000);
            }, 8000); // exhale 8s
        }
    }
    cycle();
}
// --------- end legacy breathing text code ---------

// --- Guru Speech with Word Highlighting (color only, no background) ---
function speakAndHighlight(text, element) {
    if (!window.speechSynthesis) return;

    // Split into words and wrap in spans
    const words = text.split(/\s+/);
    element.innerHTML = words.map(w => `<span>${w}</span>`).join(" ");
    element.style.opacity = 1;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.8;
    utterance.pitch = 0.9;

    const spans = element.querySelectorAll("span");

    // Use charIndex from onboundary to map to the exact word being spoken
    utterance.onboundary = (event) => {
        if (event.name === "word" || event.charIndex !== undefined) {
            const charIndex = event.charIndex ?? 0;
            let running = 0;
            let idx = 0;

            for (let i = 0; i < words.length; i++) {
                running += words[i].length + 1; // include space
                if (charIndex < running) { idx = i; break; }
            }

            spans.forEach(s => s.classList.remove("highlight"));
            if (spans[idx]) spans[idx].classList.add("highlight");
        }
    };

    utterance.onend = () => {
        spans.forEach(s => s.classList.remove("highlight"));
    };

    window.speechSynthesis.cancel(); // stop anything else
    window.speechSynthesis.speak(utterance);
}

// Speech (simple helper retained for compatibility elsewhere)
function speakText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.8;
    utterance.pitch = 0.8;
    window.speechSynthesis.speak(utterance);
}

async function askGuru() {
    const input = document.getElementById('userInput').value.trim();
    const responseEl = document.getElementById('responseText');
    if (!input) return;

    responseEl.textContent = "🧘‍♂️ Listening...";
    responseEl.style.opacity = 1;

    try {
        const result = await fetch("/ask-guru", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, message: input })
        });

        const data = await result.json();
        console.log("📜 Response from backend:", data);

        if (!data.choices || !data.choices[0]) {
            throw new Error("No response from the guru.");
        }

        const response = data.choices[0].message.content;

        // Speak + highlight color
        speakAndHighlight(response, responseEl);

    } catch (err) {
        responseEl.textContent = `🌧 The guru is silent... ${err.message}`;
        responseEl.style.opacity = 1;
    }

    document.getElementById('userInput').value = "";
}
