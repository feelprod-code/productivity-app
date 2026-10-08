import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  
  // 1. Desktop View
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  console.log("Navigating to releve page on Desktop...");
  await page.goto("http://localhost:3000/comptabilite/releve", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_releve_desktop.png" });
  console.log("Desktop screenshot saved.");

  // Expand month Mai 2026 or Avril 2026 or Septembre 2026 to show CPAM / SumUp / URSSAF
  const rows = await page.$$("tr");
  console.log(`Found ${rows.length} rows.`);

  // Click on a SumUp or CPAM row to expand
  const cpamOrSumupRow = await page.$("text=patient");
  if (cpamOrSumupRow) {
    console.log("Found patient pill, clicking parent row...");
    await cpamOrSumupRow.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_releve_expanded_patient.png" });
    console.log("Expanded patient screenshot saved.");
  }

  // 2. Mobile View (iPhone 17 Pro Max benchmark: 440 x 764)
  const mobilePage = await browser.newPage({ viewport: { width: 440, height: 764 } });
  console.log("Navigating to releve page on Mobile...");
  await mobilePage.goto("http://localhost:3000/comptabilite/releve", { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1000);

  await mobilePage.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_releve_mobile.png" });
  console.log("Mobile screenshot saved.");

  await browser.close();
}

main().catch(console.error);
