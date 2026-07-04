import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    console.log("🔍 Récupération des transactions SumUp de 2026...");
    
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [
        {
            field: "date",
            operator: "gteq",
            value: "2026-01-01"
        }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 12; page++) {
        const fetchUrl = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
        const res = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json'
            }
        });
        if (!res.ok) break;
        const data = await res.json();
        const items = data.transactions || data.items || [];
        if (items.length === 0) break;
        allTxs.push(...items);

        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) {
            txCursor = nextCursor;
        } else {
            break;
        }
    }

    // Filtrer pour ne garder que les transactions SumUp de type versement/crédit (montant positif)
    const sumupTxs = allTxs.filter((tx: any) => {
        const labelLower = (tx.label || "").toLowerCase();
        const isSumUp = labelLower.includes("sumup");
        const isCredit = parseFloat(tx.amount || "0") > 0;
        return isSumUp && isCredit;
    });

    console.log(`✅ ${sumupTxs.length} transaction(s) de crédit SumUp trouvée(s).`);

    // On prépare le payload JSON
    const payload = {
        transactions: sumupTxs.map(t => ({
            id: String(t.id),
            date: t.date,
            amount: parseFloat(t.amount || "0")
        }))
    };

    // Exécuter le script Python
    console.log("🚀 Lancement du script d'extraction Python (recherche Gmail)...");
    
    const pyProcess = spawn('uv', [
        'run',
        '--with', 'google-auth-oauthlib',
        '--with', 'google-api-python-client',
        '--with', 'pypdf',
        'python3',
        path.resolve(process.cwd(), 'scripts/extract_sumup_patients.py')
    ]);

    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    // Envoyer les transactions au script Python sur stdin
    pyProcess.stdin.write(JSON.stringify(payload));
    pyProcess.stdin.end();

    await new Promise<void>((resolve, reject) => {
        pyProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                console.error("❌ Erreur du script Python. Logs d'erreur :");
                console.error(stderrData);
                reject(new Error(`Python exited with code ${code}`));
            }
        });
    });

    // Extraire le JSON de la sortie standard
    const match = stdoutData.match(/--- JSON_RESULT_START ---\n([\s\S]*?)\n--- JSON_RESULT_END ---/);
    if (!match) {
        console.log("ℹ️ Aucun résultat JSON valide trouvé dans la sortie standard du script Python.");
        console.log(stdoutData);
        return;
    }

    const results = JSON.parse(match[1]);
    console.log(`\n🎉 Extraction terminée. Enregistrement de ${results.length} résultat(s) en base locale...`);

    for (const res of results) {
        const txId = res.id;
        const descriptionValue = `SUMUP_JSON:${JSON.stringify(res.patients)}`;
        
        await prisma.$executeRawUnsafe(
            'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
            txId,
            descriptionValue
        );
        console.log(`✅ Transaction ${txId} (${res.amount} €) enrichie avec les patients :`, res.patients);
    }

    console.log("\n🏁 Fin du script d'enrichissement SumUp !");
}

main().catch(console.error).finally(() => prisma.$disconnect());
