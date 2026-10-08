import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");

async function main() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();

    await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/nameservers", { waitUntil: "networkidle" });
    const editBtn = page.locator('button:has(svg), a:has(svg), [aria-label*="éditer"], [aria-label*="modifier"]').last();
    await editBtn.click();
    await page.waitForTimeout(2000);

    const buttons = await page.locator('button, [role="button"], [role="tab"], [role="radio"]').allInnerTexts();
    console.log("Boutons trouvés :", JSON.stringify(buttons));

    const html = await page.locator('main, form, [class*="content"]').first().innerHTML();
    console.log("Extrait HTML :", html.substring(0, 1000));
}

main();
