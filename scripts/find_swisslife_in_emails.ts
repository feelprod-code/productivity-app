import * as dotenv from 'dotenv';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';

dotenv.config();

const icloudConfig = {
  user: 'guillaumephilippe@me.com',
  password: 'vcny-lusr-hugo-djpa',
  host: 'imap.mail.me.com',
  port: 993,
  tls: true,
  authTimeout: 10000,
  tlsOptions: { rejectUnauthorized: false }
};

async function run() {
  console.log("Connecting to iCloud to search for Swiss Life...");
  let connection;
  try {
    connection = await imaps.connect({ imap: icloudConfig });
    await connection.openBox('INBOX');

    // Search for emails with 'swiss' in their subject or body
    const searchCriteria = [['HEADER', 'SUBJECT', 'swiss']];
    const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true };
    const messages = await connection.search(searchCriteria, fetchOptions);

    console.log(`Found ${messages.length} email(s) with 'swiss' in subject:`);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const allPart = msg.parts.find((p: any) => p.which === '');
      if (!allPart) continue;

      const parsed = await simpleParser(allPart.body);
      console.log(`\nEmail [${i + 1}]:`);
      console.log(` - Subject: ${parsed.subject}`);
      console.log(` - Date: ${parsed.date}`);
      console.log(` - From: ${parsed.from?.text}`);

      const attachments = parsed.attachments || [];
      console.log(` - Attachments: ${attachments.length}`);
      for (const att of attachments) {
        console.log(`   * Filename: ${att.filename}`);
        if (att.filename && att.filename.toLowerCase().endsWith('.pdf')) {
          if (att.content.slice(0, 4).toString() === '%PDF') {
            try {
              const pdf = await pdfParse(att.content);
              const text = pdf.text.toLowerCase();
              console.log(`     - Contains '425': ${text.includes('425')}`);
              if (text.includes('425') || text.includes('swisslife')) {
                console.log(`     - Text snippet:\n${pdf.text.substring(0, 300)}`);
              }
            } catch (err: any) {
              console.log(`     - PDF parse failed: ${err.message}`);
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    if (connection) {
      connection.end();
    }
  }
}

run();
