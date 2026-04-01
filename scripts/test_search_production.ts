import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

async function testProductionEmbed() {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY as string });
    const query = "Qu'est-ce que l'ostéopathie ?";

    console.log("Testing Pinecone Embed API...");
    try {
        const embeddingResponse = await pc.inference.embed({
            model: "llama-text-embed-v2",
            inputs: [query],
            parameters: { inputType: "query", truncate: "END" }
        });
        console.log("Pinecone Embed Success. Values length:", (embeddingResponse.data[0] as any).values?.length);
    } catch (error: any) {
        console.error("Pinecone Embed Error:", error.message || error);
    }
}

testProductionEmbed();
