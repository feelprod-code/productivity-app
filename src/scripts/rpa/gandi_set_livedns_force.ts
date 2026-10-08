import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7706f2fe-23f4-4d60-bd0a-fa94b31e2b92/scratch";

async function main() {
    console.log("👉 Lancement de la bascule vers Gandi LiveDNS avec force click...");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: STATE_FILE,
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    try {
        await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/nameservers", { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        const editBtn = page.locator('button:has(svg), a:has(svg), [aria-label*="modifier"], [aria-label*="éditer"]').last();
        await editBtn.click();
        await page.waitForTimeout(2000);

        console.log("👉 Sélection de Gandi LiveDNS...");
        await page.locator('label:has-text("Gandi LiveDNS"), input[value="livedns"]').first().click({ force: true });
        await page.waitForTimeout(1000);

        console.log("👉 Clic sur le bouton Continuer avec JS evaluate...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            const continueBtn = btns.find(b => b.textContent && b.textContent.includes('Continuer'));
            if (continueBtn) {
                (continueBtn as HTMLElement).click();
                return true;
            }
            return false;
        });

        await page.waitForTimeout(5000);

        const afterScreenshotPath = path.join(ARTIFACT_DIR, "gandi_after_continuer_force.png");
        await page.screenshot({ path: afterScreenshotPath, fullPage: true });
        console.log(`📸 Capture : ${afterScreenshotPath}`);

        const currentUrl = page.url();
        console.log("URL après Continuer :", currentUrl);

        const text = await page.innerText("body");
        console.log("Extrait texte page après Continuer :\n", text.substring(0, 400));

    } catch (err) {
        console.error("❌ Erreur :", err);
    } finally {
        await browser.close();
    }
}

main();
