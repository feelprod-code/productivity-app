import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Charge les variables d'environnement depuis .env.local
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

async function run() {
    console.log("🚀 Démarrage du robot Higgfields...");

    // 1. Lancement du navigateur
    const browser = await chromium.launch({
        headless: false // False pour voir ce qui se passe
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    try {
        // 2. Navigation vers la page de connexion Higgfields
        // (L'URL exacte dépend de leur portail client, à adapter)
        const loginUrl = 'https://app.higgfields.com/login'; // TODO: Remplacer par la vraie URL
        console.log(`🌐 Navigation vers ${loginUrl}`);
        await page.goto(loginUrl);

        // 3. Pause pour laisser l'utilisateur se connecter manuellement la première fois
        // Vous taperez vos identifiants et naviguerez jusqu'à la page des factures
        console.log("⏸️ PAUSE : Veuillez vous connecter à Higgfields et aller sur la page des factures.");
        console.log("👉 Une fois sur la page des factures, cliquez sur le bouton 'Resume' dans l'inspecteur Playwright.");
        await page.pause();

        console.log("▶️ Reprise du script. Recherche des PDF de factures...");

        // 4. Ciblage et téléchargement des factures
        // TODO: Remplacer les sélecteurs CSS par ceux qui existent réellement sur la page des factures de Higgfields
        const invoiceLinks = page.locator('a[href$=".pdf"]'); // Exemple: tous les liens terminant par .pdf
        const count = await invoiceLinks.count();

        console.log(`📄 Trouvé ${count} lien(s) de facture(s) potentiel(s).`);

        if (count === 0) {
            console.log("⚠️ Aucune facture trouvée. Veuillez vérifier les sélecteurs.");
        } else {
            // Configuration du dossier de téléchargement "Compta" sur le bureau
            const desktopPath = path.join(process.env.HOME || process.env.USERPROFILE || '', 'Desktop', 'Compta', 'Higgfields');
            if (!fs.existsSync(desktopPath)) {
                fs.mkdirSync(desktopPath, { recursive: true });
            }

            for (let i = 0; i < count; i++) {
                const link = invoiceLinks.nth(i);
                const url = await link.getAttribute('href');

                console.log(`⬇️ Téléchargement de la facture ${i + 1}/${count}...`);

                // On demande à Playwright d'attendre l'événement "download" quand on clique sur le lien
                const downloadPromise = page.waitForEvent('download');
                await link.click();
                const download = await downloadPromise;

                const downloadPath = path.join(desktopPath, download.suggestedFilename());
                await download.saveAs(downloadPath);

                console.log(`✅ Fichier sauvegardé : ${downloadPath}`);
            }
        }

    } catch (error) {
        console.error("❌ Une erreur est survenue :", error);
    } finally {
        // 5. Fermeture propre
        console.log("🛑 Fermeture du robot Higgfields.");
        await browser.close();
    }
}

run();
