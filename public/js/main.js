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
    const interval = setInterval(() => {
        el.textContent = timeLeft--;
        if (timeLeft < 0) {
            clearInterval(interval);
            goToScreen(4);
        }
    }, 1000);
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
