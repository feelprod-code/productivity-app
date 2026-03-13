import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

// In NextJs contexts we use standard fetch to OpenAI to avoid library issues sometimes, or the official SDK
// Here we'll just do it simply via fetch for OpenAI or use the SDK if we had it imported, but since this is a script,
// we'll just require Pinecone and standard fetch.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'gravity-claw';
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;

if (!PINECONE_API_KEY) {
    console.error("Missing PINECONE_API_KEY in .env.local");
    process.exit(1);
}

const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.Index(PINECONE_INDEX_NAME);

// Excluded directories to not read useless markdown
const EXCLUDED_DIRS = ['node_modules', '.git', '.next', 'dist', '.gemini', 'public', 'assets'];

function walkDir(dir, callback) {
    const ext = '.md';
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        if (fs.statSync(dirPath).isDirectory()) {
            if (!EXCLUDED_DIRS.includes(f) && !f.startsWith('.')) {
                walkDir(dirPath, callback);
            }
        } else {
            if (f.endsWith(ext)) {
                callback(dirPath);
            }
        }
    });
}

function chunkString(str, length) {
    const chunks = [];
    for (let i = 0; i < str.length; i += length) {
        chunks.push(str.substring(i, i + length));
    }
    return chunks;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function main() {
    const baseDir = path.resolve(process.cwd(), '..'); // /Users/guillaumephilippe/ANTIGRAVITY
    const files = [];

    console.log(`🔍 Scanning directory: ${baseDir}...`);
    walkDir(baseDir, (filepath) => {
        files.push(filepath);
    });

    console.log(`✅ Found ${files.length} markdown files. Starting ingestion...`);

    let ingestedCount = 0;

    for (let i = 0; i < files.length; i++) {
        const filepath = files[i];
        const relativePath = path.relative(baseDir, filepath);
        console.log(`[${i + 1}/${files.length}] Processing: ${relativePath}`);

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            if (!content || content.trim().length === 0) continue;

            // Pinecone llama-text-embed-v2 limits tokens. We chunk by ~20k characters (roughly 5k-6k tokens)
            // if needed. But let's be safe and chunk at 10k chars.
            const chunks = chunkString(content, 10000);

            for (let j = 0; j < chunks.length; j++) {
                const chunkContent = chunks[j];

                // Request embedding via Pinecone Inference
                const embeddingResponse = await pc.inference.embed({
                    model: "llama-text-embed-v2",
                    inputs: [chunkContent],
                    parameters: { inputType: "passage", truncate: "END" }
                });

                const embeddingVector = embeddingResponse.data[0].values;
                const id = crypto.randomUUID();

                const metadata = {
                    text: chunkContent,
                    source: "legacy_import",
                    type: "markdown",
                    filepath: relativePath,
                    chunk: j + 1,
                    totalChunks: chunks.length,
                    createdAt: new Date().toISOString()
                };

                await index.upsert({
                    records: [{ id, values: embeddingVector, metadata }]
                });

                ingestedCount++;
            }

            // Simple rate limit to avoid spamming the API
            await delay(300);

        } catch (error) {
            console.error(`❌ Error processing ${relativePath}:`, error.message);
        }
    }

    console.log(`🎉 Ingestion complete! Successfully ingested ${ingestedCount} chunks from ${files.length} files.`);
}

main().catch(console.error);
