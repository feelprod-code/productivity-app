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

const ICLOUD_CONFIG = {
  imap: {
    user: 'guillaumephilippe@me.com',
    password: 'ezux-gvqf-htzt-xxpi',
    host: 'imap.mail.me.com',
    port: 993,
    tls: true,
    authTimeout: 20000,
    tlsOptions: { rejectUnauthorized: false }
  }
};

async function searchInAccount(name: string, config: any) {
  console.log(`\n========================================`);
  console.log(`🔌 Connexion au compte ${name}...`);
  try {
    const connection = await imaps.connect(config);
    console.log(`✅ Connecté à ${name} !`);

    // Obtenir la liste des boîtes
    const boxes = ['INBOX', '[Gmail]/Tous les messages', '[Gmail]/All Mail', 'Archive'];
    
    // Essayer les boîtes pertinentes
    for (const box of ['INBOX', '[Gmail]/Tous les messages', 'Archive']) {
      try {
        console.log(`📂 Tentative ouverture boîte: ${box}...`);
        await connection.openBox(box);
        
        // Critères de recherche variés
        const searchQueries = [
          ['OR', ['SUBJECT', 'Ordre'], ['BODY', 'CDOMK']],
          ['OR', ['SUBJECT', 'CDOMK'], ['SUBJECT', 'CNOMK']],
          ['OR', ['BODY', '10005682603'], ['BODY', '757068309']],
          ['OR', ['BODY', 'cotisation ordinale'], ['SUBJECT', 'cotisation ordinale']],
          ['OR', ['BODY', 'caducée'], ['SUBJECT', 'caducée']],
          ['OR', ['BODY', 'numéro d\'ordre'], ['BODY', 'numero d\'ordre']]
        ];

        for (const query of searchQueries) {
          try {
            const messages = await connection.search(query, {
              bodies: ['HEADER', 'TEXT'],
              markSeen: false
            });

            if (messages.length > 0) {
              console.log(`🎯 Trouvé ${messages.length} message(s) pour la requête dans ${box} :`);
              for (const msg of messages) {
                const header = msg.parts.find((p: any) => p.which === 'HEADER');
                const textPart = msg.parts.find((p: any) => p.which === 'TEXT');
                const subject = header?.body?.subject?.[0] || 'Sans sujet';
                const from = header?.body?.from?.[0] || 'Sans expéditeur';
                const date = header?.body?.date?.[0] || 'Sans date';
                console.log(`----------------------------------------`);
                console.log(`📅 Date: ${date}`);
                console.log(`👤 De: ${from}`);
                console.log(`📝 Sujet: ${subject}`);
                if (textPart?.body) {
                  const bodySnippet = String(textPart.body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
                  console.log(`💬 Extrait: ${bodySnippet}`);
                }
              }
            }
          } catch (e: any) {
            // Ignorer erreur spécifique de query
          }
        }
      } catch (err: any) {
        // Boîte non trouvée sur ce serveur, continuer
      }
    }

    connection.end();
  } catch (err: any) {
    console.error(`❌ Erreur connexion ${name}:`, err.message);
  }
}

async function main() {
  await searchInAccount('Gmail (guillaumephilippe1968@gmail.com)', GMAIL_CONFIG);
  await searchInAccount('iCloud (guillaumephilippe@me.com)', ICLOUD_CONFIG);
}

main().catch(console.error);
