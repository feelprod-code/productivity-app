import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7706f2fe-23f4-4d60-bd0a-fa94b31e2b92/scratch";

async function main() {
    console.log("🚀 Début de la mise à jour des Serveurs de Noms vers Vercel sur Gandi...");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: STATE_FILE,
        viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    try {
        await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/nameservers", { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        // Cliquer sur le bouton d'édition
        console.log("👉 Clic sur modifier les serveurs de noms...");
        const editBtn = page.locator('button:has(svg), a:has(svg), [aria-label*="éditer"], [aria-label*="modifier"]').last();
        await editBtn.click();
        await page.waitForTimeout(2000);

        // Trouver tous les inputs de serveurs
        const inputs = page.locator('input[type="text"]');
        const count = await inputs.count();
        console.log(`Nombre d'inputs trouvés : ${count}`);

        for (let i = 0; i < count; i++) {
            const val = await inputs.nth(i).inputValue();
            console.log(`Input ${i} valeur actuelle : "${val}"`);
        }

        if (count >= 2) {
            console.log("✏️ Remplissage Serveur 1 : ns1.vercel-dns.com");
            await inputs.nth(0).fill("ns1.vercel-dns.com");
            await page.waitForTimeout(500);

            console.log("✏️ Remplissage Serveur 2 : ns2.vercel-dns.com");
            await inputs.nth(1).fill("ns2.vercel-dns.com");
            await page.waitForTimeout(500);

            // Vider les éventuels serveurs suivants (Serveur 3, 4...)
            for (let i = 2; i < count; i++) {
                console.log(`🧹 Nettoyage Input ${i}`);
                await inputs.nth(i).fill("");
            }

            const filePathBefore = path.join(ARTIFACT_DIR, "gandi_nameservers_filled.png");
            await page.screenshot({ path: filePathBefore, fullPage: true });
            console.log(`📸 Capture avant validation : ${filePathBefore}`);

            console.log("💾 Clic sur Enregistrer...");
            const saveBtn = page.locator('button:has-text("Enregistrer"), button[type="submit"]').first();
            await saveBtn.click();

            await page.waitForTimeout(5000);

            const filePathAfter = path.join(ARTIFACT_DIR, "gandi_nameservers_saved.png");
            await page.screenshot({ path: filePathAfter, fullPage: true });
            console.log(`📸 Capture après enregistrement : ${filePathAfter}`);

            console.log("✅ Modifications soumises avec succès !");
        }

    } catch (err) {
        console.error("❌ Erreur :", err);
    }
}

main();
