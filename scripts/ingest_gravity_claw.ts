import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const PINECONE_API_KEY = process.env.PINECONE_API_KEY?.replace(/\\n/g, '').trim();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.replace(/\\n/g, '').trim();

if (!PINECONE_API_KEY || !OPENAI_API_KEY) {
    console.error("Missing environment variables: PINECONE_API_KEY or OPENAI_API_KEY");
    process.exit(1);
}

const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index('gravity-claw');
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const ROOT_PATH = path.resolve(process.cwd(), '../Cerveau_GravityClaw');

const DIRECTORY_METADATA_MAP: Record<string, { author: string; theme: string }> = {
    'BIOKINERGIE ': { author: 'Michel Lidoreau', theme: 'Biokinergie' },
    'COURS D\'EMBRYOLOGIE': { author: 'Marc Damoiseaux', theme: 'Embryologie' },
    'OSTEOPATHIE AVEC GERARD MONTET': { author: 'Gérard Montet', theme: 'Ostéopathie' },
    'OSTEOPATHIE BIODYNAMIQUE AVEC ANSELIN': { author: 'Pascal Anselin', theme: 'Ostéopathie Biodynamique' },
    'PODCAST RETRANSCRIPTIONS': { author: 'Philippe Guillaume', theme: 'Podcasts' },
};

async function walkDir(dir: string, baseDir: string = dir): Promise<{ filePath: string, metadata: any }[]> {
    const files: { filePath: string, metadata: any }[] = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.') || entry.name === 'Markdown_Propre') continue;

            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...(await walkDir(fullPath, baseDir)));
            } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt') || entry.name.endsWith('.vtt'))) {
                // Find matching metadata based on directory name
                const relPath = path.relative(baseDir, fullPath);
                const topLevelDir = relPath.split(path.sep)[0];

                const metadata = DIRECTORY_METADATA_MAP[topLevelDir] || { author: 'Inconnu', theme: 'Général' };

                files.push({ filePath: fullPath, metadata });
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
    return chunks; // If still too large, could split by \n or . but shouldn't be an issue for these files
}

async function processFile(filePath: string, docMetadata: any) {
    try {
        const text = await fs.readFile(filePath, 'utf-8');
        const chunks = chunkText(text);
        const fileName = path.basename(filePath);

        console.log(`Processing ${fileName} (${chunks.length} chunks) from ${docMetadata.author} [${docMetadata.theme}]`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (!chunk) continue;

            // Generate embedding using OpenAI
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: chunk,
            });
            const embedding = embeddingResponse.data[0].embedding;

            const id = crypto.randomUUID();

            const record = {
                id,
                values: embedding,
                metadata: {
                    text: chunk,
                    type: 'document',
                    source: fileName,
                    filepath: filePath,
                    author: docMetadata.author,
                    theme: docMetadata.theme,
                    createdAt: new Date().toISOString()
                }
            };

            await index.upsert({ records: [record] });
            console.log(`  -> Upserted chunk ${i + 1}/${chunks.length} of ${fileName}`);
        }
    } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
    }
}

async function main() {
    console.log(`Starting ingestion into Gravity Claw from: ${ROOT_PATH}`);
    const files = await walkDir(ROOT_PATH);
    console.log(`Found ${files.length} valid text/markdown files to ingest.`);

    console.log("Clearing existing vectors in gravity-claw index...");
    try {
        await index.deleteAll();
        console.log("Cleared.");
    } catch (e) {
        console.log("DeleteAll failed, probably index is already empty or namespace issue:", e);
    }

    let processed = 0;
    for (const file of files) {
        await processFile(file.filePath, file.metadata);
        processed++;
        console.log(`[Progress: ${processed}/${files.length} files]`);
    }

    console.log('✅ Ingestion massive terminée pour Gravity Claw.');
}

main().catch(console.error);
