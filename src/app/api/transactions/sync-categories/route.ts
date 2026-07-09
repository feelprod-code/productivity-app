import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BASE_URL = "https://app.pennylane.com/api/external/v2";

const CATEGORY_PREFIXES: Record<string, string> = {
    LOGICIELS_IA: "[IA & LOGICIELS]",
    RESTAURANT: "[RESTAURANT]",
    FOURNITURES: "[FOURNITURES]",
    DEPLACEMENTS: "[DEPLACEMENTS]",
    CABINET: "[CABINET]",
    COTISATIONS: "[COTISATIONS]"
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: RequestInit = {}, maxAttempts = 5): Promise<Response> {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const res = await fetch(url, options);
        if (res.status === 429) {
            attempts++;
            const delay = Math.pow(2, attempts) * 1000;
            console.warn(`[Sync API] Rate limit (429) détecté. Retentative dans ${delay}ms...`);
            await sleep(delay);
            continue;
        }
        return res;
    }
    throw new Error(`Max fetch attempts reached for URL: ${url}`);
}

export async function POST(req: Request) {
    console.log("🚀 [API Sync Categories] Démarrage de la synchronisation Pennylane...");

    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    if (!pennylaneKey) {
        return NextResponse.json({ error: "Clé d'API Pennylane manquante dans le fichier .env" }, { status: 500 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const year = body.year ? parseInt(body.year) : null;
        
        // 1. Charger les overrides depuis la base
        const overrides = await prisma.transactionOverride.findMany({
            where: {
                category: {
                    not: null
                }
            }
        });

        const overridesMap = new Map<string, string>();
        overrides.forEach(o => {
            overridesMap.set(o.id, o.category || "");
        });

        console.log(`[API Sync Categories] ${overrides.length} surcharges chargées depuis la base.`);

        // 2. Récupérer les transactions depuis Pennylane pour l'année ciblée
        let txCursor: string | null = null;
        const allTxs: any[] = [];
        
        // Définir la plage de dates
        const startDate = year ? `${year}-01-01` : "2025-01-01";
        const endDate = year ? `${year}-12-31` : null;
        
        const filterObj: any[] = [{ field: "date", operator: "gteq", value: startDate }];
        if (endDate) {
            filterObj.push({ field: "date", operator: "lteq", value: endDate });
        }
        const filterStr = encodeURIComponent(JSON.stringify(filterObj));

        // Fetch up to 10 pages of transactions for the selected period
        for (let page = 1; page <= 10; page++) {
            const fetchUrl = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
            const res = await fetchWithRetry(fetchUrl, {
                headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
            });
            if (!res.ok) break;
            const data: any = await res.json();
            const items = data.transactions || data.items || [];
            if (items.length === 0) break;
            allTxs.push(...items);
            txCursor = (data.next_cursor || data.meta?.next_cursor || null) as string | null;
            if (!txCursor) break;
            await sleep(100);
        }

        console.log(`[API Sync Categories] ${allTxs.length} transactions récupérées de Pennylane pour la période.`);

        // 3. Filtrer uniquement les transactions de la période qui ont un override local
        const txsToSync = allTxs.filter(tx => overridesMap.has(String(tx.id)));
        console.log(`[API Sync Categories] ${txsToSync.length} transactions à vérifier/synchroniser.`);

        let processedCount = 0;
        let invoicesUpdatedCount = 0;
        let unmatchedCount = 0;

        for (const tx of txsToSync) {
            const txId = String(tx.id);
            const category = overridesMap.get(txId) || "";

            await sleep(150);

            // Récupérer les factures associées
            const matchUrl = `${BASE_URL}/transactions/${txId}/matched_invoices`;
            const matchRes = await fetchWithRetry(matchUrl, {
                headers: {
                    'Authorization': `Bearer ${pennylaneKey}`,
                    'Accept': 'application/json'
                }
            });

            if (!matchRes.ok) {
                console.error(`[API Sync Categories] Impossible d'obtenir les correspondances pour la transaction ${txId}`);
                continue;
            }

            const matchData: any = await matchRes.json();
            const matchedInvoices = matchData.supplier_invoices || matchData.items || [];
            
            processedCount++;

            if (matchedInvoices.length === 0) {
                continue;
            }

            for (const invShort of matchedInvoices) {
                await sleep(100);
                const invUrl = `${BASE_URL}/supplier_invoices/${invShort.id}`;
                const invRes = await fetchWithRetry(invUrl, {
                    headers: {
                        'Authorization': `Bearer ${pennylaneKey}`,
                        'Accept': 'application/json',
                        'X-Use-2026-API-Changes': 'true'
                    }
                });

                if (!invRes.ok) continue;
                const invData: any = await invRes.json();
                const inv = invData.supplier_invoice || invData.item || invData;

                if (category === "PERSO") {
                    // Unmatch
                    const deleteUrl = `${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions/${txId}`;
                    const delRes = await fetchWithRetry(deleteUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        }
                    });

                    if (delRes.ok || delRes.status === 204) {
                        unmatchedCount++;
                    }

                    // Rename
                    let cleanLabel = inv.label || "Facture";
                    cleanLabel = cleanLabel.replace(/^A SUPPRIMER - REJETE - /gi, '');
                    const newLabel = `A SUPPRIMER - REJETE - PERSO - ${cleanLabel}`;

                    await fetchWithRetry(`${BASE_URL}/supplier_invoices/${inv.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({ label: newLabel })
                    });
                } else {
                    const prefix = CATEGORY_PREFIXES[category];
                    if (!prefix) continue;

                    let cleanLabel = (inv.label || "").replace(/^\[.*?\]\s*/i, "").trim();
                    const newLabel = `${prefix} ${cleanLabel}`;

                    if (inv.label !== newLabel) {
                        const updateRes = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${inv.id}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${pennylaneKey}`,
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'X-Use-2026-API-Changes': 'true'
                            },
                            body: JSON.stringify({ label: newLabel })
                        });
                        if (updateRes.ok) {
                            invoicesUpdatedCount++;
                        }
                    }
                }
            }
        }

        console.log(`🏁 [API Sync Categories] Synchronisation terminée. ${txsToSync.length} transactions scannées. ${invoicesUpdatedCount} factures renommées, ${unmatchedCount} dé-lettrages perso.`);

        return NextResponse.json({
            success: true,
            scannedTransactions: txsToSync.length,
            invoicesUpdated: invoicesUpdatedCount,
            unmatchedPerso: unmatchedCount
        });

    } catch (error: any) {
        console.error("❌ [API Sync Categories] Erreur :", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
