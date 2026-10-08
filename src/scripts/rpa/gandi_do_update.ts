import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7706f2fe-23f4-4d60-bd0a-fa94b31e2b92/scratch";

async function main() {
    console.log("👉 Exécution directe de la mise à jour DNS...");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STATE_FILE, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
        // 1. Modifier A (@)
        await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/records", { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        const rowA = page.locator('tr').filter({ hasText: /^@\s*A\b/ }).first();
        await rowA.locator('button:has-text("Modifier")').click();
        await page.waitForURL(/\/records\//, { timeout: 10000 });
        await page.waitForTimeout(1000);

        console.log("URL d'édition A :", page.url());
        // L'input contenant l'adresse IP actuelle
        const ipInput = page.locator('input[value="217.70.184.38"], input[type="text"]').last();
        await ipInput.fill("76.76.21.21");
        await page.waitForTimeout(500);

        // Valider
        await page.locator('button[type="submit"]:has-text("Modifier")').click({ force: true });
        await page.waitForURL(/\/records$/, { timeout: 15000 });
        console.log("✅ Enregistrement A validé !");

        await page.waitForTimeout(2000);

        // 2. Modifier CNAME (www)
        const rowWww = page.locator('tr').filter({ hasText: /^www\s*CNAME\b/ }).first();
        await rowWww.locator('button:has-text("Modifier")').click();
        await page.waitForURL(/\/records\//, { timeout: 10000 });
        await page.waitForTimeout(1000);

        console.log("URL d'édition CNAME :", page.url());
        const cnameInput = page.locator('input[type="text"]').last();
        await cnameInput.fill("cname.vercel-dns.com.");
        await page.waitForTimeout(500);

        await page.locator('button[type="submit"]:has-text("Modifier")').click({ force: true });
        await page.waitForURL(/\/records$/, { timeout: 15000 });
        console.log("✅ Enregistrement CNAME validé !");

        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "gandi_success_records.png"), fullPage: true });

        const text = await page.locator("main").innerText();
        console.log("TABLEAU FINAL:\n", text);

    } catch (err) {
        console.error("❌ Erreur :", err);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "gandi_error_do_update.png"), fullPage: true }).catch(() => {});
    } finally {
        await browser.close();
    }
}

main();
