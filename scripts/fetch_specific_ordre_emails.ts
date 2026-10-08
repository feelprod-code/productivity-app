import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as fs from 'fs';
import * as path from 'path';

const GMAIL_CONFIG = {
  imap: {
    user: 'guillaumephilippe1968@gmail.com',
    password: 'fpmc gosz zwxq lcwl',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 20000,
    tlsOptions: { rejectUnauthorized: false }
  }
};

async function main() {
  console.log("🔌 Connexion Gmail...");
  const connection = await imaps.connect(GMAIL_CONFIG);

  try {
    await connection.openBox('[Gmail]/Tous les messages');
  } catch (e) {
    await connection.openBox('INBOX');
  }

  const queries = [
    'subject:"carte professionnelle ordinale"',
    'subject:"Relance Cotisation"',
    'subject:"Elections CDOMK Paris"',
    'from:ordremk.fr'
  ];

  for (const q of queries) {
    console.log(`\n🔍 Requête : ${q}...`);
    const messages = await connection.search([['X-GM-RAW', q]], {
      bodies: ['HEADER', ''],
      markSeen: false
    });

    console.log(`   Trouvé ${messages.length} message(s)`);

    for (const msg of messages) {
      const fullPart = msg.parts.find((p: any) => p.which === '');
      const headerPart = msg.parts.find((p: any) => p.which === 'HEADER');
      const subject = headerPart?.body?.subject?.[0] || 'Sans sujet';
      const date = headerPart?.body?.date?.[0] || 'Sans date';
      const from = headerPart?.body?.from?.[0] || 'Sans expéditeur';

      console.log(`\n==================================================`);
      console.log(`📅 Date: ${date} | 👤 De: ${from}`);
      console.log(`📝 Sujet: ${subject}`);

      if (fullPart?.body) {
        try {
          const parsed = await simpleParser(fullPart.body);
          console.log(`📄 TEXTE DU MESSAGE :`);
          console.log(parsed.text);

          if (parsed.attachments && parsed.attachments.length > 0) {
            console.log(`📎 PIÈCES JOINTES (${parsed.attachments.length}) :`);
            for (const att of parsed.attachments) {
              console.log(`   - Nom: ${att.filename} (${att.contentType}, ${att.size} octets)`);
              // Si c'est un PDF ou une image, on peut le sauver temporairement pour l'inspecter
              if (att.filename && (att.filename.endsWith('.pdf') || att.filename.endsWith('.png') || att.filename.endsWith('.jpg'))) {
                const savePath = path.join('/Users/philippeguillaume/.gemini/antigravity/brain/0fae5af3-cecd-49d7-9d6c-f4da721f8819/scratch', att.filename);
                fs.writeFileSync(savePath, att.content);
                console.log(`     💾 Sauvegardé dans : ${savePath}`);
              }
            }
          }
        } catch (err: any) {
          console.error("Erreur parsing message:", err.message);
        }
      }
    }
  }

  connection.end();
}

main().catch(console.error);
