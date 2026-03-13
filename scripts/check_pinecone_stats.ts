import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const indexes = await pc.listIndexes();
  console.log("Indexes found:", JSON.stringify(indexes, null, 2));

  const index = pc.index('cerveau-mission');
  const stats = await index.describeIndexStats();
  console.log("Stats for cerveau-mission:", JSON.stringify(stats, null, 2));
}
main().catch(console.error);
