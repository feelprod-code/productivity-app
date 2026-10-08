import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7706f2fe-23f4-4d60-bd0a-fa94b31e2b92/scratch";

async function main() {
    console.log("👉 Modification de l'enregistrement A vers 76.76.21.21...");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STATE_FILE, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/records", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Trouver la ligne contenant "@" et "A"
    const rowA = page.locator('tr:has-text("@"):has-text("A")').first();
    const editBtn = rowA.locator('button:has-text("Modifier"), a:has-text("Modifier")').first();
    await editBtn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "gandi_edit_a_modal.png"), fullPage: true });

    // Modifier la valeur IP
    console.log("✏️ Remplacement de l'IP par 76.76.21.21...");
    const valInput = page.locator('input[name*="value"], input[name*="target"], input[placeholder*="IPv4"], input[type="text"]').last();
    await valInput.fill("76.76.21.21");
    await page.waitForTimeout(500);

    // Bouton Sauvegarder/Valider
    const saveBtn = page.locator('button:has-text("Sauvegarder"), button:has-text("Valider"), button:has-text("Enregistrer"), button[type="submit"]').first();
    await saveBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "gandi_after_save_a.png"), fullPage: true });
    console.log("✅ Enregistrement A mis à jour vers 76.76.21.21 !");

    await browser.close();
}

main();
