import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const PINECONE_API_KEY = process.env.PINECONE_API_KEY?.replace(/\\n/g, '').trim();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.replace(/\\n/g, '').trim();

if (!PINECONE_API_KEY || !OPENAI_API_KEY) {
    console.error("Missing API keys");
    process.exit(1);
}

const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function testSearch() {
    console.log("Testing OpenAI Embeddings + Pinecone Search on gravity-claw...");
    const query = "Qu'est-ce que l'ostéopathie ?";

    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: query,
        });

        const embeddingVector = response.data[0].embedding;
        console.log("OpenAI Embedding Generated. Dimensions:", embeddingVector.length);

        const index = pc.index('gravity-claw');
        const queryResponse = await index.query({
            vector: embeddingVector,
            topK: 3,
            includeMetadata: true,
        });

        console.log(`Pinecone Search Success. Found ${queryResponse.matches.length} matches.`);
        queryResponse.matches.forEach((match, i) => {
            console.log(`Match ${i + 1}: Score ${match.score}, Document: ${match.metadata?.source}`);
        });

    } catch (e: any) {
        console.error("Search Error:", e);
    }
}

testSearch();
