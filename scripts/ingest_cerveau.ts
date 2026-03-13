import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!PINECONE_API_KEY || !OPENAI_API_KEY) {
    console.error("Missing environment variables: PINECONE_API_KEY or OPENAI_API_KEY");
    process.exit(1);
}

const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index('cerveau-mission');
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// The root path to search for legacy data
const ROOT_PATH = process.argv[2] || path.resolve(process.cwd(), '../_MY_AI_DNA');
const BATCH_SIZE = 100; // Pinecone upsert batch size

async function walkDir(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;

            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...(await walkDir(fullPath)));
            } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        console.error(`Failed to read directory ${dir}:`, error);
    }
    return files;
}

function chunkText(text: string, maxLen: number = 3000): string[] {
    const paragraphs = text.split('\n\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
        if (currentChunk.length + para.length > maxLen) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = para + '\n\n';
        } else {
            currentChunk += para + '\n\n';
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

async function processFile(filePath: string) {
    try {
        const text = await fs.readFile(filePath, 'utf-8');
        const chunks = chunkText(text);
        const fileName = path.basename(filePath);

        console.log(`Processing ${fileName} (${chunks.length} chunks)`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (!chunk) continue;

            // Create embedding
            const response = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: chunk,
            });

            const embedding = response.data[0].embedding;
            const id = crypto.randomUUID();

            const record = {
                id,
                values: embedding,
                metadata: {
                    text: chunk,
                    type: filePath.includes('/skills/') ? 'skill' : 'legacy_document',
                    source: fileName,
                    filepath: filePath,
                    createdAt: new Date().toISOString()
                }
            };

            // Ensure we hit Pinecone v7.x format { records: [...] }
            await index.upsert({ records: [record] });
            console.log(`  -> Upserted chunk ${i + 1}/${chunks.length} of ${fileName}`);
        }
    } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
    }
}

async function main() {
    console.log(`Starting massive ingestion from: ${ROOT_PATH}`);
    const files = await walkDir(ROOT_PATH);
    console.log(`Found ${files.length} valid text/markdown files.`);

    let processed = 0;
    for (const file of files) {
        await processFile(file);
        processed++;
        console.log(`[Progress: ${processed}/${files.length} files]`);
    }

    console.log('✅ Ingestion massive terminée.');
}

main().catch(console.error);
