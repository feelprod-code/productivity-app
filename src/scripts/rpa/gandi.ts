import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Charger les variables de l'environnement global d'ANTIGRAVITY
dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const GANDI_USERNAME = process.env.GANDI_USERNAME;
const GANDI_PASSWORD = process.env.GANDI_PASSWORD;
const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const DOWNLOADS_DIR = path.resolve(process.cwd(), "downloads");
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7e8add28-1259-4dd6-adef-0f80ff678346";

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

async function takeScreenshot(page: any, name: string) {
    const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
    console.log(`📸 Capture d'écran enregistrée : ${filePath}`);
}

async function run() {
    if (!GANDI_USERNAME || !GANDI_PASSWORD) {
        console.error("❌ ERREUR: GANDI_USERNAME ou GANDI_PASSWORD n'est pas défini dans le .env global");
        process.exit(1);
    }

    console.log("🤖 Lancement du robot Gandi...");

    const hasState = fs.existsSync(STATE_FILE);

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: hasState ? STATE_FILE : undefined,
        viewport: { width: 1280, height: 800 },
        acceptDownloads: true
    });

    const page = await context.newPage();

    try {
        console.log("👉 Navigation vers la page d'authentification de Gandi mon-compte...");
        await page.goto("https://id.gandi.net/login");
        await page.waitForTimeout(3000);
        await takeScreenshot(page, "gandi_1_login_page");

        const usernameInput = page.locator('input[placeholder="Your username"], input[name="username"]').first();
        const passwordInput = page.locator('input[placeholder="Your password"], input[name="password"]').first();

        const isLoginRequired = await usernameInput.isVisible().catch(() => false) || 
                                await passwordInput.isVisible().catch(() => false);

        if (!hasState || isLoginRequired) {
            console.log("🔐 Remplissage des identifiants Gandi...");
            if (await usernameInput.isVisible()) {
                await usernameInput.click();
                await usernameInput.fill(GANDI_USERNAME);
            }
            if (await passwordInput.isVisible()) {
                await passwordInput.click();
                await passwordInput.fill(GANDI_PASSWORD);
            }

            await takeScreenshot(page, "gandi_2_filled");

            console.log("➡️ Tentative de connexion...");
            const submitBtn = page.locator('button[type="submit"][name="form.submitted"], button[type="submit"]:has-text("Log in")').first();
            if (await submitBtn.isVisible().catch(() => false)) {
                await submitBtn.click();
            } else {
                await page.keyboard.press("Enter");
            }

            console.log("⏳ Pause de 5 secondes pour laisser la page charger après soumission...");
            await page.waitForTimeout(5000);
            await takeScreenshot(page, "gandi_3_after_submit");

            // Vérifier s'il y a une erreur ou si on demande le 2FA
            const bodyText = await page.innerText("body").catch(() => "");
            if (bodyText.includes("authenticator") || bodyText.includes("security code") || bodyText.includes("code de sécurité") || bodyText.includes("2FA")) {
                console.log("⚠️ Gandi demande une double authentification (2FA) !");
                console.log("👉 Veuillez valider le code de sécurité directement dans le navigateur visible.");
            }

            console.log("⏳ En attente de la redirection vers Gandi Admin (max 3 minutes)...");
            try {
                await page.waitForURL(/admin.gandi.net/, { timeout: 180000 });
                console.log("✅ Redirection réussie ! Connexion établie.");
                // Sauvegarder la session
                await context.storageState({ path: STATE_FILE });
                console.log("✅ Session Gandi sauvegardée.");
            } catch (err) {
                console.log("❌ Timeout de redirection. Prenons une capture d'écran de l'état actuel.");
                await takeScreenshot(page, "gandi_error_redirection");
                console.log("👉 Merci de finaliser la connexion manuellement s'il y avait un obstacle.");
                // Laisser l'utilisateur finaliser
                await page.waitForURL(/admin.gandi.net/, { timeout: 120000 });
            }
        } else {
            console.log("✅ Session existante validée, déjà connecté.");
            await page.goto("https://admin.gandi.net/");
            await page.waitForLoadState("networkidle");
        }

        await takeScreenshot(page, "gandi_4_dashboard");

        console.log("📄 Accès direct à la facturation (Billing Invoices)...");
        await page.goto("https://admin.gandi.net/billing/invoices");
        await page.waitForTimeout(6000);
        await takeScreenshot(page, "gandi_5_invoices_page");

        const currentUrl = page.url();
        if (!currentUrl.includes("/billing/invoices")) {
            console.log("👉 Gandi demande probablement de choisir une organisation.");
            console.log("👉 Veuillez cliquer sur votre organisation dans l'interface Chromium, puis allez sur 'Facturation' (Billing) à gauche.");
            
            // Attendre qu'on arrive sur la page des factures
            await page.waitForURL(/billing\/invoices/, { timeout: 120000 });
            console.log("✅ Page des factures atteinte !");
            await page.waitForTimeout(4000);
            await takeScreenshot(page, "gandi_6_invoices_reached");
        }

        console.log("⬇️ Début de la détection et du téléchargement automatique des factures 2026...");
        
        // Gandi présente les factures dans un tableau avec des dates au format "YYYY-MM-DD" ou similar.
        // Trouvons tous les liens ou boutons de téléchargement de PDF
        // Playwright peut détecter les téléchargements
        const downloadLinks = page.locator('a[href*="/pdf"], button:has-text("PDF"), a:has-text("PDF")');
        const count = await downloadLinks.count().catch(() => 0);
        console.log(`🔍 Nombre de boutons de téléchargement PDF trouvés : ${count}`);

        if (count > 0) {
            for (let i = 0; i < Math.min(count, 15); i++) {
                const link = downloadLinks.nth(i);
                
                // Récupérer le texte de la ligne pour vérifier si c'est 2026
                // Souvent la ligne parente contient la date
                const rowText = await link.evaluate((el: any) => {
                    const row = el.closest('tr') || el.closest('div[role="row"]');
                    return row ? row.innerText : '';
                }).catch(() => "");

                console.log(`Ligne ${i+1} : ${rowText.replace(/\n/g, " | ")}`);

                // Filtrer pour 2026
                if (rowText.includes("2026") || rowText.includes("/2026") || rowText.includes("-2026")) {
                    console.log(`📥 Téléchargement de la facture 2026 (${i+1}/${count})...`);
                    try {
                        const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
                        await link.click();
                        const download = await downloadPromise;
                        const filename = download.suggestedFilename();
                        const filePath = path.join(DOWNLOADS_DIR, filename);
                        await download.saveAs(filePath);
                        console.log(`   ✅ Facture enregistrée : ${filePath}`);
                    } catch (e) {
                        console.log(`   ❌ Échec du téléchargement pour le lien ${i+1} : ${e}`);
                    }
                } else {
                    console.log(`   ⏭️ Facture hors 2026 ignorée.`);
                }
            }
        } else {
            console.log("⚠️ Aucun bouton ou lien PDF détecté automatiquement.");
            console.log("👉 Veuillez cliquer sur les boutons de téléchargement des factures 2026 manuellement dans le navigateur.");
        }

        console.log("⏳ Le robot se met en pause pour te laisser terminer si besoin.");
        await page.pause();

    } catch (err) {
        console.error("❌ Erreur pendant l'automatisation :", err);
        await takeScreenshot(page, "gandi_critical_error");
    } finally {
        await browser.close();
        console.log("🛑 Robot arrêté.");
    }
}

run();
