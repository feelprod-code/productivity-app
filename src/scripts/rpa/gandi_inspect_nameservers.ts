import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7706f2fe-23f4-4d60-bd0a-fa94b31e2b92/scratch";

async function main() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: STATE_FILE,
        viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    try {
        console.log("👉 Navigation vers Serveurs de noms...");
        await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/nameservers", { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);

        const filePath = path.join(ARTIFACT_DIR, "gandi_nameservers_view.png");
        await page.screenshot({ path: filePath, fullPage: true });
        console.log(`📸 Capture : ${filePath}`);

    } catch (err) {
        console.error("❌ Erreur :", err);
    }
}

main();
