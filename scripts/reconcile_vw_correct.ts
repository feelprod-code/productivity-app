import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

async function run() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }

  const BASE_URL = "https://app.pennylane.com/api/external/v2";
  const pdfPath = "/Users/philippeguillaume/Documents/4-CABINET KINE/COMPTABILITE/VW.pdf";
  const transactionId = "24849224822784"; // LCL Pro transaction from 2026-07-01
  const amount = 428.98;
  const dateStr = "2026-07-01";

  console.log(`Starting manual correct matching for VW Bank transaction ${transactionId}...`);

  try {
    // 1. Read PDF
    if (!fs.existsSync(pdfPath)) {
      console.error(`File not found at path: ${pdfPath}`);
      return;
    }
    const pdfBuffer = fs.readFileSync(pdfPath);

    // 2. Upload file attachment
    console.log(`📤 Uploading "${path.basename(pdfPath)}" to Pennylane...`);
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, path.basename(pdfPath));

    const uploadRes = await fetch(`${BASE_URL}/file_attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      },
      body: formData
    });

    if (!uploadRes.ok) {
      const errTxt = await uploadRes.text();
      throw new Error(`Upload failed: ${errTxt}`);
    }

    const uploadData: any = await uploadRes.json();
    const fileAttachmentId = uploadData.id;
    console.log(`✅ Uploaded successfully. Attachment ID: ${fileAttachmentId}`);

    // 3. Get or create Supplier
    console.log("🔍 Finding or creating VOLKSWAGEN BANK supplier...");
    const suppliersRes = await fetch(`${BASE_URL}/suppliers?limit=100`, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });

    let supplierId: number | null = null;
    if (suppliersRes.ok) {
      const suppliersData: any = await suppliersRes.json();
      const suppliers = suppliersData.items || suppliersData.suppliers || [];
      const matched = suppliers.find((s: any) => s.name.toLowerCase().includes('volkswagen') || s.name.toLowerCase().includes('vw bank'));
      if (matched) {
        supplierId = matched.id;
        console.log(`🎯 Supplier found: ${matched.name} (ID: ${supplierId})`);
      }
    }

    if (!supplierId) {
      console.log(`➕ Supplier not found. Creating "VOLKSWAGEN BANK"...`);
      const createSupplierRes = await fetch(`${BASE_URL}/suppliers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Use-2026-API-Changes': 'true'
        },
        body: JSON.stringify({ name: "VOLKSWAGEN BANK" })
      });
      if (createSupplierRes.ok) {
        const createSupplierData: any = await createSupplierRes.json();
        supplierId = createSupplierData.supplier?.id || createSupplierData.id;
        console.log(`✅ Supplier created (ID: ${supplierId})`);
      } else {
        throw new Error("Failed to create supplier");
      }
    }

    // 4. Import Supplier Invoice
    console.log(`🧾 Importing supplier invoice for amount ${amount} €...`);
    const payload = {
      file_attachment_id: fileAttachmentId,
      supplier_id: supplierId,
      date: dateStr,
      deadline: dateStr,
      currency_amount: amount.toFixed(2),
      currency_amount_before_tax: amount.toFixed(2),
      currency_tax: '0.00',
      currency: 'EUR',
      invoice_lines: [
        {
          currency_amount: amount.toFixed(2),
          currency_tax: '0.00',
          vat_rate: 'exempt',
          label: "Location Tiguan GH326KP"
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
      throw new Error(`Import failed: ${errTxt}`);
    }

    const importData: any = await importRes.json();
    const invoiceId = importData.id || importData.supplier_invoice?.id;
    console.log(`✅ Invoice imported successfully. Invoice ID: ${invoiceId}`);

    // 5. Match Transaction
    console.log(`🔗 Matching transaction ${transactionId} to invoice ${invoiceId}...`);
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
      throw new Error(`Matching failed: ${errTxt}`);
    }

    console.log("🎉 SUCCESS! The VW Bank transaction has been correctly matched to the Volkswagen Bank invoice!");
  } catch (err: any) {
    console.error("❌ ERROR:", err.message);
  }
}

run();
