import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import { getCopilotStatus, setCopilotStatus, resetCopilotStatus } from '@/lib/copilotState';

// Load env files
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(os.homedir(), 'ANTIGRAVITY', '.env') });

export const dynamic = 'force-dynamic';

function getPdfCount(dir: string): number {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += getPdfCount(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf') && !entry.name.toUpperCase().includes('REJETE')) {
        count++;
      }
    }
  } catch (e) {
    console.error('Error scanning dir for count:', dir, e);
  }
  return count;
}

// Function to run a single script and parse its output
function runScript(stageName: string, scriptPath: string, startDate?: string): Promise<void> {
  return new Promise((resolve) => {
    // Set status to starting
    const status = getCopilotStatus();
    
    let total = 0;
    let current = 0;
    
    if (stageName === 'simple') {
      // Calculate total files for simple reconciliation
      const baseDir = '/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta';
      total = getPdfCount(path.join(baseDir, 'Factures 2025')) + getPdfCount(path.join(baseDir, 'Factures 2026'));
      console.log(`[Copilot] Scan simple: Found ${total} PDF files`);
    }

    setCopilotStatus({
      currentStage: stageName,
      progress: total > 0 ? { current: 0, total } : null,
      logs: [...status.logs, `\n--- Lancement de l'étape : ${stageName.toUpperCase()} ---${startDate ? ` (depuis le ${startDate})` : ''}`]
    });

    const projectRoot = path.resolve(process.cwd());
    const fullScriptPath = path.join(projectRoot, scriptPath);
    
    // Spawn tsx with the script
    const child = spawn('npx', ['tsx', fullScriptPath], {
      cwd: projectRoot,
      env: {
        ...process.env,
        COPILOT_START_DATE: startDate || '',
        FORCE_COLOR: '1'
      }
    });

    let buffer = '';

    const handleOutput = (data: Buffer) => {
      buffer += data.toString('utf8');
      const lines = buffer.split('\n');
      // Keep the last unfinished line in buffer
      buffer = lines.pop() || '';

      const currentStatus = getCopilotStatus();
      const newLogs = [...currentStatus.logs];

      for (const line of lines) {
        if (!line.trim()) continue;
        newLogs.push(`[${stageName}] ${line}`);
        
        // Parsing for progress tracking
        if (stageName === 'simple') {
          // Look for: "Analyse fichier local"
          if (line.includes('Analyse fichier local') || line.includes('Analyse fichier local :')) {
            current++;
            setCopilotStatus({
              progress: { current: Math.min(current, total), total }
            });
          }
        } else if (stageName === 'imported_folders') {
          // Look for: "[Y/X] Processing"
          const match = line.match(/\[(\d+)\/(\d+)\]\s+Processing/);
          if (match) {
            const cur = parseInt(match[1], 10);
            const tot = parseInt(match[2], 10);
            setCopilotStatus({
              progress: { current: cur, total: tot }
            });
          }
        }
      }

      setCopilotStatus({ logs: newLogs });
    };

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);

    child.on('close', (code) => {
      const currentStatus = getCopilotStatus();
      const logs = [...currentStatus.logs, `--- Étape ${stageName.toUpperCase()} terminée avec le code ${code} ---`];
      setCopilotStatus({
        logs,
        progress: null
      });
      resolve();
    });
  });
}

async function startCopilotQueue(stages: string[], startDate?: string) {
  // Reset logs and set status to running
  setCopilotStatus({
    running: true,
    status: 'running',
    stages,
    currentStage: null,
    progress: null,
    logs: [`=== Démarrage du Copilote FeelProd${startDate ? ` (Période : depuis le ${startDate})` : ''} ===`]
  });

  const scriptMap: Record<string, string> = {
    emails: 'scripts/sync_all_emails.ts',
    amazon: 'scripts/import_amazon_desktop.ts',
    sumup: 'scripts/enrich_sumup_from_icloud.ts',
    imported_folders: 'scripts/run_global_autopilot.ts',
    simple: 'scripts/reconcile_all_local_invoices.ts'
  };

  try {
    for (const stage of stages) {
      const script = scriptMap[stage];
      if (script) {
        await runScript(stage, script, startDate);
      } else {
        const status = getCopilotStatus();
        setCopilotStatus({
          logs: [...status.logs, `⚠️ Étape inconnue : ${stage}`]
        });
      }
    }
    const status = getCopilotStatus();
    setCopilotStatus({
      running: false,
      status: 'success',
      currentStage: null,
      progress: null,
      logs: [...status.logs, '=== Le Copilote a terminé toutes les étapes ! ===']
    });
  } catch (err: any) {
    console.error('Copilot queue execution failed:', err);
    const status = getCopilotStatus();
    setCopilotStatus({
      running: false,
      status: 'error',
      currentStage: null,
      progress: null,
      logs: [...status.logs, `🔥 Erreur générale du Copilote : ${err.message}`]
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Check if we want to reset
    if (body.action === 'reset') {
      resetCopilotStatus();
      return NextResponse.json({ success: true, message: 'Copilot status reset successfully' });
    }

    const { stages, startDate } = body;
    if (!stages || !Array.isArray(stages)) {
      return NextResponse.json({ error: 'Stages array is required' }, { status: 400 });
    }

    const currentStatus = getCopilotStatus();
    if (currentStatus.running) {
      return NextResponse.json({ error: 'Copilot is already running' }, { status: 409 });
    }

    // Trigger queue in background (without waiting for it to finish)
    startCopilotQueue(stages, startDate);

    return NextResponse.json({ success: true, message: 'Copilot started in background' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
