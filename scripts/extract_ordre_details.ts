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
  console.log("🔌 Connexion Gmail...");
  const connection = await imaps.connect(GMAIL_CONFIG);

  try {
    await connection.openBox('[Gmail]/Tous les messages');
  } catch (e) {
    await connection.openBox('INBOX');
  }

  // Requête ciblée sur les emails provenant de l'Ordre ou parlant de cotisation/caducée
  const searchCriteria = [
    ['X-GM-RAW', 'from:ordremk.fr OR "cotisation ordinale" OR "appel de cotisation" OR "caducée" OR "attestation d\'inscription" OR "tableau de l\'ordre"']
  ];

  console.log("🔍 Recherche des emails de l'Ordre...");
  const messages = await connection.search(searchCriteria, {
    bodies: ['HEADER', ''],
    struct: true,
    markSeen: false
  });

  console.log(`🎯 Trouvé ${messages.length} message(s) !`);

  for (const msg of messages) {
    const fullPart = msg.parts.find((p: any) => p.which === '');
    const headerPart = msg.parts.find((p: any) => p.which === 'HEADER');
    const subject = headerPart?.body?.subject?.[0] || 'Sans sujet';
    const date = headerPart?.body?.date?.[0] || 'Sans date';
    const from = headerPart?.body?.from?.[0] || 'Sans expéditeur';

    let bodyText = '';
    if (fullPart?.body) {
      try {
        const parsed = await simpleParser(fullPart.body);
        bodyText = parsed.text || '';
      } catch (err) {
        bodyText = String(fullPart.body);
      }
    }

    // Chercher des motifs de numéros d'ordre
    const lower = bodyText.toLowerCase();
    const hasKeywords = lower.includes('numéro') || lower.includes('numero') || lower.includes('ordre') || lower.includes('tableau') || lower.includes('inscription') || lower.includes('caducée') || lower.includes('cotisation');

    if (hasKeywords) {
      console.log(`\n========================================`);
      console.log(`📅 Date: ${date} | 👤 De: ${from}`);
      console.log(`📝 Sujet: ${subject}`);
      
      // Extraire les lignes pertinentes
      const lines = bodyText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.toLowerCase().includes('n°') || 
          trimmed.toLowerCase().includes('numero') || 
          trimmed.toLowerCase().includes('numéro') ||
          trimmed.toLowerCase().includes('ordinal') ||
          trimmed.toLowerCase().includes('tableau') ||
          trimmed.toLowerCase().includes('inscription') ||
          trimmed.toLowerCase().includes('cotisation') ||
          trimmed.toLowerCase().includes('rpps') ||
          trimmed.toLowerCase().includes('adeli')
        ) {
          if (trimmed.length > 5 && trimmed.length < 300) {
            console.log(`   👉 ${trimmed}`);
          }
        }
      }
    }
  }

  connection.end();
}

main().catch(console.error);
