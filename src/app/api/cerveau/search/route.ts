import { NextRequest, NextResponse } from "next/server";
import { pinecone, PINECONE_MISSION_INDEX, PINECONE_GRAVITY_INDEX } from "@/lib/pinecone";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { query, messages, topK = 5, brain = "mission", author, theme } = body;

        let chatMessages = messages || [];
        let currentQuery = query || "";

        // Compatibility logic if called with a single query, or extracting last message
        if (chatMessages.length === 0 && currentQuery) {
            chatMessages = [{ role: "user", content: currentQuery }];
        } else if (chatMessages.length > 0 && !currentQuery) {
            // Find the last user message to use for semantic search
            const userMessages = chatMessages.filter((m: any) => m.role === "user");
            const lastUserMsg = userMessages[userMessages.length - 1];
            currentQuery = lastUserMsg ? lastUserMsg.content : "";
        }

        if (!currentQuery && chatMessages.length === 0) {
            return NextResponse.json({ error: "Missing query or messages" }, { status: 400 });
        }

        let indexName = PINECONE_MISSION_INDEX;
        if (brain === "gravity") {
            indexName = PINECONE_GRAVITY_INDEX;
        }

        // 1. Generate Embedding using the most recent user query to fetch context
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: currentQuery,
        });
        const embeddingVector = embeddingResponse.data[0].embedding;

        // 2. Query Pinecone
        const index = pinecone.index(indexName);

        let filter: Record<string, any> | undefined = undefined;
        if (author || theme) {
            filter = {};
            if (author) filter.author = author;
            if (theme) filter.theme = theme;
        }

        const queryResponse = await index.query({
            vector: embeddingVector,
            topK: topK,
            includeMetadata: true,
            filter: filter,
        });

        // 3. Generate AI Synthesis using history
        const matches = queryResponse.matches || [];
        let contextText = "";

        if (matches.length > 0) {
            contextText = matches
                .map((match: any) => match.metadata?.text)
                .filter(Boolean)
                .join("\n\n---\n\n");
        }

        const systemPrompt = `Tu es un assistant expert médical et d'analyse de données (Ostéopathie, Embryologie, Biokinergie, etc). 
L'utilisateur te pose une question ou discute avec toi. Tu dois répondre de manière claire, précise et directe.
Si un contexte extrait de la base de données est fourni ci-dessous, utilise-le en priorité pour informer ta réponse à sa dernière question. 
S'il te demande de préciser ou de développer, fais-le en t'appuyant sur l'historique de votre conversation et sur ce contexte.
Structure bien ta réponse (utilise du Markdown, des listes à puces si besoin). Ne mentionne pas "D'après la base de données", réponds directement à la question courante.

<contexte_base_de_donnees_lié_a_la_derniere_question>
${contextText || "Aucun contexte spécifique récent trouvé."}
</contexte_base_de_donnees_lié_a_la_derniere_question>`;

        const openaiMessages = [
            { role: "system", content: systemPrompt },
            ...chatMessages
        ];

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: openaiMessages,
            temperature: 0.2, // Low temp to avoid hallucinations
        });

        const synthesis = aiResponse.choices[0]?.message?.content;

        return NextResponse.json({
            success: true,
            matches: matches,
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
