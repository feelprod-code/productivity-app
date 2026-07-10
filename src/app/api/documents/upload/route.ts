import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://app.pennylane.com/api/external/v2";

const CATEGORY_PREFIXES: Record<string, string> = {
    LOGICIELS_IA: "[IA & LOGICIELS]",
    RESTAURANT: "[RESTAURANT]",
    FOURNITURES: "[FOURNITURES]",
    DEPLACEMENTS: "[DEPLACEMENTS]",
    CABINET: "[CABINET]",
    COTISATIONS: "[COTISATIONS]"
};

function extractKeywords(label: string): string[] {
    const cleaned = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const stopwords = new Set([
        "numero", "num", "no", "payout", "payouts", "eur", "usd", "ref", "releve", "dun",
        "sepa", "recu", "prelvt", "prlv", "confrere", "facture", "fact", "inv", "invoice",
        "virement", "instantane", "transfer", "vir", "inst", "paiement", "cb", "date",
        "com", "net", "org", "www"
    ]);

    const words = cleaned.split(" ");
    return words.filter(word => word.length >= 2 && !stopwords.has(word) && isNaN(Number(word)));
}

export async function POST(req: Request) {
    console.log("🚀 [API Upload Document] Démarrage du téléversement Pennylane...");

    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    if (!pennylaneKey) {
        return NextResponse.json({ error: "Clé d'API Pennylane manquante dans le fichier .env" }, { status: 500 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const supplierName = (formData.get("supplier_name") as string || "INCONNU").toUpperCase().trim();
        const dateStr = formData.get("date") as string || ""; // YYYY-MM-DD
        const amount = parseFloat(formData.get("amount") as string || "0");
        const description = formData.get("description") as string || "Achat";
        const category = formData.get("category") as string || "";

        if (!file || !supplierName || !dateStr || amount <= 0) {
            return NextResponse.json({ error: "Champs obligatoires manquants ou invalides" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 1. Définir le nom normalisé
        const fileExt = file.name.split('.').pop() || 'pdf';
        const normalizedFilename = `${dateStr} - ${supplierName} - ${description.replace(/\s+/g, ' ')} - ${amount.toFixed(2)}€.${fileExt}`;

        // 2. Préfixe de la catégorie pour le libellé Pennylane
        const prefix = CATEGORY_PREFIXES[category] || "";
        const cleanLabel = prefix ? `${prefix} ${supplierName} - ${description}` : `${supplierName} - ${description}`;

        // 3. Téléverser le fichier sur Pennylane
        console.log(`[API Upload] Téléversement du document : ${normalizedFilename}`);
        const pennylaneFormData = new FormData();
        const blob = new Blob([buffer], { type: file.type || "application/pdf" });
        pennylaneFormData.append("file", blob, normalizedFilename);

        const uploadRes = await fetch(`${BASE_URL}/file_attachments`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${pennylaneKey}`,
                "Accept": "application/json",
                "X-Use-2026-API-Changes": "true"
            },
            body: pennylaneFormData
        });

        if (!uploadRes.ok) {
            return NextResponse.json({ error: `Échec du téléversement du fichier Pennylane (Status ${uploadRes.status})` }, { status: 500 });
        }

        const uploadData: any = await uploadRes.json();
        const fileAttachmentId = uploadData.id;

        // 4. Trouver ou créer le fournisseur sur Pennylane
        console.log(`[API Upload] Recherche du fournisseur : ${supplierName}`);
        const suppliersRes = await fetch(`${BASE_URL}/suppliers?limit=100`, {
            headers: { "Authorization": `Bearer ${pennylaneKey}`, "Accept": "application/json" }
        });
        if (!suppliersRes.ok) {
            return NextResponse.json({ error: "Échec de récupération des fournisseurs" }, { status: 500 });
        }
        const suppData = await suppliersRes.json();
        const suppliersList = suppData.suppliers || suppData.items || [];
        
        let supplierId = suppliersList.find((s: any) => 
            s.name.toUpperCase().includes(supplierName) || supplierName.includes(s.name.toUpperCase())
        )?.id;

        if (!supplierId) {
            console.log(`[API Upload] Création du fournisseur "${supplierName}" sur Pennylane...`);
            const createSupplierRes = await fetch(`${BASE_URL}/suppliers`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${pennylaneKey}`,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Use-2026-API-Changes": "true"
                },
                body: JSON.stringify({ name: supplierName })
            });
            if (createSupplierRes.ok) {
                const createSupplierData: any = await createSupplierRes.json();
                supplierId = createSupplierData.supplier?.id || createSupplierData.id;
            } else {
                return NextResponse.json({ error: "Échec de la création du fournisseur" }, { status: 500 });
            }
        }

        // 5. Importer la facture fournisseur sur Pennylane
        console.log(`[API Upload] Création de la facture fournisseur : ${cleanLabel}`);
        const payload = {
            file_attachment_id: fileAttachmentId,
            supplier_id: supplierId,
            date: dateStr,
            deadline: dateStr,
            currency_amount: amount.toFixed(2),
            currency_amount_before_tax: amount.toFixed(2),
            currency_tax: "0.00",
            currency: "EUR",
            invoice_lines: [
                {
                    currency_amount: amount.toFixed(2),
                    currency_tax: "0.00",
                    vat_rate: "exempt",
                    label: cleanLabel
                }
            ]
        };

        const importRes = await fetch(`${BASE_URL}/supplier_invoices/import`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${pennylaneKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Use-2026-API-Changes": "true"
            },
            body: JSON.stringify(payload)
        });

        let invoiceId = null;
        if (importRes.ok) {
            const importData: any = await importRes.json();
            invoiceId = importData.id || importData.supplier_invoice?.id;
        } else if (importRes.status === 409) {
            const errorText = await importRes.text();
            const docIdMatch = errorText.match(/A document with ID (\d+) already exists/);
            if (docIdMatch) {
                invoiceId = parseInt(docIdMatch[1], 10);
                console.log(`[API Upload] Facture existante récupérée via 409 (ID: ${invoiceId})`);
            } else {
                return NextResponse.json({ error: `Échec de création de la facture (Doublon 409) : ${errorText}` }, { status: 500 });
            }
        } else {
            return NextResponse.json({ error: `Échec de création de la facture (Status ${importRes.status})` }, { status: 500 });
        }

        // 6. Tenter de rapprocher la facture automatiquement avec une transaction bancaire correspondante
        console.log("[API Upload] Recherche d'une transaction correspondante pour rapprochement...");
        
        // Charger les transactions non rapprochées autour de la date (+/- 7 jours)
        const dateObj = new Date(dateStr);
        const minDate = new Date(dateObj.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
        const maxDate = new Date(dateObj.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

        const filterObj = [
            { field: "date", operator: "gteq", value: minDate },
            { field: "date", operator: "lteq", value: maxDate }
        ];
        const filterStr = encodeURIComponent(JSON.stringify(filterObj));

        const txRes = await fetch(`${BASE_URL}/transactions?filter=${filterStr}&limit=100`, {
            headers: { "Authorization": `Bearer ${pennylaneKey}`, "Accept": "application/json" }
        });

        let matchedTransaction = null;
        let matchedSuccessfully = false;

        if (txRes.ok) {
            const txData = await txRes.json();
            const transactions = txData.transactions || txData.items || [];
            
            // Trouver la transaction correspondante
            const matchingTx = transactions.find((tx: any) => {
                const txAmount = Math.abs(parseFloat(tx.amount || "0"));
                const amountDiff = Math.abs(txAmount - amount);
                if (amountDiff > 0.01) return false;

                // Vérifier si le libellé contient des mots-clés du fournisseur
                const labelLower = (tx.label || "").toLowerCase();
                const keywords = extractKeywords(supplierName);
                return keywords.some(kw => labelLower.includes(kw));
            });

            if (matchingTx) {
                matchedTransaction = {
                    id: matchingTx.id,
                    label: matchingTx.label,
                    date: matchingTx.date,
                    amount: matchingTx.amount
                };

                // Lancer le rapprochement
                const matchRes = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}/matched_transactions`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${pennylaneKey}`,
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "X-Use-2026-API-Changes": "true"
                    },
                    body: JSON.stringify({ transaction_id: String(matchingTx.id) })
                });

                if (matchRes.ok) {
                    matchedSuccessfully = true;
                    console.log(`🎉 [API Upload] Rapprochement automatique réussi avec la transaction ID ${matchingTx.id} !`);
                }
            }
        }

        // 7. Enregistrer le justificatif dans la base locale Supabase (Stockage + Prisma)
        try {
            console.log("[API Upload] Synchronisation avec la base de données locale...");
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            // Clean key of accents for Supabase compatibility
            const cleanStorageKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.\-_ ]/g, "");
            const safeStorageKey = cleanStorageKey(normalizedFilename);

            // Téléverser sur Supabase Storage
            const { error: storageErr } = await supabase.storage
                .from('invoices')
                .upload(safeStorageKey, buffer, {
                    contentType: file.type || 'application/pdf',
                    upsert: true
                });

            let finalFileUrl = "";
            if (storageErr) {
                console.error("⚠️ [API Upload] Échec du téléversement Supabase Storage :", storageErr.message);
                finalFileUrl = `/uploads/${normalizedFilename}`;
            } else {
                const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(safeStorageKey);
                finalFileUrl = publicUrlData.publicUrl;
            }

            // Créer l'entrée dans la table Invoice
            await prisma.invoice.create({
                data: {
                    provider: cleanLabel,
                    amount: amount,
                    currency: "EUR",
                    date: new Date(dateStr),
                    fileUrl: finalFileUrl,
                    status: matchedSuccessfully ? "COMPLETED" : "PENDING",
                    type: "PRO"
                }
            });
            console.log("🎉 [API Upload] Justificatif synchronisé avec succès dans la base locale (Prisma + Storage) !");
        } catch (dbErr: any) {
            console.error("⚠️ [API Upload] Échec d'enregistrement base locale :", dbErr.message);
        }

        return NextResponse.json({
            success: true,
            invoiceId,
            filename: normalizedFilename,
            matched: matchedSuccessfully,
            transaction: matchedTransaction
        });

    } catch (error: any) {
        console.error("❌ [API Upload Document] Erreur globale :", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
