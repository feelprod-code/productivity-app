import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import imaps from "imap-simple";
import { simpleParser } from "mailparser";

dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const GANDI_USERNAME = process.env.GANDI_USERNAME;
const GANDI_PASSWORD = process.env.GANDI_PASSWORD;
const ICLOUD_EMAIL = process.env.ICLOUD_EMAIL || 'guillaumephilippe@me.com';
const ICLOUD_APP_PASSWORD = process.env.ICLOUD_APP_PASSWORD || 'vcny-lusr-hugo-djpa';

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7706f2fe-23f4-4d60-bd0a-fa94b31e2b92/scratch";

if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
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
    console.log(`📸 Capture : ${filePath}`);
}

async function fetchGandi2FACode(): Promise<string | null> {
    console.log("⏳ [IMAP] Recherche du code 2FA Gandi dans iCloud Mail...");
    try {
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        const delay = 5 * 60 * 1000;
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
        console.error("❌ [IMAP] Erreur :", err);
        return null;
    }
}

async function main() {
    console.log("🤖 Connexion automatique à Gandi...");
    const hasState = fs.existsSync(STATE_FILE);

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: hasState ? STATE_FILE : undefined,
        viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    try {
        await page.goto("https://admin.gandi.net/domain", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        const currentUrl = page.url();
        console.log("URL initiale :", currentUrl);

        if (currentUrl.includes("id.gandi.net")) {
            console.log("🔐 Formulaire de connexion détecté.");
            const usernameInput = page.locator('input[placeholder*="identifiant"], input[placeholder*="username"], input[name="username"]').first();
            const passwordInput = page.locator('input[placeholder*="mot de passe"], input[placeholder*="password"], input[name="password"]').first();

            await usernameInput.waitFor({ state: "visible", timeout: 10000 });
            await usernameInput.fill(GANDI_USERNAME || "");
            await passwordInput.fill(GANDI_PASSWORD || "");

            console.log("➡️ Clic sur Se connecter...");
            const submitBtn = page.locator('button:has-text("Se connecter"), button[type="submit"]').first();
            await submitBtn.click();

            await page.waitForTimeout(4000);
            await takeScreenshot(page, "gandi_after_submit");

            // Vérifier 2FA
            const bodyText = await page.innerText("body").catch(() => "");
            if (bodyText.includes("authentification") || bodyText.includes("code") || bodyText.includes("Sécurité")) {
                console.log("⚠️ Demande de 2FA détectée. Attente 10s pour réception de l'email...");
                await page.waitForTimeout(10000);
                let code = await fetchGandi2FACode();
                if (!code) {
                    console.log("⏳ Deuxième essai de lecture email...");
                    await page.waitForTimeout(12000);
                    code = await fetchGandi2FACode();
                }

                if (code) {
                    console.log(`🔑 Code 2FA reçu : ${code}`);
                    const codeInput = page.locator('input[name="code"], input[type="text"], input').first();
                    await codeInput.fill(code);
                    await page.keyboard.press("Enter");
                    await page.waitForTimeout(5000);
                } else {
                    console.log("⚠️ Aucun code automatique reçu.");
                }
            }

            await page.waitForURL(/admin.gandi.net/, { timeout: 60000 });
            console.log("✅ Connexion réussie à admin.gandi.net !");
            await context.storageState({ path: STATE_FILE });
        }

        console.log("👉 Accès à la gestion du domaine techniquesdoucestissulaires.fr...");
        await page.goto("https://admin.gandi.net/domain", { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);
        await takeScreenshot(page, "gandi_domain_list_logged_in");

        // Cliquer ou naviguer vers techniquesdoucestissulaires.fr
        const row = page.locator('tr:has-text("techniquesdoucestissulaires.fr"), a:has-text("techniquesdoucestissulaires.fr")').first();
        if (await row.isVisible().catch(() => false)) {
            await row.click();
        } else {
            await page.goto("https://admin.gandi.net/domain/techniquesdoucestissulaires.fr", { waitUntil: "networkidle" });
        }

        await page.waitForTimeout(3000);
        console.log("URL de gestion du domaine :", page.url());
        await takeScreenshot(page, "gandi_domain_dashboard");

    } catch (err) {
        console.error("❌ Erreur :", err);
        await takeScreenshot(page, "gandi_final_error");
    }
}

main();
