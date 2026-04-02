import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
const PINECONE_API_KEY = process.env.PINECONE_API_KEY?.replace(/\\n/g, '').trim();

async function check() {
    const pc = new Pinecone({ apiKey: PINECONE_API_KEY! });
    const index = pc.index('gravity-claw');

    const queryResponse = await index.query({
        vector: new Array(1536).fill(0.1), // Dummy vector
        topK: 10,
        includeMetadata: true
    });

    console.log("Found matches: ", queryResponse.matches.length);
    for (const match of queryResponse.matches) {
        console.log(`Author: ${match.metadata?.author}, Theme: ${match.metadata?.theme}, Source: ${match.metadata?.source}`);
    }
}

check().catch(console.error);
