import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
const PINECONE_API_KEY = process.env.PINECONE_API_KEY?.replace(/\\n/g, '').trim();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.replace(/\\n/g, '').trim();

async function testDirectSearch() {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY! });
    const pc = new Pinecone({ apiKey: PINECONE_API_KEY! });
    const index = pc.index('gravity-claw');

    const query = "Que dit Gérard Montet sur les techniques tissulaires ?";

    console.log("1. Generating Embedding for query:", query);
    try {
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: query,
        });
        const embeddingVector = embeddingResponse.data[0].embedding;
        console.log("Embedding generated successfully.");

        console.log("2. Querying Pinecone...");
        const queryResponse = await index.query({
            vector: embeddingVector,
            topK: 5,
            includeMetadata: true
        });

        console.log("Pinecone matches found:", queryResponse.matches.length);

        if (queryResponse.matches && queryResponse.matches.length > 0) {
            const contextText = queryResponse.matches
                .map((match: any) => match.metadata?.text)
                .filter(Boolean)
                .join("\n\n---\n\n");

            const prompt = `Tu es un assistant expert médical et d'analyse de données (Ostéopathie, Embryologie, Biokinergie, etc). 
L'utilisateur te pose une question. Voici les résultats pertinents trouvés dans la base de connaissance :

<contexte_base_de_donnees>
${contextText}
</contexte_base_de_donnees>

<question_utilisateur>${query}</question_utilisateur>

Tâche : Rédige une synthèse claire, précise et directe qui répond à la question de l'utilisateur EN UTILISANT EXCLUSIVEMENT les informations présentes dans le <contexte_base_de_donnees>.`;

            console.log("3. Asking OpenAI to synthesize...");
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
            });
            console.log("\n=== Synthèse ===");
            console.log(aiResponse.choices[0]?.message?.content);
            console.log("================\n");
            console.log("SUCCESS! All APIs are working properly.");
        } else {
            console.log("No context found in Pinecone.");
        }
    } catch (err: any) {
        console.error("ERROR OCCURRED:", err.message || err);
    }
}

testDirectSearch().catch(console.error);
