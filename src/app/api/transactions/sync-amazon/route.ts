import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from 'fs';
import * as path from 'path';

const execPromise = promisify(exec);

export async function POST() {
  console.log("=== API Sync Amazon triggered ===");
  try {
    // 1. Exécuter le script d'importation d'Amazon
    // On lance le script de manière asynchrone
    const scriptPath = path.join(process.cwd(), 'scripts', 'import_amazon_desktop.ts');
    
    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json({ success: false, error: "Le script d'importation Amazon est introuvable." }, { status: 404 });
    }

    console.log(`Executing: npx ts-node "${scriptPath}"`);
    const { stdout, stderr } = await execPromise(`npx ts-node "${scriptPath}"`);
    
    console.log("Amazon sync script output:\n", stdout);
    if (stderr) {
      console.warn("Amazon sync script stderr:\n", stderr);
    }

    return NextResponse.json({ 
      success: true, 
      message: "Synchronisation Amazon effectuée avec succès !",
      log: stdout 
    });

  } catch (err: any) {
    console.error("Failed to run Amazon sync script:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message, 
      log: err.stdout || "" 
    }, { status: 500 });
  }
}
