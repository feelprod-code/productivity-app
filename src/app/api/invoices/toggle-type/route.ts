import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, type } = body;

    if (!id || !['PRO', 'PERSO'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Paramètres invalides' }, { status: 400 });
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { type },
    });

    // Synchronisation avec Pennylane en tâche de fond (sans bloquer la réponse UI)
    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    if (pennylaneKey) {
      // On lance la promesse en arrière-plan pour garder l'interface instantanée
      (async () => {
        try {
          console.log(`🔄 Synchronisation du statut ${type} de "${updated.provider}" sur Pennylane...`);
          const BASE_URL = "https://app.pennylane.com/api/external/v2";
          let invoices: any[] = [];
          let cursor = '';

          // 1. Récupération de la liste des factures
          while (true) {
            const fetchUrl = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
            const res = await fetch(fetchUrl, {
              headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
              }
            });
            if (!res.ok) break;
            const data: any = await res.json();
            const items = data.items || data.supplier_invoices || [];
            invoices.push(...items);
            const nextCursor = data.next_cursor || data.meta?.next_cursor;
            if (nextCursor) {
              cursor = nextCursor;
            } else {
              break;
            }
          }

          // 2. Recherche par date (+/- 3 jours) et montant exact
          const targetTime = new Date(updated.date).getTime();
          const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
          const amountVal = updated.amount || 0;

          const matchingPennylaneInvoice = invoices.find(inv => {
            const invDateStr = inv.date;
            if (!invDateStr) return false;
            const invDate = new Date(invDateStr);
            
            const invAmount = parseFloat(inv.amount || '0');
            if (Math.abs(invAmount - amountVal) > 0.01) return false;
            
            if (Math.abs(invDate.getTime() - targetTime) > threeDaysMs) return false;
            
            return true;
          });

          if (matchingPennylaneInvoice) {
            console.log(`📍 Facture Pennylane correspondante trouvée (ID: ${matchingPennylaneInvoice.id}). Mise à jour du libellé...`);
            
            let cleanLabel = matchingPennylaneInvoice.label || updated.provider;
            // Supprimer le préfixe [PERSO] existant si présent
            cleanLabel = cleanLabel.replace(/^\[PERSO\]\s*/i, '').trim();

            const newLabel = type === 'PERSO' ? `[PERSO] ${cleanLabel}` : cleanLabel;

            const updateRes = await fetch(`${BASE_URL}/supplier_invoices/${matchingPennylaneInvoice.id}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
              },
              body: JSON.stringify({ label: newLabel })
            });

            if (updateRes.ok) {
              console.log(`✅ Libellé mis à jour sur Pennylane : "${newLabel}"`);
            } else {
              const errText = await updateRes.text();
              console.error(`❌ Échec de la mise à jour sur Pennylane : ${errText}`);
            }
          } else {
            console.log(`⚠️ Aucune facture correspondante trouvée sur Pennylane pour le ${updated.date.toLocaleDateString()} (${amountVal} €)`);
          }
        } catch (err: any) {
          console.error('❌ Erreur de synchronisation Pennylane :', err.message);
        }
      })();
    }

    return NextResponse.json({ success: true, invoice: updated });
  } catch (error: any) {
    console.error('Error updating invoice type:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
