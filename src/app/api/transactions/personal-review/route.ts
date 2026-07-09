import { NextResponse } from "next/server";

export async function GET() {
    try {
        const pennylaneKey = process.env.PENNYLANE_API_KEY;
        if (!pennylaneKey) {
            return NextResponse.json({ error: "Missing PENNYLANE_API_KEY" }, { status: 500 });
        }

        const BASE_URL = "https://app.pennylane.com/api/external/v2";
        let cursor: string | null = null;
        const allTransactions: any[] = [];
        
        // Fetch up to 10 pages (1000 transactions) to cover all of 2026
        for (let page = 1; page <= 10; page++) {
            const fetchUrl: string = `${BASE_URL}/transactions` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
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
            allTransactions.push(...items);
            
            const nextCursor = data.next_cursor || data.meta?.next_cursor;
            if (nextCursor) {
                cursor = nextCursor;
            } else {
                break;
            }
        }

        // Fetch bank accounts to map names
        const accountsRes = await fetch(`${BASE_URL}/bank_accounts`, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json'
            }
        });
        const accountsData = await accountsRes.json();
        const accounts = accountsData.bank_accounts || accountsData.items || [];
        const accountNames: { [key: number]: string } = {};
        accounts.forEach((a: any) => {
            accountNames[a.id] = a.name;
        });

        // Filter and analyze
        const personalKeywords = [
            'canal', 'netflix', 'disney', 'carrefour', 'monoprix', 'auchan', 'leclerc', 'intermarche',
            'uber', 'deliveroo', 'zara', 'decathlon', 'leroy', 'boulangerie', 'restau', 
            'cafe', 'darty', 'spotify', 'sncf', 'airbnb', 'booking.com', 'h&m', 'ikea', 'castorama'
        ];

        // Filter for transactions since 2026-01-01, debits (amount < 0)
        const debitTransactions = allTransactions.filter(tx => {
            const txDate = new Date(tx.date);
            const amountVal = parseFloat(tx.amount);
            return txDate >= new Date('2026-01-01') && amountVal < 0;
        });

        const itemsToReview = debitTransactions.map(tx => {
            const labelLower = (tx.label || '').toLowerCase();
            const amountVal = Math.abs(parseFloat(tx.amount));
            const isAlreadyExploitant = tx.categories && tx.categories.some((c: any) => c.account_number && c.account_number.startsWith('108'));
            const matchesPersonalKeyword = personalKeywords.some(k => labelLower.includes(k));

            let flagReason = "";
            let score = 0;

            if (isAlreadyExploitant) {
                flagReason = "Déjà pointé en Perso (108)";
                score = 100;
            } else if (matchesPersonalKeyword) {
                const keyword = personalKeywords.find(k => labelLower.includes(k));
                flagReason = `Commerçant personnel détecté ("${keyword}")`;
                score = 80;
            }

            return {
                id: tx.id,
                date: tx.date,
                label: tx.label,
                amount: amountVal,
                bankAccountName: tx.bank_account ? accountNames[tx.bank_account.id] || "Inconnu" : "Inconnu",
                bankAccountId: tx.bank_account ? tx.bank_account.id : null,
                alreadyExploitant: isAlreadyExploitant,
                flagReason,
                score
            };
        }).filter(item => item.score > 0)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json({ transactions: itemsToReview });
    } catch (error: any) {
        console.error("Error in personal-review API:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
