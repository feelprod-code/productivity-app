"use client";

import React, { useState } from "react";
import { 
  X, 
  Download, 
  FileSpreadsheet, 
  FileCode2, 
  Check, 
  Copy, 
  Sparkles, 
  ExternalLink,
  ShieldCheck
} from "lucide-react";
import { FeelProdInvoice, KineSession, ActivityUniverse } from "@/types/facturation";

interface ModalExportProps {
  isOpen: boolean;
  onClose: () => void;
  feelprodInvoices: FeelProdInvoice[];
  kineSessions: KineSession[];
}

export function ModalExport({
  isOpen,
  onClose,
  feelprodInvoices,
  kineSessions,
}: ModalExportProps) {
  const [targetScope, setTargetScope] = useState<"all" | "feelprod" | "kine">("all");
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("year");
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Colonnes paramétrables
  const [columns, setColumns] = useState({
    date: true,
    number: true,
    activity: true,
    thirdParty: true, // Client / Patient
    label: true,
    amountHT: true,
    vatRate: true,
    vatAmount: true,
    amountTTC: true,
    account: true, // 706000 ou 705000
    paymentMethod: true,
    status: true,
  });

  if (!isOpen) return null;

  const toggleColumn = (col: keyof typeof columns) => {
    setColumns({ ...columns, [col]: !columns[col] });
  };

  const handleCopyWebhook = () => {
    const webhookUrl = `${window.location.origin}/api/facturation/export?format=json&key=feelprod_secret_2026`;
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleDownload = () => {
    // 1. Filtrer les données selon le scope et la période
    let fpList = targetScope === "kine" ? [] : feelprodInvoices;
    let kineList = targetScope === "feelprod" ? [] : kineSessions;

    if (period === "month") {
      fpList = fpList.filter((i) => i.date.startsWith("2026-09"));
      kineList = kineList.filter((s) => s.date.startsWith("2026-09"));
    } else if (period === "quarter") {
      fpList = fpList.filter((i) => i.date >= "2026-07-01" && i.date <= "2026-09-30");
      kineList = kineList.filter((s) => s.date >= "2026-07-01" && s.date <= "2026-09-30");
    }

    // Aplatir en lignes comptables unifiées
    const rows: any[] = [
      ...fpList.map((i) => ({
        date: i.date,
        number: i.number,
        activity: "FeelProd",
        thirdParty: i.clientName,
        label: i.projectTitle,
        amountHT: i.totalHT.toFixed(2),
        vatRate: "20.0%",
        vatAmount: i.vatAmount.toFixed(2),
        amountTTC: i.totalTTC.toFixed(2),
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
        amountHT: s.totalAmount.toFixed(2),
        vatRate: "0.0% (Exonéré)",
        vatAmount: "0.00",
        amountTTC: s.totalAmount.toFixed(2),
        account: s.accountingAccount,
        paymentMethod: s.paymentMethod.toUpperCase(),
        status: s.paymentStatus === "regle" ? "Encaissé" : "Différé",
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (exportFormat === "json") {
      // Export JSON
      const jsonStr = JSON.stringify(rows, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `export-compta-${targetScope}-${period}-2026.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      // Export CSV (Format Pennylane standard, séparateur point-virgule)
      const headersMap: Record<keyof typeof columns, string> = {
        date: "Date",
        number: "Numéro Pièce",
        activity: "Activité",
        thirdParty: "Tiers (Client/Patient)",
        label: "Libellé Écriture",
        amountHT: "Montant HT (€)",
        vatRate: "Taux TVA",
        vatAmount: "Montant TVA (€)",
        amountTTC: "Montant TTC (€)",
        account: "Compte Comptable",
        paymentMethod: "Mode Règlement",
        status: "Statut",
      };

      const activeKeys = (Object.keys(columns) as (keyof typeof columns)[]).filter(
        (k) => columns[k]
      );

      const headerRow = activeKeys.map((k) => `"${headersMap[k]}"`).join(";");
      const dataRows = rows.map((r) =>
        activeKeys.map((k) => `"${String(r[k] || "").replace(/"/g, '""')}"`).join(";")
      );

      // Ajouter le BOM UTF-8 (\uFEFF) pour compatibilité parfaite Excel / Pennylane
      const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `export-pennylane-${targetScope}-${period}-2026.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#151D24] w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 text-xs">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#AE7D5C] text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Export Comptable & Interfaçage (Pennylane / Zapier)
              </h3>
              <p className="text-xs text-slate-400">
                Génération des écritures standardisées et intégration automatisée
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps du modal */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 dark:text-slate-300">
          {/* Sélection Périmètre & Activité */}
          <div>
            <label className="block font-bold text-slate-900 dark:text-white mb-2">
              1. Sélection de l'activité
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTargetScope("all")}
                className={`py-2 px-3 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                  targetScope === "all"
                    ? "bg-[#AE7D5C] text-white border-[#AE7D5C]"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                }`}
              >
                Toutes (Consolidé)
              </button>
              <button
                type="button"
                onClick={() => setTargetScope("feelprod")}
                className={`py-2 px-3 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                  targetScope === "feelprod"
                    ? "bg-[#0F172A] text-[#E2B357] border-[#0F172A]"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                }`}
              >
                FeelProd Seul (706000)
              </button>
              <button
                type="button"
                onClick={() => setTargetScope("kine")}
                className={`py-2 px-3 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                  targetScope === "kine"
                    ? "bg-[#064E3B] text-[#34D399] border-[#064E3B]"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                }`}
              >
                Cabinet Kiné (705000)
              </button>
            </div>
          </div>

          {/* Sélection de la Période */}
          <div>
            <label className="block font-bold text-slate-900 dark:text-white mb-2">
              2. Période comptable
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPeriod("month")}
                className={`py-2 px-3 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                  period === "month"
                    ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-700"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                Mois en cours (Sept. 2026)
              </button>
              <button
                type="button"
                onClick={() => setPeriod("quarter")}
                className={`py-2 px-3 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                  period === "quarter"
                    ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-700"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                3e Trimestre 2026 (T3)
              </button>
              <button
                type="button"
                onClick={() => setPeriod("year")}
                className={`py-2 px-3 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                  period === "year"
                    ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-700"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                Année 2026 Complète
              </button>
            </div>
          </div>

          {/* Format d'Export */}
          <div>
            <label className="block font-bold text-slate-900 dark:text-white mb-2">
              3. Format du fichier
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setExportFormat("csv")}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center gap-3 ${
                  exportFormat === "csv"
                    ? "bg-amber-50/60 dark:bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/20"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                <FileSpreadsheet className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">CSV Pennylane Standard</div>
                  <div className="text-[10px] text-slate-500">Séparateur ';' • UTF-8 BOM • Prêt à l'import</div>
                </div>
              </div>

              <div
                onClick={() => setExportFormat("json")}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center gap-3 ${
                  exportFormat === "json"
                    ? "bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                <FileCode2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">JSON Structuré</div>
                  <div className="text-[10px] text-slate-500">Pour intégration API, Make ou Zapier</div>
                </div>
              </div>
            </div>
          </div>

          {/* Colonnes Paramétrables */}
          <div className="border border-slate-200 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
            <label className="block font-bold text-slate-900 dark:text-white mb-2">
              4. Colonnes incluses dans l'export
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.keys(columns).map((col) => (
                <label
                  key={col}
                  className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={columns[col as keyof typeof columns]}
                    onChange={() => toggleColumn(col as keyof typeof columns)}
                    className="rounded text-[#AE7D5C] focus:ring-[#AE7D5C]"
                  />
                  <span className="capitalize">
                    {col === "thirdParty" ? "Tiers (Client/Patient)" : col}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Section Webhook & Automatisation */}
          <div className="bg-slate-100 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Webhook de Synchronisation
              </span>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                Endpoint d'export direct pour automatiser avec Zapier ou Make
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyWebhook}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 cursor-pointer shrink-0"
            >
              {copiedWebhook ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copier l'URL</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Conforme comptes généraux 706000 & 705000
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold bg-[#AE7D5C] text-white hover:bg-[#AE7D5C]/90 shadow-md cursor-pointer transition-transform active:scale-98"
            >
              <Download className="w-4 h-4" />
              <span>Télécharger l'Export ({exportFormat.toUpperCase()})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
