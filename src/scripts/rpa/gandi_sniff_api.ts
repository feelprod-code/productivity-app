import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const STATE_FILE = path.resolve(__dirname, "gandi-state.json");

async function main() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();

    page.on("request", req => {
        if (req.url().includes("api") || req.url().includes("gandi")) {
            const auth = req.headers()["authorization"] || "";
            if (auth) {
                console.log("AUTH HEADER FOUND:", auth);
            }
        }
    });

    page.on("response", async res => {
        if (res.url().includes("nameservers") || res.url().includes("livedns") || res.url().includes("records")) {
            console.log("API RES:", res.status(), res.url());
            try {
                const body = await res.text();
                console.log("BODY:", body.substring(0, 300));
            } catch (e) {}
        }
    });

    console.log("👉 Chargement de la page domaine...");
    await page.goto("https://admin.gandi.net/domain/23a8f238-7ce4-11e7-9bfe-00163e61ef31/techniquesdoucestissulaires.fr/nameservers", { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    await browser.close();
}

main();
