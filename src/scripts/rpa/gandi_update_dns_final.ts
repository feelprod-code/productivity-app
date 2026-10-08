import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "/Users/philippeguillaume/ANTIGRAVITY/.env" });

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");
const ARTIFACT_DIR = "/Users/philippeguillaume/.gemini/antigravity/brain/7706f2fe-23f4-4d60-bd0a-fa94b31e2b92/scratch";

async function main() {
    console.log("🚀 Lancement de la configuration finale des enregistrements DNS Gandi vers Vercel...");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STATE_FILE, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
        page.on("request", req => {
            if (req.url().includes("livedns") || req.url().includes("records") || req.method() === "PUT" || req.method() === "POST") {
                console.log(`[REQ] ${req.method()} ${req.url()}`);
            }
        });

        page.on("response", async res => {
            if (res.url().includes("livedns") || res.url().includes("records")) {
                console.log(`[RES] ${res.status()} ${res.url()}`);
                try {
                    const text = await res.text();
                    console.log(`[BODY] ${text.substring(0, 200)}`);
                } catch (e) {}
            }
        });

        // 1. MODIFIER L'ENREGISTREMENT A (@)
        console.log("👉 Accès aux enregistrements DNS...");
        await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/records", { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        const rowA = page.locator('tr').filter({ hasText: '217.70.184.38' }).first();
        console.log("👉 Ligne A trouvée. Clic sur le bouton crayon...");
        const editBtnA = rowA.locator('button, a').first();
        await editBtnA.click();
        await page.waitForURL(/\/records\//, { timeout: 10000 });
        await page.waitForTimeout(1500);

        console.log("👉 URL édition A :", page.url());
        
        // L'input IPv4 exact : name="ipv4"
        const ipInput = page.locator('input[name="ipv4"]').first();
        await ipInput.click();
        await ipInput.fill("");
        await ipInput.fill("76.76.21.21");
        await page.waitForTimeout(500);

        const submitBtnA = page.locator('button[type="submit"]:has-text("Modifier")').first();
        console.log("💾 Clic sur Modifier (A)...");
        await submitBtnA.click();
        await page.waitForURL(/\/records$/, { timeout: 15000 });
        console.log("✅ Enregistrement A mis à jour vers 76.76.21.21 !");
        await page.waitForTimeout(2500);

        // 2. MODIFIER L'ENREGISTREMENT CNAME (www)
        console.log("👉 Recherche de la ligne CNAME www...");
        const rowWww = page.locator('tr').filter({ hasText: 'webredir.vip.gandi.net.' }).first();
        console.log("👉 Ligne CNAME www trouvée. Clic sur le bouton crayon...");
        const editBtnWww = rowWww.locator('button, a').first();
        await editBtnWww.click();
        await page.waitForURL(/\/records\//, { timeout: 10000 });
        await page.waitForTimeout(1500);

        console.log("👉 URL édition CNAME :", page.url());
        const inputsWww = await page.locator('input').all();
        for (let i = 0; i < inputsWww.length; i++) {
            const name = await inputsWww[i].getAttribute("name");
            const val = await inputsWww[i].inputValue();
            console.log(`CNAME Input #${i}: name="${name}" val="${val}"`);
        }

        // L'input editable pour la cible CNAME
        const cnameInput = page.locator('main input:not([disabled]):not([readonly]):not([name="ttl_value"]):not([name="name"])').first();
        await cnameInput.click();
        await cnameInput.fill("");
        await cnameInput.fill("cname.vercel-dns.com.");
        await page.waitForTimeout(500);

        const submitBtnWww = page.locator('button[type="submit"]:has-text("Modifier")').first();
        console.log("💾 Clic sur Modifier (CNAME)...");
        await submitBtnWww.click();
        await page.waitForURL(/\/records$/, { timeout: 15000 });
        console.log("✅ Enregistrement CNAME www mis à jour vers cname.vercel-dns.com. !");
        await page.waitForTimeout(2000);

        // Capture finale du tableau DNS
        await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/records", { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        const finalCapture = path.join(ARTIFACT_DIR, "gandi_final_dns_table.png");
        await page.screenshot({ path: finalCapture, fullPage: true });
        console.log(`📸 Capture finale : ${finalCapture}`);

        const recordsText = await page.locator("main").innerText();
        console.log("TABLEAU FINAL DES ENREGISTREMENTS:\n", recordsText);

    } catch (err) {
        console.error("❌ Erreur :", err);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "gandi_error_update.png"), fullPage: true }).catch(() => {});
    } finally {
        await browser.close();
    }
}

main();
