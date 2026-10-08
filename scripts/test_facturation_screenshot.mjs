import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  
  // Desktop
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:3000/facturation", { waitUntil: "networkidle" });
  await page.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_facturation_desktop.png", fullPage: true });
  console.log("Desktop screenshot saved.");

  // Switch to Kine
  await page.click("text=Cabinet Kiné / Thérapie");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_facturation_kine.png", fullPage: true });
  console.log("Kiné view screenshot saved.");

  // Mobile iPhone
  const mobilePage = await browser.newPage({ viewport: { width: 440, height: 950 } });
  await mobilePage.goto("http://localhost:3000/facturation", { waitUntil: "networkidle" });
  await mobilePage.screenshot({ path: "/Users/philippeguillaume/ANTIGRAVITY/compta/screenshot_facturation_mobile.png" });
  console.log("Mobile screenshot saved.");

  await browser.close();
}

main().catch(console.error);
