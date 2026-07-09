const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function test() {
    const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-pro'];
    for (const m of models) {
        try {
            console.log(`Testing model: ${m}...`);
            const response = await ai.models.generateContent({
                model: m,
                contents: 'Hello, what is your name?'
            });
            console.log(`✅ Success with ${m}: ${response.text ? response.text.substring(0, 100) : ''}`);
            break;
        } catch (e) {
            console.log(`❌ Fail with ${m}: ${e.message}`);
        }
    }
}

test();
