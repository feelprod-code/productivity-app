import { NextRequest, NextResponse } from "next/server";
import { pinecone, PINECONE_GRAVITY_INDEX } from "@/lib/pinecone";
import { openai } from "@/lib/openai";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        // 1. Verify Authorization (Basic API Key security)
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${process.env.MISSION_API_SECRET}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Parse incoming payload (Assuming from Telegram bot via Zapier/Make)
        const body = await req.json();
        const { text, source = "telegram", type = "note" } = body;

        if (!text) {
            return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
        }

        console.log(`[Cerveau] Received new note from ${source}: "${text.substring(0, 30)}..."`);

        // 3. Generate Embedding using Pinecone Inference API (matches gravity-claw 1024 dims)
        const embeddingResponse = await pinecone.inference.embed({
            model: "llama-text-embed-v2",
            inputs: [text],
            parameters: { inputType: "passage", truncate: "END" }
        });

        const embeddingData = embeddingResponse.data[0] as any;
        const embeddingVector = embeddingData.values;

        // 4. Prepare metadata for Pinecone
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        // We can ask an LLM here to auto-tag the note if it belongs to "Livre TDT", "Factures", etc,
        // but for now, we just ingest it directly to establish the pipeline.
        const metadata = {
            text: text,
            source: source,
            type: type, // e.g., 'livre', 'vrac', 'podcast'
            createdAt: timestamp,
        };

        // 5. Upsert to Pinecone
        const index = pinecone.Index(PINECONE_GRAVITY_INDEX);

        console.log(`[Cerveau Debug] Payload ID: ${id}`);
        console.log(`[Cerveau Debug] Vector length: ${embeddingVector?.length}, isArray: ${Array.isArray(embeddingVector)}`);
        console.log(`[Cerveau Debug] Metadata keys: ${Object.keys(metadata).join(', ')}`);

        // newer pinecone SDK versions want { records: array }
        await index.upsert({
            records: [
                {
                    id: id,
                    values: embeddingVector,
                    metadata: metadata,
                }
            ]
        });

        console.log(`[Cerveau] Successfully ingested vector ID: ${id}`);

        return NextResponse.json({
            success: true,
            message: "Knowledge ingested successfully into Le Cerveau.",
            id: id,
        });

    } catch (error: any) {
        console.error("[Cerveau] Error during ingestion:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error.message || String(error) },
            { status: 500 }
        );
    }
}
