import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import https from 'https';

const prisma = new PrismaClient();
// Le dossier par défaut sera sur le Bureau de ton Mac, mais tu peux changer ce lien vers ton Google Drive !
const EXPORT_DIR = path.join(process.env.HOME || '', 'Desktop', 'Factures_Export_Auto');

function downloadFile(url: string, dest: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Echec du téléchargement ${url}: Code ${res.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(dest);
            res.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve(true);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

function getFormattedMonth(date: Date) {
    const months = ['01_Janvier', '02_Fevrier', '03_Mars', '04_Avril', '05_Mai', '06_Juin', '07_Juillet', '08_Aout', '09_Septembre', '10_Octobre', '11_Novembre', '12_Decembre'];
    return months[date.getMonth()];
}

async function runExport() {
    console.log(`\n📂 Préparation de l'export vers : ${EXPORT_DIR}`);
    if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

    const invoices = await prisma.invoice.findMany({
        orderBy: { date: 'asc' }
    });

    console.log(`⚡ ${invoices.length} factures trouvées dans le Cerveau (Supabase). Lancement du robot...`);

    let countNew = 0;
    for (const inv of invoices) {
        if (!inv.fileUrl || !inv.fileUrl.startsWith('http')) continue;

        const d = new Date(inv.date);
        const yearStr = d.getFullYear().toString();
        const monthStr = getFormattedMonth(d);

        // Création récursive du dossier "2026 / 03_Mars"
        const dirPath = path.join(EXPORT_DIR, yearStr, monthStr);
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        // Format du nom : YYYY-MM-DD - Fournisseur - Montant.pdf
        const dateStr = d.toISOString().split('T')[0];
        const cleanProvider = inv.provider.replace(/[^a-zA-Z0-9éèàçê\-]/g, '_').replace(/_+/g, '_').substring(0, 50);
        const amountStr = inv.amount !== null ? `${inv.amount}€` : '0€';
        const fileName = `${dateStr} - ${cleanProvider} - ${amountStr}.pdf`;
        const filePath = path.join(dirPath, fileName);

        // Vérifier si la facture a déjà été exportée dans le passé pour ne pas la retélécharger
        if (fs.existsSync(filePath)) {
            console.log(`⏩ Ignoré (déjà exporté) : ${fileName}`);
            continue;
        }

        try {
            if (inv.fileUrl.endsWith('.pdf')) {
                console.log(`📥 Téléchargement : ${fileName}...`);
                await downloadFile(inv.fileUrl, filePath);
                countNew++;
            }
        } catch (e) {
            console.error(`❌ Erreur sur ${fileName}:`, e);
        }
    }

    console.log(`\n🎉 TERMINÉ ! ${countNew} nouvelles factures exportées !`);
    console.log(`Tu peux les retrouver dans : ${EXPORT_DIR}`);
}

runExport()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
