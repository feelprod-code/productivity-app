import { NextRequest, NextResponse } from "next/server";
import dotenv from "dotenv";
import os from "os";

dotenv.config({ path: `${os.homedir()}/ANTIGRAVITY/.env` });

export const dynamic = 'force-dynamic';

function extractKeywords(label: string): string[] {
  const cleaned = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, " ") // keep only alphanumeric
    .replace(/\s+/g, " ")
    .trim();

  // Common keywords to exclude
  const stopwords = new Set([
    "numero", "num", "no", "payout", "payouts", "eur", "usd", "ref", "releve", "dun",
    "sepa", "recu", "prelvt", "prlv", "confrere", "facture", "fact", "inv", "invoice",
    "virement", "instantane", "transfer", "vir", "inst", "paiement", "cb", "date",
    "fsp416e20020e00630", "fr51zzz487778", "00000r0063000"
  ]);

  const words = cleaned.split(" ");
  const keywords = words.filter(word => {
    // Keep words with at least 2 characters that are not digits or stopwords
    return word.length >= 2 && !stopwords.has(word) && isNaN(Number(word));
  });

  return keywords;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const transactionId = formData.get("transactionId") as string;
    const label = formData.get("label") as string;
    const amountVal = formData.get("amount") as string;
    const dateStr = formData.get("date") as string;
    const file = formData.get("file") as File;

    if (!transactionId || !label || !amountVal || !dateStr || !file) {
      return NextResponse.json({ success: false, error: "Paramètres manquants." }, { status: 400 });
    }

    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    if (!pennylaneKey) {
      return NextResponse.json({ success: false, error: "Clé API Pennylane manquante." }, { status: 500 });
    }

    const amount = parseFloat(amountVal);
    const absAmount = Math.abs(amount);
    const keywords = extractKeywords(label);
    const filename = file.name || "facture.pdf";

    console.log(`📤 [ManualReconciliation] Uploading file for transaction ${transactionId} (${filename})...`);

    // --- 1. UPLOAD FILE TO PENNYLANE ATTACHMENTS ---
    const BASE_URL = "https://app.pennylane.com/api/external/v2";
    
    const pennylaneFormData = new FormData();
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([new Uint8Array(arrayBuffer)], { type: file.type || 'application/pdf' });
    pennylaneFormData.append('file', blob, filename);

    const uploadRes = await fetch(`${BASE_URL}/file_attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      },
      body: pennylaneFormData
    });

    if (!uploadRes.ok) {
      const errTxt = await uploadRes.text();
      return NextResponse.json({ success: false, error: `Échec du téléversement Pennylane : ${errTxt}` }, { status: 500 });
    }

    const uploadData = await uploadRes.json();
    const fileAttachmentId = uploadData.id;
    const publicFileUrl = uploadData.public_file_url || uploadData.file_url || '';

    // --- 2. FIND OR CREATE SUPPLIER ---
    let supplierId: number | null = null;
    if (keywords.length > 0) {
      console.log(`🔍 Recherche du fournisseur pour "${keywords[0]}" sur Pennylane...`);
      const suppliersRes = await fetch(`${BASE_URL}/suppliers?limit=100`, {
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json',
          'X-Use-2026-API-Changes': 'true'
        }
      });

      if (suppliersRes.ok) {
        const suppliersData = await suppliersRes.json();
        const suppliers = suppliersData.items || suppliersData.suppliers || [];
        const matchedSupplier = suppliers.find((s: any) => 
          keywords.some(kw => s.name.toLowerCase().includes(kw))
        );
        if (matchedSupplier) {
          supplierId = matchedSupplier.id;
        }
      }
    }

    if (!supplierId) {
      const supplierName = keywords.length > 0 ? keywords[0].toUpperCase() : "FOURNISSEUR INCONNU";
      console.log(`➕ Fournisseur non trouvé. Création de "${supplierName}"...`);
      const createSupplierRes = await fetch(`${BASE_URL}/suppliers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Use-2026-API-Changes': 'true'
        },
        body: JSON.stringify({ name: supplierName })
      });
      if (createSupplierRes.ok) {
        const createSupplierData = await createSupplierRes.json();
        supplierId = createSupplierData.supplier?.id || createSupplierData.id;
      } else {
        return NextResponse.json({ success: false, error: 'Échec de la création du fournisseur sur Pennylane' }, { status: 500 });
      }
    }

    // --- 3. CREATE SUPPLIER INVOICE ---
    console.log(`🧾 Importation de la facture sur Pennylane...`);
    const txDateStr = new Date(dateStr).toISOString().split('T')[0];
    const payload = {
      file_attachment_id: fileAttachmentId,
      supplier_id: supplierId,
      date: txDateStr,
      deadline: txDateStr,
      currency_amount: absAmount.toFixed(2),
      currency_amount_before_tax: absAmount.toFixed(2),
      currency_tax: '0.00',
      currency: 'EUR',
      invoice_lines: [
        {
          currency_amount: absAmount.toFixed(2),
          currency_tax: '0.00',
          vat_rate: 'exempt',
          label: label
        }
      ]
    };

    const importRes = await fetch(`${BASE_URL}/supplier_invoices/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      },
      body: JSON.stringify(payload)
    });

    if (!importRes.ok) {
      const errTxt = await importRes.text();
      return NextResponse.json({ success: false, error: `Échec de l'import de facture Pennylane : ${errTxt}` }, { status: 500 });
    }

    const importData = await importRes.json();
    const invoiceId = importData.id || importData.supplier_invoice?.id;

    // --- 4. LINK TRANSACTION TO INVOICE ---
    console.log(`🔗 Liaison de la transaction ${transactionId} à la facture ${invoiceId}...`);
    const matchRes = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}/matched_transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      },
      body: JSON.stringify({ transaction_id: String(transactionId) })
    });

    if (!matchRes.ok) {
      const errTxt = await matchRes.text();
      return NextResponse.json({ success: false, error: `Échec de la liaison Pennylane : ${errTxt}` }, { status: 500 });
    }

    console.log(`✅ Rapprochement manuel réussi pour la transaction ${transactionId}`);

    return NextResponse.json({ 
      success: true, 
      matchedFile: filename,
      invoice: {
        id: invoiceId,
        date: txDateStr,
        label: label,
        filename: filename,
        publicFileUrl: publicFileUrl,
        invoiceLines: ((importData.supplier_invoice?.invoice_lines || importData.invoice_lines || []) as any[]).map((line: any) => ({
          label: line.label || line.description || "Article sans description",
          amount: parseFloat(line.currency_amount || line.amount || '0')
        }))
      }
    });

  } catch (err: any) {
    console.error("Error in reconcile-file API:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
