import imaps from 'imap-simple';

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
  console.log("✅ Connecté !");

  console.log("📂 Ouverture de [Gmail]/Tous les messages (ou INBOX)...");
  try {
    await connection.openBox('[Gmail]/Tous les messages');
  } catch (e) {
    try {
      await connection.openBox('[Gmail]/All Mail');
    } catch (e2) {
      await connection.openBox('INBOX');
    }
  }

  const queries = [
    'CDOMK',
    'CNOMK',
    '"Conseil de l\'Ordre"',
    '"Ordre des masseurs"',
    '"numéro d\'inscription"',
    '"tableau de l\'ordre"',
    'caducée',
    'cotisation ordinale',
    '10005682603',
    '757068309'
  ];

  for (const q of queries) {
    console.log(`\n🔍 Recherche X-GM-RAW: ${q}...`);
    try {
      const searchCriteria = [['X-GM-RAW', q]];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT'],
        struct: true,
        markSeen: false
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`   Trouvé: ${messages.length} message(s)`);

      for (const msg of messages.slice(0, 5)) {
        const header = msg.parts.find((p: any) => p.which === 'HEADER');
        const text = msg.parts.find((p: any) => p.which === 'TEXT');
        const subject = header?.body?.subject?.[0] || 'Sans sujet';
        const from = header?.body?.from?.[0] || 'Sans expéditeur';
        const date = header?.body?.date?.[0] || 'Sans date';
        console.log(`   ------------------------------------`);
        console.log(`   📅 ${date} | 👤 ${from}`);
        console.log(`   📝 Sujet: ${subject}`);
        if (text?.body) {
          const cleanBody = String(text.body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600);
          console.log(`   📄 Extrait: ${cleanBody}`);
        }
      }
    } catch (err: any) {
      console.log(`   Erreur pour ${q}:`, err.message);
    }
  }

  connection.end();
}

main().catch(console.error);
