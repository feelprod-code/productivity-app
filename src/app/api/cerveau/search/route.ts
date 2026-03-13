import { NextRequest, NextResponse } from "next/server";
import { pinecone, PINECONE_MISSION_INDEX, PINECONE_GRAVITY_INDEX } from "@/lib/pinecone";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { query, topK = 5, brain = "mission", author, theme } = body;

        if (!query) {
            return NextResponse.json({ error: "Missing 'query' field" }, { status: 400 });
        }

        let embeddingVector: number[] = [];
        let indexName = PINECONE_MISSION_INDEX;

        // 1. Generate Embedding based on selected Brain
        if (brain === "gravity") {
            indexName = PINECONE_GRAVITY_INDEX;
            // Generate embedding using Pinecone Inference API (matches gravity-claw 1024 dims)
            const embeddingResponse = await pinecone.inference.embed({
                model: "llama-text-embed-v2",
                inputs: [query],
                parameters: { inputType: "query", truncate: "END" }
            });
            const embeddingData = embeddingResponse.data[0] as any;
            embeddingVector = embeddingData.values;
        } else {
            // Default to Mission brain using OpenAI text-embedding-3-small (1536 dims)
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: query,
            });
            embeddingVector = embeddingResponse.data[0].embedding;
        }

        // 2. Query Pinecone using the generated vector
        const index = pinecone.index(indexName);

        // Build metadata filter
        let filter: Record<string, any> | undefined = undefined;
        if (author || theme) {
            filter = {};
            if (author) {
                filter.author = author;
            }
            if (theme) {
                filter.theme = theme;
            }
        }

        const queryResponse = await index.query({
            vector: embeddingVector,
            topK: topK,
            includeMetadata: true,
            filter: filter,
        });

        // Generate AI Synthesis based on retrieved results
        let synthesis = null;
        if (queryResponse.matches && queryResponse.matches.length > 0) {
            const contextText = queryResponse.matches
                .map((match: any) => match.metadata?.text)
                .filter(Boolean)
                .join("\n\n---\n\n");

            const prompt = `Tu es un assistant expert médical et d'analyse de données (Ostéopathie, Embryologie, Biokinergie, etc). 
L'utilisateur te pose une question. Voici les résultats pertinents trouvés dans la base de connaissance :

<contexte_base_de_donnees>
${contextText}
</contexte_base_de_donnees>

<question_utilisateur>${query}</question_utilisateur>

Tâche : Rédige une synthèse claire, précise et directe qui répond à la question de l'utilisateur EN UTILISANT EXCLUSIVEMENT les informations présentes dans le <contexte_base_de_donnees>.
Structure bien ta réponse (utilise du Markdown, des listes à puces si besoin). Ne mentionne pas "D'après la base de données", réponds directement à la question. Si le contexte ne contient pas la réponse exacte, fais de ton mieux avec ce que tu as ou dis que la réponse directe n'est pas trouvée.`;

            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2, // Faible température pour éviter les hallucinations
            });
            synthesis = aiResponse.choices[0]?.message?.content;
        }

        // 3. Return formatting the Pinecone matching records
        return NextResponse.json({
            success: true,
            matches: queryResponse.matches,
            brain: brain,
            synthesis: synthesis,
            appliedFilters: { author, theme }
        });

    } catch (error: any) {
        console.error("[Cerveau Search] Error:", error);
        return NextResponse.json(
            { error: "Search failed", details: error.message || String(error) },
            { status: 500 }
        );
    }
}
