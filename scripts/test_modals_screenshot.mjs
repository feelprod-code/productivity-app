import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:3000/facturation", { waitUntil: "networkidle" });

  // Ouvrir le modal d'export
  await page.click("text=Export Compta (CSV / JSON)");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_export_modal.png" });
  console.log("Export modal screenshot saved.");

  // Fermer le modal
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Ouvrir le modal nouveau FeelProd
  await page.click("text=Nouveau Devis / Facture");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_feelprod_modal.png" });
  console.log("FeelProd modal screenshot saved.");

  await browser.close();
}

main().catch(console.error);
