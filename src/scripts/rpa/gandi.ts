import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import imaps from "imap-simple";
import { simpleParser } from "mailparser";

// Charger les variables de l'environnement global d'ANTIGRAVITY
dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const GANDI_USERNAME = process.env.GANDI_USERNAME;
const GANDI_PASSWORD = process.env.GANDI_PASSWORD;
const ICLOUD_EMAIL = process.env.ICLOUD_EMAIL || 'guillaumephilippe@me.com';
const ICLOUD_APP_PASSWORD = process.env.ICLOUD_APP_PASSWORD || 'vcny-lusr-hugo-djpa';

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const DOWNLOADS_DIR = "/Users/philippeguillaume/Downloads"; // Enregistrer directement dans Downloads de l'utilisateur
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7e8add28-1259-4dd6-adef-0f80ff678346";

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

const imapConfig = {
    imap: {
        user: ICLOUD_EMAIL,
        password: ICLOUD_APP_PASSWORD,
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function takeScreenshot(page: any, name: string) {
    const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
    console.log(`📸 Capture d'écran enregistrée : ${filePath}`);
}

async function fetchGandi2FACode(): Promise<string | null> {
    console.log("⏳ [IMAP] Connexion à iCloud Mail pour récupérer le code 2FA de Gandi...");
    try {
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        const delay = 3 * 60 * 1000; // chercher sur les 3 dernières minutes
        const sinceDate = new Date(Date.now() - delay);
        
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const dateStr = `${sinceDate.getDate()}-${months[sinceDate.getMonth()]}-${sinceDate.getFullYear()}`;
        
        const searchCriteria = [
            ['SINCE', dateStr],
            ['HEADER', 'SUBJECT', 'Gandi']
        ];
        
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            struct: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`🔍 [IMAP] Messages trouvés : ${messages.length}`);

        let latestCode: string | null = null;
        let latestTime = 0;

        for (const msg of messages) {
            const rawBodyPart = msg.parts.find(p => p.which === '');
            if (!rawBodyPart) continue;
            const parsed = await simpleParser(rawBodyPart.body);
            
            const subject = parsed.subject || '';
            const from = parsed.from?.text || '';
            const date = parsed.date || new Date(0);
            
            if (from.toLowerCase().includes('gandi') || subject.toLowerCase().includes('seconde authentification') || subject.toLowerCase().includes('code')) {
                const bodyText = parsed.text || '';
                const match = bodyText.match(/\b\d{6}\b/);
                if (match && date.getTime() > latestTime) {
                    latestCode = match[0];
                    latestTime = date.getTime();
                }
            }
        }

        connection.end();
        return latestCode;
    } catch (err) {
        console.error("❌ [IMAP] Erreur lors de la récupération du code :", err);
        return null;
    }
}

async function run() {
    if (!GANDI_USERNAME || !GANDI_PASSWORD) {
        console.error("❌ ERREUR: GANDI_USERNAME ou GANDI_PASSWORD n'est pas défini dans le .env global");
        process.exit(1);
    }

    console.log("🤖 Lancement du robot Gandi 100% Autonome...");

    const hasState = fs.existsSync(STATE_FILE);

    // Lancer en mode visible sur le Mac pour que l'utilisateur voie l'automatisation en direct
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: hasState ? STATE_FILE : undefined,
        viewport: { width: 1280, height: 800 },
        acceptDownloads: true
    });

    const page = await context.newPage();

    try {
        console.log("👉 Navigation vers id.gandi.net...");
        await page.goto("https://id.gandi.net/login");
        await page.waitForTimeout(3000);

        const usernameInput = page.locator('input[placeholder="Your username"], input[name="username"]').first();
        const passwordInput = page.locator('input[placeholder="Your password"], input[name="password"]').first();

        const isLoginRequired = await usernameInput.isVisible().catch(() => false) || 
                                await passwordInput.isVisible().catch(() => false);

        if (!hasState || isLoginRequired) {
            console.log("🔐 Remplissage des identifiants...");
            if (await usernameInput.isVisible()) {
                await usernameInput.click();
                await usernameInput.fill(GANDI_USERNAME);
            }
            if (await passwordInput.isVisible()) {
                await passwordInput.click();
                await passwordInput.fill(GANDI_PASSWORD);
            }

            console.log("➡️ Clic sur Log in...");
            const submitBtn = page.locator('button[type="submit"][name="form.submitted"], button[type="submit"]:has-text("Log in")').first();
            if (await submitBtn.isVisible().catch(() => false)) {
                await submitBtn.click();
            } else {
                await page.keyboard.press("Enter");
            }

            await page.waitForTimeout(5000);
            await takeScreenshot(page, "gandi_after_submit");

            // Vérifier s'il y a une demande de double authentification (2FA)
            const is2FA = await page.locator('input[name="code"], input[id="code"], input[placeholder*="code"], form:has-text("authentification")').first().isVisible().catch(() => false) ||
                          (await page.innerText("body").catch(() => "")).includes("authentification");

            if (is2FA) {
                console.log("⚠️ Seconde authentification détectée ! Récupération du code par email...");
                
                // Attendre encore 10 secondes pour que l'email arrive et soit synchronisé sur iCloud
                await page.waitForTimeout(10000);
                
                let code = await fetchGandi2FACode();
                
                if (!code) {
                    console.log("⏳ Code non reçu. Nouvelle tentative dans 15 secondes...");
                    await page.waitForTimeout(15000);
                    code = await fetchGandi2FACode();
                }

                if (code) {
                    console.log(`🔑 Saisie automatique du code 2FA : ${code}`);
                    // Cibler l'input du code
                    const codeInput = page.locator('input[name="code"], input[type="text"], input').first();
                    await codeInput.click();
                    await codeInput.fill(code);
                    await page.waitForTimeout(1000);
                    
                    // Valider
                    const verifyBtn = page.locator('button:has-text("Vérifier"), button[type="submit"], button:has-text("Verify")').first();
                    if (await verifyBtn.isVisible()) {
                        await verifyBtn.click();
                    } else {
                        await page.keyboard.press("Enter");
                    }
                    console.log("➡️ Code soumis !");
                } else {
                    console.log("❌ Impossible de récupérer le code 2FA automatiquement. Merci de le saisir manuellement.");
                }
            }

            console.log("⏳ Attente de la redirection vers l'administration...");
            await page.waitForURL(/admin.gandi.net/, { timeout: 120000 });
            console.log("✅ Connexion réussie !");
            await context.storageState({ path: STATE_FILE });
        } else {
            console.log("✅ Déjà connecté grâce à la session active.");
            await page.goto("https://admin.gandi.net/");
            await page.waitForLoadState("networkidle");
        }

        console.log("📄 Navigation directe vers l'onglet Factures (Invoices)...");
        await page.goto("https://admin.gandi.net/billing/invoices");
        await page.waitForTimeout(6000);

        const currentUrl = page.url();
        if (!currentUrl.includes("/billing/invoices")) {
            console.log("👉 Choix d'une organisation requis par Gandi. Redirection en cours...");
            // Si l'utilisateur a plusieurs organisations, on prend la première ou on attend qu'il clique
            const orgLink = page.locator('a[href*="/billing/invoices"]').first();
            if (await orgLink.isVisible()) {
                await orgLink.click();
                await page.waitForTimeout(5000);
            } else {
                console.log("👉 Veuillez cliquer sur votre organisation dans l'interface Chromium ouverte...");
                await page.waitForURL(/billing\/invoices/, { timeout: 60000 });
                await page.waitForTimeout(4000);
            }
        }

        await takeScreenshot(page, "gandi_invoices_list");

        console.log("⬇️ Téléchargement des factures de 2026...");
        const downloadLinks = page.locator('a[href*="/pdf"], button:has-text("PDF"), a:has-text("PDF")');
        const count = await downloadLinks.count().catch(() => 0);
        console.log(`🔍 Boutons PDF détectés : ${count}`);

        let downloadedCount = 0;

        for (let i = 0; i < count; i++) {
            const link = downloadLinks.nth(i);
            const rowText = await link.evaluate((el: any) => {
                const row = el.closest('tr') || el.closest('div[role="row"]');
                return row ? row.innerText : '';
            }).catch(() => "");

            if (rowText.includes("2026") || rowText.includes("/2026") || rowText.includes("-2026")) {
                console.log(`📥 Téléchargement de la facture 2026...`);
                try {
                    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
                    await link.click();
                    const download = await downloadPromise;
                    const filename = download.suggestedFilename();
                    const filePath = path.join(DOWNLOADS_DIR, filename);
                    await download.saveAs(filePath);
                    console.log(`   ✅ Facture téléchargée : ${filename}`);
                    downloadedCount++;
                } catch (e) {
                    console.log(`   ❌ Erreur de téléchargement : ${e}`);
                }
            }
        }

        console.log(`📊 Bilan : ${downloadedCount} facture(s) Gandi de 2026 ont été téléchargée(s) dans ton dossier Downloads.`);

    } catch (err) {
        console.error("❌ Une erreur est survenue dans le robot :", err);
    } finally {
        await browser.close();
        console.log("🛑 Robot arrêté.");
    }
}

run();
