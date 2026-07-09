import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import FormData from 'form-data';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;

async function main() {
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }
  
  const BASE_URL = "https://app.pennylane.com/api/external/v2";
  
  // 1. Fetch one invoice to test update
  const listRes = await fetch(`${BASE_URL}/supplier_invoices?limit=1`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  const listData: any = await listRes.json();
  const invoice = (listData.items || listData.supplier_invoices || [])[0];
  if (!invoice) {
    console.log("No invoices found to test update.");
    return;
  }
  
  console.log(`Testing PUT update on invoice ID: ${invoice.id}`);
  console.log(`Original label: ${invoice.label}`);
  console.log(`Original filename: ${invoice.filename}`);

  // Create a small mock PDF to upload as a test attachment
  const mockPdfBuffer = Buffer.from("%PDF-1.4\n%...\n%%EOF");
  const formData = new FormData();
  formData.append("file", mockPdfBuffer, {
    filename: "test_update_attachment.pdf",
    contentType: "application/pdf"
  });

  console.log("Uploading test attachment to Pennylane...");
  const uploadRes = await fetch(`${BASE_URL}/file_attachments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pennylaneKey}`,
      "Accept": "application/json",
      "X-Use-2026-API-Changes": "true",
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!uploadRes.ok) {
    console.error("Upload failed:", uploadRes.status, await uploadRes.text());
    return;
  }

  const uploadData: any = await uploadRes.json();
  const newAttachmentId = uploadData.id;
  console.log(`Uploaded new attachment ID: ${newAttachmentId}`);

  // Try to update the invoice with the new attachment and a modified label
  const newLabel = invoice.label + " (UPDATED)";
  console.log(`Updating invoice label to: "${newLabel}" and file_attachment_id to: ${newAttachmentId}...`);
  
  const updateRes = await fetch(`${BASE_URL}/supplier_invoices/${invoice.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify({
      label: newLabel,
      file_attachment_id: newAttachmentId
    })
  });

  console.log(`Status: ${updateRes.status}`);
  console.log(`Response text:`, await updateRes.text());
}

main().catch(console.error);
