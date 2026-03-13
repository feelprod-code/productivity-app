import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY as string });

async function check() {
    try {
        console.log("Listing indexes...");
        const indexList = await pc.listIndexes();
        console.log("Indexes:", JSON.stringify(indexList, null, 2));

        if (indexList.indexes && indexList.indexes.length > 0) {
            for (const indexMeta of indexList.indexes) {
                console.log(`\nStats for index: ${indexMeta.name}`);
                const index = pc.index(indexMeta.name);
                const stats = await index.describeIndexStats();
                console.log(JSON.stringify(stats, null, 2));
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

check();
