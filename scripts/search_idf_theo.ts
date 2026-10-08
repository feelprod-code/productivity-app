import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

const GMAIL_CONFIG = {
  imap: {
    user: 'guillaumephilippe1968@gmail.com',
    password: 'fpmc gosz zwxq lcwl',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 25000,
    tlsOptions: { rejectUnauthorized: false }
  }
};

async function main() {
  console.log("🔌 Connexion Gmail...");
  const connection = await imaps.connect(GMAIL_CONFIG);
  console.log("✅ Connecté !");

  let boxOpened = false;
  for (const boxName of ['[Gmail]/Tous les messages', '[Gmail]/All Mail', 'INBOX']) {
    try {
      await connection.openBox(boxName);
      console.log(`📂 Boîte ouverte: ${boxName}`);
      boxOpened = true;
      break;
    } catch (e) {
      console.log(`Impossible d'ouvrir ${boxName}`);
    }
  }

  if (!boxOpened) {
    console.error("Impossible d'ouvrir une boîte mail.");
    return;
  }

  const queries = [
    '("imagine r" OR "ile-de-france mobilités" OR "ile de france mobilites" OR "navigo") (theo OR théo)',
    '"imagine r" theo',
    '"imagine r" théo',
    'navigo theo',
    'navigo théo',
    '"ile-de-france mobilités" theo',
    'renouvellement "imagine r"',
    'renouvellement navigo',
    '"imagine r"',
    '"ile-de-france mobilités"'
  ];

  const seenIds = new Set<string>();
  const allResults: any[] = [];

  for (const q of queries) {
    console.log(`\n🔍 Recherche X-GM-RAW: ${q}`);
    try {
      const searchCriteria = [['X-GM-RAW', q]];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT', ''],
        struct: true,
        markSeen: false
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`   Trouvé: ${messages.length} message(s)`);

      for (const msg of messages) {
        const uid = msg.attributes.uid.toString();
        if (seenIds.has(uid)) continue;
        seenIds.add(uid);

        const headerPart = msg.parts.find((p: any) => p.which === 'HEADER');
        const fullPart = msg.parts.find((p: any) => p.which === '');
        const textPart = msg.parts.find((p: any) => p.which === 'TEXT');

        const subject = headerPart?.body?.subject?.[0] || 'Sans sujet';
        const from = headerPart?.body?.from?.[0] || 'Sans expéditeur';
        const date = headerPart?.body?.date?.[0] || 'Sans date';

        let bodyText = '';
        if (fullPart?.body) {
          try {
            const parsed = await simpleParser(fullPart.body);
            bodyText = parsed.text || parsed.html || '';
          } catch (e) {
            bodyText = String(fullPart.body);
          }
        } else if (textPart?.body) {
          bodyText = String(textPart.body);
        }

        allResults.push({
          uid,
          date: new Date(date),
          rawDate: date,
          from,
          subject,
          bodyText
        });
      }
    } catch (err: any) {
      console.log(`   Erreur pour "${q}":`, err.message);
    }
  }

  // Sort results by date descending
  allResults.sort((a, b) => {
    const timeA = isNaN(a.date.getTime()) ? 0 : a.date.getTime();
    const timeB = isNaN(b.date.getTime()) ? 0 : b.date.getTime();
    return timeB - timeA;
  });

  console.log(`\n================ TOTAL MESSAGES UNIQUES TROUVÉS : ${allResults.length} ================`);
  for (const item of allResults.slice(0, 15)) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`📅 Date : ${item.rawDate}`);
    console.log(`👤 De   : ${item.from}`);
    console.log(`📝 Sujet: ${item.subject}`);
    const cleanSnippet = item.bodyText
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 800);
    console.log(`📄 Début du texte : ${cleanSnippet}`);
  }

  connection.end();
}

main().catch(console.error);
