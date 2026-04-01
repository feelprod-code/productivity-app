import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Charger les variables de l'environnement ou du fichier .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const CANVA_EMAIL = process.env.CANVA_EMAIL;
const STATE_FILE = path.resolve(__dirname, "canva-state.json");

/**
 * Script RPA Playwright pour récupérer les factures Canva
 * Usage: npx tsx src/scripts/rpa/canva.ts [URL_FACTURE]
 */
async function run() {
    if (!CANVA_EMAIL) {
        console.error("❌ ERREUR: CANVA_EMAIL n'est pas défini dans .env.local");
        process.exit(1);
    }

    // Si une URL de facture est passée en argument, l'utiliser. Sinon aller dans les paramètres de facturation
    const invoiceUrl = process.argv[2] || "https://www.canva.com/settings/billing-and-plans";
    console.log("🤖 Lancement du robot Canva...");

    const hasState = fs.existsSync(STATE_FILE);

    // Ouverture du navigateur. 
    // 'headless: false' permet à l'utilisateur de voir ce qu'il se passe lors de la première connexion (pour le 2FA)
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: hasState ? STATE_FILE : undefined,
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    console.log("👉 Navigation vers Canva...");
    await page.goto("https://www.canva.com/login");

    // Vérifier si on est déjà connecté (présence de l'avatar ou absence de bouton login)
    try {
        // Si on trouve le bouton "Log in" ou "Se connecter", on n'est pas connecté
        const loginButtonVisible = await page.getByRole("button", { name: /Log in|Se connecter/i }).isVisible();

        if (hasState && loginButtonVisible) {
            console.log("⚠️ La session sauvegardée a expiré. Une reconnexion manuelle est requise.");
        }

        if (!hasState || loginButtonVisible) {
            console.log("🔐 Configuration de la NOUVELLE session. Veuillez vous connecter dans le navigateur de Chromium.");
            console.log("💡 INFO: Entrez votre email, mot de passe, et le code recu par SMS si demandé.");
            console.log("⏳ Le script est en PAUSE, j'attends votre connexion...");

            // On met le robot en pause. Vous pourrez naviguer et vous connecter manuellement
            // Une fois connecté, revenez dans ce terminal ou cliquez sur 'Resume' dans l'inspecteur Playwright.
            await page.pause();

            // Sauvegarde des cookies de session pour la prochaine fois !
            await context.storageState({ path: STATE_FILE });
            console.log("✅ Session sauvegardée avec succès !");
        } else {
            console.log("✅ Session déjà active. Connexion validée.");
        }

        // Navigation vers la facture
        console.log(`📄 Navigation vers la facture cible : ${invoiceUrl}`);
        await page.goto(invoiceUrl);

        // Si c'est une page de paramètre, trouver le bouton téléchargement. Si c'est le lien direct, Playwright peut intercepter le téléchargement.
        console.log("⏳ En attente de l'action de téléchargement...");

        // Logique d'interception de téléchargement (si on clique sur un bouton)
        // const downloadPromise = page.waitForEvent('download');
        // await click_btn
        // const download = await downloadPromise;
        // await download.saveAs(...)

        // On remet en pause pour que vous puissiez voir que la page s'est bien ouverte au bon endroit.
        // L'objectif final sera de télécharger le PDF et de le parser vers Supabase.
        await page.pause();

    } catch (err) {
        console.error("❌ Une erreur critique est survenue dans le robot Canva :", err);
    } finally {
        await browser.close();
        console.log("🛑 Robot arrêté.");
    }
}

run();
