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

    const messages = [
        {
            role: "system",
            content: "You are a compassionate emotional presence-mapper and guide. When the user shares something with you, your task is to understand the emotional energy state (based on the three gunas: Rajas, Tamas, Sattva) and their current inner phase of spiritual readiness, in order to determine how the guru should respond. Energy States: Rajas = movement, desire, agitation, craving, anxiety, externally focused; Tamas = heaviness, numbness, avoidance, confusion, apathy, depression, fog; Sattva = clarity, balance, stillness, openness, present-moment awareness. A user may show signs of a blend (e.g., Rajas + Tamas). Phases: Phase 1 = emotionally raw, confused, seeking relief → guru responds with soothing, validating, gentle companionship. Phase 2 = curious, semi-open, reflective → guru responds with gentle inward nudges through questions. Phase 3 = quiet, contemplative, ready for stillness → guru responds with minimal, presence-based, non-dual reflection. Your job is to determine: 1) Emotion felt, 2) Energy state, 3) Phase, 4) Guru response tone. Do not explain your reasoning. Do not use keyword matching. Rely only on semantic and emotional meaning. Output only this format: Emotion felt: [short emotional description], Energy state: [Rajas / Tamas / Sattva or a blend], Phase: [1/2/3], Guru response should be: [tone or attitude], Guru's response:"
        },
        {
            role: "user",
            content: input
        }
    ];

    try {
        const result = await fetch("/ask-guru", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages })
        });

        const data = await result.json();
        console.log("📜 Response from backend:", data);

        if (!data.choices || !data.choices[0]) {
            throw new Error("No response from the guru.");
        }

        const response = data.choices[0].message.content;
        responseEl.textContent = response;
        responseEl.style.opacity = 1;

        setTimeout(() => {
            responseEl.style.opacity = 0;
        }, 60000);
    } catch (err) {
        responseEl.textContent = `🌧 The guru is silent... ${err.message}`;
        responseEl.style.opacity = 1;
    }

    document.getElementById('userInput').value = "";
}
