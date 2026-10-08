import { chromium } from 'playwright';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    console.log("Navigating to releve page...");
    await page.goto("http://localhost:3000/comptabilite/releve", { waitUntil: "networkidle" });

    // Wait for transactions to load
    await page.waitForSelector("table, [role='table'], tr, .space-y-4", { timeout: 15000 });

    // Take overview screenshot
    await page.screenshot({ path: "screenshot_releve_cpam_enriched.png", fullPage: false });
    console.log("Screenshot saved: screenshot_releve_cpam_enriched.png");

    // Click on a CPAM row to expand it
    const cpamPill = page.locator("text=tiers-payant CPAM").first();
    if (await cpamPill.count() > 0) {
        console.log("Found CPAM pill, clicking to expand...");
        await cpamPill.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "screenshot_releve_cpam_expanded_live.png", fullPage: false });
        console.log("Screenshot saved: screenshot_releve_cpam_expanded_live.png");
    }

    await browser.close();
}

main().catch(console.error);
