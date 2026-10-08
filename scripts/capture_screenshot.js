const { chromium, devices } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  
  // 1. Desktop version
  console.log("🚀 Capturing Desktop view...");
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  });
  const desktopPage = await desktopContext.newPage();
  console.log("Navigating to http://localhost:3000/comptabilite/releve...");
  await desktopPage.goto('http://localhost:3000/comptabilite/releve');
  console.log("Waiting for data to load...");
  await desktopPage.waitForTimeout(5000);

  // Click on the sorting button
  console.log("Clicking sort button to switch to chronological 'Ancien d'abord'...");
  await desktopPage.click('button:has-text("Récent d\'abord")');
  await desktopPage.waitForTimeout(2000);

  const desktopScreenshotPath = '/Users/philippeguillaume/.gemini/antigravity/brain/ff34dbd2-a1d5-4065-b4c6-3855086a099c/media_desktop_releve.png';
  await desktopPage.screenshot({ path: desktopScreenshotPath });
  console.log("Desktop screenshot saved to:", desktopScreenshotPath);
  await desktopContext.close();

  // 2. iPhone version
  console.log("\n📱 Capturing iPhone 12 view...");
  const iPhone = devices['iPhone 12'];
  const mobileContext = await browser.newContext({
    ...iPhone,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  });
  const mobilePage = await mobileContext.newPage();
  console.log("Navigating to http://localhost:3000/comptabilite/releve...");
  await mobilePage.goto('http://localhost:3000/comptabilite/releve');
  console.log("Waiting for data to load...");
  await mobilePage.waitForTimeout(5000);

  // Click on the sorting button
  console.log("Clicking sort button to switch to chronological 'Ancien d'abord'...");
  await mobilePage.click('button:has-text("Récent d\'abord")');
  await mobilePage.waitForTimeout(2000);

  const mobileScreenshotPath = '/Users/philippeguillaume/.gemini/antigravity/brain/ff34dbd2-a1d5-4065-b4c6-3855086a099c/media_iphone_releve.png';
  await mobilePage.screenshot({ path: mobileScreenshotPath });
  console.log("iPhone screenshot saved to:", mobileScreenshotPath);
  await mobileContext.close();

  await browser.close();
}

main().catch(console.error);
