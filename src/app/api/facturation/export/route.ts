import { NextRequest, NextResponse } from "next/server";
import { INITIAL_FEELPROD_INVOICES, INITIAL_KINE_SESSIONS } from "@/lib/facturation-mock";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") || "all"; // 'all' | 'feelprod' | 'kine'
  const format = searchParams.get("format") || "json"; // 'json' | 'csv'
  const period = searchParams.get("period") || "year"; // 'month' | 'quarter' | 'year'

  let fpList = scope === "kine" ? [] : INITIAL_FEELPROD_INVOICES;
  let kineList = scope === "feelprod" ? [] : INITIAL_KINE_SESSIONS;

  if (period === "month") {
    fpList = fpList.filter((i) => i.date.startsWith("2026-09"));
    kineList = kineList.filter((s) => s.date.startsWith("2026-09"));
  }

  const rows = [
    ...fpList.map((i) => ({
      date: i.date,
      number: i.number,
      activity: "FeelProd",
      thirdParty: i.clientName,
      label: i.projectTitle,
      amountHT: i.totalHT,
      vatRate: 0.2,
      vatAmount: i.vatAmount,
      amountTTC: i.totalTTC,
      account: i.accountingAccount,
      paymentMethod: "Virement",
      status: i.status === "paye" ? "Payé" : "En attente",
    })),
    ...kineList.map((s) => ({
      date: s.date,
      number: s.number,
      activity: "Cabinet Kiné",
      thirdParty: s.patientName,
      label: s.actLabel,
      amountHT: s.totalAmount,
      vatRate: 0,
      vatAmount: 0,
      amountTTC: s.totalAmount,
      account: s.accountingAccount,
      paymentMethod: s.paymentMethod.toUpperCase(),
      status: s.paymentStatus === "regle" ? "Encaissé" : "Différé",
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (format === "csv") {
    const headers = [
      "Date",
      "Numéro Pièce",
      "Activité",
      "Tiers (Client/Patient)",
      "Libellé Écriture",
      "Montant HT (€)",
      "Taux TVA",
      "Montant TVA (€)",
      "Montant TTC (€)",
      "Compte Comptable",
      "Mode Règlement",
      "Statut",
    ];

    const csvRows = rows.map((r) =>
      [
        r.date,
        r.number,
        r.activity,
        `"${r.thirdParty.replace(/"/g, '""')}"`,
        `"${r.label.replace(/"/g, '""')}"`,
        r.amountHT.toFixed(2),
        (r.vatRate * 100).toFixed(1) + "%",
        r.vatAmount.toFixed(2),
        r.amountTTC.toFixed(2),
        r.account,
        r.paymentMethod,
        r.status,
      ].join(";")
    );

    const csvContent = "\uFEFF" + [headers.join(";"), ...csvRows].join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-compta-${scope}-${period}.csv"`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    totalRecords: rows.length,
    period,
    scope,
    data: rows,
  });
}
