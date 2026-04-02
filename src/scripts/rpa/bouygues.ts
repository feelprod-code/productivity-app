import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const BOUYGUES_EMAIL = process.env.BOUYGUES_EMAIL;
const BOUYGUES_PASSWORD = process.env.BOUYGUES_PASSWORD;
const STATE_FILE = path.resolve(__dirname, "bouygues-state.json");
const DOWNLOADS_DIR = path.resolve(process.cwd(), "downloads");

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

async function run() {
    if (!BOUYGUES_EMAIL || !BOUYGUES_PASSWORD) {
        console.error("❌ ERREUR: BOUYGUES_EMAIL ou BOUYGUES_PASSWORD n'est pas défini dans .env.local");
        process.exit(1);
    }

    console.log("🤖 Lancement du robot Bouygues Telecom... 100% Autonome !");

    const hasState = fs.existsSync(STATE_FILE);

    // On lance en headless: false pour déboguer, mais sans pause manuelle cette fois.
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: hasState ? STATE_FILE : undefined,
        viewport: { width: 1280, height: 720 },
        acceptDownloads: true
    });

    const page = await context.newPage();

    console.log("👉 Navigation vers Bouygues Telecom...");
    await page.goto("https://www.bouyguestelecom.fr/mon-compte/");
    await page.waitForLoadState("networkidle");

    try {
        // Boucle de connexion (jusqu'à 3 tentatives si le site redemande le mot de passe)
        let loginVisible = true;
        let attempts = 0;

        while (loginVisible && attempts < 3) {
            attempts++;
            await page.waitForTimeout(3000); // Laisser le temps à la page de se rafraichir

            const frames = page.frames();
            let loginFrame = null;
            let foundEmailInput = null;
            let foundPwdInput = null;

            // Check inside iframes for the new Bouygues login system (e.g. CAS)
            for (const frame of frames) {
                // Focus on visible inputs from the CAS iframe
                const emailLoc = frame.locator('#picasso-username, input[type="email"]').first();
                const pwdLoc = frame.locator('#picasso-password, input[type="password"]').first();

                if ((await emailLoc.isVisible().catch(() => false)) || (await pwdLoc.isVisible().catch(() => false))) {
                    foundEmailInput = emailLoc;
                    foundPwdInput = pwdLoc;
                    loginFrame = frame;
                    break;
                }
            }

            loginVisible = (foundEmailInput !== null) || (foundPwdInput !== null);

            if (loginVisible && loginFrame) {
                console.log(`🔐 Identifiants demandés (Tentative ${attempts}/3)...`);

                // Remplir l'email s'il est visible
                if (foundEmailInput && await foundEmailInput.isVisible().catch(() => false)) {
                    await foundEmailInput.click();
                    await foundEmailInput.fill(""); // Clear first
                    await foundEmailInput.pressSequentially(BOUYGUES_EMAIL, { delay: 100 });
                }

                // Remplir le mot de passe s'il est visible
                if (foundPwdInput && await foundPwdInput.isVisible().catch(() => false)) {
                    await foundPwdInput.click();
                    await foundPwdInput.fill(""); // Clear first
                    await foundPwdInput.pressSequentially(BOUYGUES_PASSWORD, { delay: 100 });
                }

                // Cliquer sur le bouton de connexion ou utiliser la touche Entrée
                const btnSubmit = loginFrame.locator('button[type="submit"], [role="button"]:has-text("Me connecter"), :text("Me connecter")').last();
                if (await btnSubmit.isVisible().catch(() => false)) {
                    await page.waitForTimeout(500);
                    await btnSubmit.click();
                    console.log("➡️ Bouton de connexion cliqué !");
                } else if (foundPwdInput) {
                    console.log("⚠️ Bouton de connexion introuvable, soumission via la touche Entrée...");
                    await foundPwdInput.press('Enter');
                }
                await page.waitForTimeout(4000); // Attendre que la page se charge
            } else {
                console.log("✅ Plus de page de connexion détectée !");
                break;
            }
        }

        // Sauvegarder l'état pour les prochaines connexions
        await context.storageState({ path: STATE_FILE });
        console.log("✅ Session sauvegardée avec succès.");

        console.log("👤 Recherche du profil 'Philippe'...");
        await page.waitForTimeout(5000); // Wait for the React component to fully render
        await page.waitForLoadState("networkidle");

        const profilBtn = page.getByText("Philippe", { exact: false }).first();
        if (await profilBtn.isVisible()) {
            await profilBtn.click();
            await page.waitForTimeout(3000);
        }

        console.log("📄 Accès aux factures...");
        const derniereFactureBtn = page.getByText(/Derni[eè]re facture/i).first();
        if (await derniereFactureBtn.isVisible()) {
            await derniereFactureBtn.click();
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(2000);
        } else {
            console.log("⚠️ Bouton 'Dernière facture' non trouvé. Accès direct...");
            await page.goto("https://www.bouyguestelecom.fr/mon-compte/factures");
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(2000);
        }

        console.log("⬇️ Recherche du bouton de téléchargement...");
        const telechargerBtn = page.getByText("Télécharger la facture consultée", { exact: false }).first();

        if (await telechargerBtn.isVisible()) {
            const downloadPromise = page.waitForEvent('download');
            await telechargerBtn.click();

            console.log("⏳ Téléchargement en cours...");
            const download = await downloadPromise;

            const suggestedFilename = download.suggestedFilename();
            const filePath = path.join(DOWNLOADS_DIR, suggestedFilename);
            await download.saveAs(filePath);

            console.log(`✅ Succès ! La facture a été téléchargée ici : ${filePath}`);
        } else {
            console.log("❌ Le bouton de téléchargement 'Télécharger la facture consultée' est introuvable.");
            await page.screenshot({ path: 'bouygues_error.png' });
            console.log("📸 Capture d'écran enregistrée sous 'bouygues_error.png'");
        }
        console.log("✅ Fin de l'opération automatique.");

    } catch (err) {
        console.error("❌ Erreur pendant l'automatisation :", err);
    } finally {
        await page.pause(); // Keep browser open for inspection
        console.log("🛑 Robot arrêté.");
    }
}

run();
