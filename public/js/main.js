// Generate a persistent userId for this browser session
const userId = localStorage.getItem("tvam_userId") || (() => {
    const id = crypto.randomUUID();
    localStorage.setItem("tvam_userId", id);
    return id;
})();

function goToScreen(n) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen' + n).classList.add('active');
    if (n === 3) startCountdown();
}

function startCountdown() {
   let timeLeft = 60;
    const el = document.getElementById("countdown");
    const progressBar = document.querySelector(".progress-bar");
    const thumb = document.querySelector(".progress-thumb");

    const interval = setInterval(() => {
        el.textContent = timeLeft--;
        const progressPercent = ((60 - timeLeft) / 60) * 100;
        progressBar.style.setProperty('--progress', `${progressPercent}%`);
        thumb.style.setProperty('--progress', `${progressPercent}%`);

        if (timeLeft < 0) {
            clearInterval(interval);
            goToScreen(4);
        }
    }, 1000);
}

// Speech
function speakText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US"; // You can change this to another language code
    utterance.rate = 0.95; // Speed (1 is normal, <1 slower, >1 faster)
    utterance.pitch = 1; // Voice pitch
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
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ 
                userId, 
                message: input 
            })
        });

        const data = await result.json();
        console.log("📜 Response from backend:", data);

        if (!data.choices || !data.choices[0]) {
            throw new Error("No response from the guru.");
        }

        const response = data.choices[0].message.content;
        responseEl.textContent = response;

        //Call speech
        speakText(response);

        responseEl.style.opacity = 1;

        // setTimeout(() => {
        //     responseEl.style.opacity = 0;
        // }, 60000);
    } catch (err) {
        responseEl.textContent = `🌧 The guru is silent... ${err.message}`;
        responseEl.style.opacity = 1;
    }

    document.getElementById('userInput').value = "";
}
