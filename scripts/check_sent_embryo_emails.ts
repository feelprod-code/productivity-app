import imaps from 'imap-simple';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const IMAP_CONFIG = {
    imap: {
        user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
        password: process.env.GMAIL_APP_PASSWORD || 'fpmc gosz zwxq lcwl',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function main() {
    console.log("🔌 Connexion IMAP Gmail...");
    const connection = await imaps.connect(IMAP_CONFIG);
    
    // Lister les boîtes pour trouver le nom exact du dossier Sent
    const boxes = await connection.getBoxes();
    
    const findSentBox = (boxObj: any, prefix = ''): string | null => {
        for (const [name, val] of Object.entries(boxObj)) {
            const fullName = prefix ? `${prefix}/${name}` : name;
            const flags = (val as any).attribs || [];
            if (flags.includes('\\Sent') || name.toLowerCase().includes('sent') || name.toLowerCase().includes('envoy')) {
                return fullName;
            }
            if ((val as any).children) {
                const sub = findSentBox((val as any).children, fullName);
                if (sub) return sub;
            }
        }
        return null;
    };

    const sentBoxName = findSentBox(boxes) || '[Gmail]/Sent Mail';
    console.log(`🎯 Dossier Messages Envoyés : "${sentBoxName}"`);

    await connection.openBox(sentBoxName);
    
    // Chercher tous les messages récents (les 100 derniers)
    const searchCriteria = ['ALL'];
    const fetchOptions = {
        bodies: ['HEADER', 'TEXT'],
        struct: true
    };
    
    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`📬 Total e-mails envoyés trouvés dans Gmail : ${messages.length}`);
    
    // Analyser les 80 derniers e-mails envoyés
    const lastMsgs = messages.slice(-80).reverse();
    
    console.log("\n🔍 Analyse des derniers messages envoyés :");
    let matchCount = 0;
    
    for (const msg of lastMsgs) {
        const headerPart = msg.parts.find((p: any) => p.which === 'HEADER');
        const textPart = msg.parts.find((p: any) => p.which === 'TEXT');
        
        const subject = headerPart?.body?.subject?.[0] || 'Sans sujet';
        const date = headerPart?.body?.date?.[0] || 'Sans date';
        const to = headerPart?.body?.to?.[0] || 'Inconnu';
        const bodyText = textPart?.body || '';
        
        const isEmbryo = /embryo|damoiseaux|formation|feelprod|techniquesdouces|pilule|vercel/i.test(subject + " " + bodyText);
        
        if (isEmbryo) {
            matchCount++;
            console.log(`\n==================================================`);
            console.log(`📩 MATCH #${matchCount}`);
            console.log(`📅 Date: ${date}`);
            console.log(`👤 Destinataire (To): ${to}`);
            console.log(`📌 Sujet: ${subject}`);
            
            // Extraire les liens URL présents dans le corps
            const urls = bodyText.match(/https?:\/\/[^\s"'>)]+/g) || [];
            if (urls.length > 0) {
                console.log(`🔗 Liens détectés :`);
                urls.forEach((u: string) => console.log(`   - ${u}`));
            } else {
                console.log(`ℹ️ Aucun lien HTTP direct dans ce message.`);
            }
            
            // Aperçu du texte
            const preview = bodyText.replace(/\r\n/g, ' ').replace(/\s+/g, ' ').slice(0, 250);
            console.log(`📝 Aperçu : ${preview}...`);
        }
    }
    
    console.log(`\n==================================================`);
    console.log(`🏁 Total messages liés à l'embryologie / pilules trouvés : ${matchCount}`);
    
    connection.end();
}

main().catch(console.error);
