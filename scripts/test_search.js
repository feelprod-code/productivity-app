const fetch = require('node-fetch');

async function testSearch() {
    const url = 'http://localhost:3000/api/cerveau/search';
    const payload = {
        query: "Qu'est-ce que l'ostéopathie ?",
        brain: "gravity"
    };

    console.log("Sending POST request to", url);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error("HTTP Error", res.status, await res.text());
            return;
        }

        const data = await res.json();
        console.log("Success:", data.success);
        console.log("Synthesis:", data.synthesis ? data.synthesis.substring(0, 100) + "..." : null);
        console.log("Matches:", data.matches ? data.matches.length : 0);
    } catch (err) {
        console.error("Error:", err);
    }
}

testSearch();
