// Persistent userId
const userId = localStorage.getItem("tvam_userId") || (() => {
    const id = crypto.randomUUID();
    localStorage.setItem("tvam_userId", id);
    return id;
})();

// Screen navigation
function goToScreen(n) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen' + n).classList.add('active');
    if (n === 3) startCountdown();
}

// Attach click listeners
window.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.begin-btn').addEventListener('click', () => goToScreen(2));
    document.getElementById('prelude-btn').addEventListener('click', () => goToScreen(3));
    document.querySelectorAll('.skip-btn').forEach(btn => btn.addEventListener('click', () => goToScreen(4)));
});

// Countdown timer
function startCountdown() {
   let timeLeft = 60;
   const el = document.getElementById("countdown");

   const interval = setInterval(() => {
        el.textContent = timeLeft--;
        if (timeLeft < 0) {
            clearInterval(interval);
            goToScreen(4);
        }
   }, 1000);
}

// Guru speech & lyrics-style scrolling
function speakAndHighlight(text, element) {
    if (!window.speechSynthesis) return;
    const words = text.split(/\s+/);
    element.innerHTML = words.map(w => `<span>${w}</span>`).join(" ");
    element.style.opacity = 1;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.8;
    utterance.pitch = 0.9;

    const spans = element.querySelectorAll("span");
    utterance.onboundary = (event) => {
        const charIndex = event.charIndex ?? 0;
        let running = 0, idx = 0;
        for (let i=0; i<words.length; i++) {
            running += words[i].length + 1;
            if (charIndex < running) { idx = i; break; }
        }
        spans.forEach(s => s.classList.remove("highlight"));
        if (spans[idx]) {
            spans[idx].classList.add("highlight");
            // auto-scroll lyrics
            spans[idx].scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }
    };
    utterance.onend = () => spans.forEach(s => s.classList.remove("highlight"));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

// Auto-expand textarea
function autoResize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
}
const userInput = document.getElementById('userInput');
userInput.addEventListener("input", () => autoResize(userInput));
userInput.addEventListener("keypress", (event) => {
    if(event.key === "Enter") {
        event.preventDefault();
        askGuru();
    }
});
window.addEventListener("load", () => autoResize(userInput));

// Ask Guru function with Firebase ID token
async function askGuru() {
    const input = userInput.value.trim();
    const responseEl = document.getElementById('responseText');
    const welcomeChatText = document.getElementById('welcome-chat-text');
    if (!input) return;

    responseEl.textContent = "🧘‍♂️ Listening...";
    responseEl.style.opacity = 1;
    welcomeChatText.textContent = " ";

    try {
        const user = window.auth.currentUser;
        if (!user) throw new Error("User not logged in");

        const token = await user.getIdToken();

        const result = await fetch("/ask-guru", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ message: input })
        });

        const data = await result.json();
        console.log("📜 Response from backend:", data);

        if (!data.choices || !data.choices[0]) {
            throw new Error("No response from the guru.");
        }

        const response = data.choices[0].message.content;
        speakAndHighlight(response, responseEl);

    } catch (err) {
        responseEl.textContent = `🌧 The guru is silent... ${err.message}`;
        responseEl.style.opacity = 1;
    }

    userInput.value = "";
    autoResize(userInput);
}

// Expose functions globally
window.goToScreen = goToScreen;
window.askGuru = askGuru;
