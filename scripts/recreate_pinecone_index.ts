import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!.replace('\\n', '').trim(),
});

const indexName = 'gravity-claw';

async function main() {
    console.log(`Checking if index ${indexName} exists...`);
    const existingIndexes = await pc.listIndexes();
    const exists = existingIndexes.indexes?.some((i) => i.name === indexName);

    if (exists) {
        console.log(`Deleting existing index ${indexName}...`);
        await pc.deleteIndex(indexName);
        console.log(`Deleted ${indexName}.`);
    }

    console.log(`Creating new index ${indexName} with 1536 dimensions...`);
    await pc.createIndex({
        name: indexName,
        dimension: 1536,
        metric: 'cosine',
        spec: {
            serverless: {
                cloud: 'aws',
                region: 'us-east-1'
            }
        }
    });
    console.log(`Created index ${indexName} successfully.`);
}

main().catch(console.error);
