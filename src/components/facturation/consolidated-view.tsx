"use client";

import React from "react";
import { 
  BarChart3, 
  Film, 
  Stethoscope, 
  ArrowUpRight, 
  ShieldCheck, 
  Layers, 
  FileSpreadsheet,
  Download,
  Calendar
} from "lucide-react";
import { FeelProdInvoice, KineSession } from "@/types/facturation";

interface ConsolidatedViewProps {
  feelprodInvoices: FeelProdInvoice[];
  kineSessions: KineSession[];
  onOpenExportModal: () => void;
}

export function ConsolidatedView({
  feelprodInvoices,
  kineSessions,
  onOpenExportModal,
}: ConsolidatedViewProps) {
  // Agrégation chronologique des 10 dernières opérations (FeelProd + Cabinet)
  const unifiedOperations = [
    ...feelprodInvoices.map((inv) => ({
      id: inv.id,
      activity: "feelprod" as const,
      number: inv.number,
      date: inv.date,
      title: inv.clientName,
      subtitle: inv.projectTitle,
      amount: inv.totalTTC,
      status: inv.status === "paye" ? "Réglé" : "En attente",
      isPending: inv.status !== "paye",
      account: "706000",
    })),
    ...kineSessions.map((s) => ({
      id: s.id,
      activity: "kine" as const,
      number: s.number,
      date: s.date,
      title: s.patientName,
      subtitle: s.actLabel,
      amount: s.totalAmount,
      status: s.paymentStatus === "regle" ? "Encaissé" : "Différé",
      isPending: s.paymentStatus !== "regle",
      account: "705000",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const formatEuro = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Synthèse comparative des deux activités */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Carte FeelProd */}
        <div className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] text-white p-5 rounded-2xl border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#E2B357] text-[#0F172A]">
                <Film className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">FeelProd</h4>
                <p className="text-xs text-slate-300">Production Audiovisuelle</p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E2B357]/20 text-[#E2B357] border border-[#E2B357]/30">
              TVA 20%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 my-4 pt-2 border-t border-white/10">
            <div>
              <span className="text-[11px] text-slate-400">Total Facturé 2026</span>
              <p className="text-xl font-bold text-white mt-0.5">37 270 € HT</p>
              <span className="text-[10px] text-slate-400">44 724 € TTC</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400">Compte Général</span>
              <p className="text-sm font-semibold text-[#E2B357] mt-1 font-mono">706000 (Prestations)</p>
              <span className="text-[10px] text-slate-400">TVA : 445710</span>
            </div>
          </div>

          <div className="text-xs text-slate-300 bg-white/5 p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
            <span>Règlements reçus sur compte LCL Pro (6300E)</span>
            <span className="text-emerald-400 font-semibold">92% encaissé</span>
          </div>
        </div>

        {/* Carte Cabinet */}
        <div className="bg-gradient-to-br from-[#064E3B] to-[#047857] text-white p-5 rounded-2xl border border-emerald-900 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#34D399] text-[#064E3B]">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Cabinet Kiné / Thérapie</h4>
                <p className="text-xs text-emerald-100">Soins manuels & Ostéopathie</p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-300/20 text-emerald-300 border border-emerald-300/30">
              Exonéré TVA
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 my-4 pt-2 border-t border-white/10">
            <div>
              <span className="text-[11px] text-emerald-200">Recettes 2026 Cumul</span>
              <p className="text-xl font-bold text-white mt-0.5">35 800 €</p>
              <span className="text-[10px] text-emerald-200">Art. 261-4-1° CGI</span>
            </div>
            <div>
              <span className="text-[11px] text-emerald-200">Compte Général</span>
              <p className="text-sm font-semibold text-emerald-300 mt-1 font-mono">705000 (Honoraires)</p>
              <span className="text-[10px] text-emerald-200">TVA : 0%</span>
            </div>
          </div>

          <div className="text-xs text-emerald-100 bg-white/10 p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
            <span>Encaissements immédiats (CB / Chèques / Espèces)</span>
            <span className="text-emerald-200 font-semibold">97% encaissé</span>
          </div>
        </div>
      </div>

      {/* Flux Récent Unifié */}
      <div className="bg-white dark:bg-[#151D24] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">
              Flux Chronologique Unifié
            </h4>
            <p className="text-xs text-slate-400">
              Toutes opérations récentes des deux univers
            </p>
          </div>
          <button
            onClick={onOpenExportModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#AE7D5C] text-white hover:bg-[#AE7D5C]/90 shadow-xs cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter Compta (CSV / JSON)</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Activité</th>
                <th className="py-2.5 px-4">N° Pièce</th>
                <th className="py-2.5 px-4">Client / Patient</th>
                <th className="py-2.5 px-4">Prestation / Acte</th>
                <th className="py-2.5 px-4">Compte Compta</th>
                <th className="py-2.5 px-4 text-right">Montant</th>
                <th className="py-2.5 px-4 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {unifiedOperations.slice(0, 12).map((op) => (
                <tr key={`${op.activity}-${op.id}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                    {op.date}
                  </td>
                  <td className="py-2.5 px-4">
                    {op.activity === "feelprod" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#0F172A] text-[#E2B357]">
                        <Film className="w-2.5 h-2.5" /> FeelProd
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#064E3B] text-[#34D399]">
                        <Stethoscope className="w-2.5 h-2.5" /> Cabinet
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-mono font-medium text-slate-900 dark:text-white">
                    {op.number}
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                    {op.title}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 truncate max-w-xs">
                    {op.subtitle}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                    {op.account}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatEuro(op.amount)}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        op.isPending
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                      }`}
                    >
                      {op.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
