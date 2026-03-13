import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: 'pcsk_4wbGC4_FB8qj4rFDpD18QfafMS2U36R5QM2ANosDTjMfRMk9SFoW2teP4hs1Ue8BLfTwz7' });

async function main() {
  console.log("Creating Pinecone index 'cerveau-mission'...");
  await pc.createIndex({
    name: 'cerveau-mission',
    dimension: 1536, // Dimension for text-embedding-3-small
    metric: 'cosine',
    spec: { 
      serverless: { 
        cloud: 'aws', 
        region: 'us-east-1' 
      }
    } 
  });
  console.log("Done!");
}

main().catch(console.error);
