import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:3000/comptabilite/releve", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Type CPAM into the search box
  const searchInput = await page.$("input[placeholder*='Rechercher']");
  if (searchInput) {
    await searchInput.fill("CPAM");
    await page.waitForTimeout(600);
  }

  // Find a CPAM pill with "tiers-payant"
  const cpamPill = await page.$("text=tiers-payant");
  if (cpamPill) {
    console.log("Found CPAM tiers-payant pill! Clicking...");
    await cpamPill.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_cpam_expanded.png" });
    console.log("CPAM screenshot saved!");
  } else {
    console.log("Looking for May month...");
  }

  // Also search for URSSAF
  if (searchInput) {
    await searchInput.fill("URSSAF");
    await page.waitForTimeout(600);
    await page.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_urssaf_reconciled.png" });
    console.log("URSSAF screenshot saved!");
  }

  await browser.close();
}

main().catch(console.error);
