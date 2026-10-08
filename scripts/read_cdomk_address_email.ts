import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

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
  const connection = await imaps.connect(GMAIL_CONFIG);
  try {
    await connection.openBox('[Gmail]/Tous les messages');
  } catch (e) {
    await connection.openBox('INBOX');
  }

  const messages = await connection.search([['X-GM-RAW', 'from:cdo75@ordremk.fr "Changement adresse perso"']], {
    bodies: ['HEADER', ''],
    markSeen: false
  });

  console.log(`Trouvé ${messages.length} messages`);
  for (const msg of messages) {
    const fullPart = msg.parts.find((p: any) => p.which === '');
    if (fullPart?.body) {
      const parsed = await simpleParser(fullPart.body);
      console.log("========================================");
      console.log("Date:", parsed.date);
      console.log("Subject:", parsed.subject);
      console.log("Text:\n", parsed.text);
    }
  }

  connection.end();
}

main().catch(console.error);
