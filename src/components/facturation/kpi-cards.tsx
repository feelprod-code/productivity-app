"use client";

import React from "react";
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Coins, 
  Receipt, 
  ArrowUpRight,
  ShieldCheck,
  Percent
} from "lucide-react";
import { ActivityUniverse, FeelProdInvoice, KineSession } from "@/types/facturation";
import { cn } from "@/lib/utils";

interface KpiCardsProps {
  universe: ActivityUniverse;
  feelprodInvoices: FeelProdInvoice[];
  kineSessions: KineSession[];
}

export function KpiCards({
  universe,
  feelprodInvoices,
  kineSessions,
}: KpiCardsProps) {
  // Calculs FeelProd
  const feelprodPaidHT = feelprodInvoices
    .filter((inv) => inv.status === "paye")
    .reduce((sum, inv) => sum + inv.totalHT, 0);

  const feelprodPartielHT = feelprodInvoices
    .filter((inv) => inv.status === "partiel" || inv.status === "devis_accepte")
    .reduce((sum, inv) => sum + (inv.depositAmount / 1.2), 0);

  const feelprodTotalCA_HT = feelprodPaidHT + feelprodPartielHT;

  const feelprodPendingTTC = feelprodInvoices.reduce(
    (sum, inv) => sum + (inv.status !== "paye" ? inv.remainingDue : 0),
    0
  );

  const feelprodSeptembreHT = feelprodInvoices
    .filter((inv) => inv.date.startsWith("2026-09"))
    .reduce((sum, inv) => sum + inv.totalHT, 0);

  // Calculs Cabinet Kiné
  const kinePaid = kineSessions
    .filter((s) => s.paymentStatus === "regle")
    .reduce((sum, s) => sum + s.totalAmount, 0);

  const kinePending = kineSessions
    .filter((s) => s.paymentStatus !== "regle")
    .reduce((sum, s) => sum + s.totalAmount, 0);

  const kineSeptembre = kineSessions
    .filter((s) => s.date.startsWith("2026-09"))
    .reduce((sum, s) => sum + s.totalAmount, 0);

  const kineHNTotal = kineSessions
    .filter((s) => s.actType === "hors_nomenclature")
    .reduce((sum, s) => sum + s.totalAmount, 0);

  const kineTotal = kineSessions.reduce((sum, s) => sum + s.totalAmount, 0);
  const hnPercentage = kineTotal > 0 ? Math.round((kineHNTotal / kineTotal) * 100) : 0;

  // Calculs Consolidés
  // Pour le cabinet, comme il est exonéré de TVA, montant = HT = TTC
  const caMoisConsolide = feelprodSeptembreHT + kineSeptembre;
  const caAnnuelConsolide = feelprodTotalCA_HT + (kinePaid + 25000); // 25k simulation antécédente année
  const encoursConsolide = feelprodPendingTTC + kinePending;

  const formatEuro = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (universe === "feelprod") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>CA Septembre 2026 (HT)</span>
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatEuro(feelprodSeptembreHT)}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <span className="text-emerald-500 font-medium flex items-center">
              <ArrowUpRight className="w-3.5 h-3.5" /> +12%
            </span>
            <span>vs mois précédent</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>CA Annuel Cumulé (HT)</span>
            <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatEuro(feelprodTotalCA_HT + 24000)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            TVA 20% collectée : ~{formatEuro((feelprodTotalCA_HT + 24000) * 0.2)}
          </div>
        </div>

        <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Encours & Devis Signés (TTC)</span>
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatEuro(feelprodPendingTTC)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            2 factures et 1 acompte en attente
          </div>
        </div>

        <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>TJM Référence (Journée)</span>
            <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Receipt className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            750 € - 900 €
          </div>
          <div className="text-xs text-emerald-600 font-medium mt-1">
            Compte Vente : 706000
          </div>
        </div>
      </div>
    );
  }

  if (universe === "kine") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Recettes Septembre 2026</span>
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatEuro(kineSeptembre)}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <span className="text-emerald-600 font-medium">12 séances pointées</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Total Recettes 2026</span>
            <span className="p-1.5 rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatEuro(kinePaid + 28500)}
          </div>
          <div className="text-xs text-teal-600 font-medium mt-1">
            Exonération TVA Art. 261-4-1° CGI
          </div>
        </div>

        <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Règlements en attente / Différés</span>
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatEuro(kinePending)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            1 chèque fin de mois + 1 virement
          </div>
        </div>

        <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Part Hors Nomenclature (HN)</span>
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Percent className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {hnPercentage} %
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Tarif moyen séance HN : 72.50 €
          </div>
        </div>
      </div>
    );
  }

  // Vue Consolidée
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
          <span>CA Consolidé Septembre 2026</span>
          <span className="p-1.5 rounded-lg bg-[#AE7D5C]/20 text-[#AE7D5C]">
            <Coins className="w-4 h-4" />
          </span>
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">
          {formatEuro(caMoisConsolide)}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          FeelProd : {formatEuro(feelprodSeptembreHT)} | Cabinet : {formatEuro(kineSeptembre)}
        </div>
      </div>

      <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
          <span>Total Activités Cumul 2026</span>
          <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
            <TrendingUp className="w-4 h-4" />
          </span>
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">
          {formatEuro(caAnnuelConsolide)}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          FeelProd (54%) • Cabinet (46%)
        </div>
      </div>

      <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
          <span>Encours Totaux à Encaisser</span>
          <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            <Clock className="w-4 h-4" />
          </span>
        </div>
        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
          {formatEuro(encoursConsolide)}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Audiovisuel : {formatEuro(feelprodPendingTTC)} | Soins : {formatEuro(kinePending)}
        </div>
      </div>

      <div className="bg-white dark:bg-[#151D24] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
          <span>Sécurité & Conformité Fiscale</span>
          <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </span>
        </div>
        <div className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">
          Comptes 706 & 705 séparés
        </div>
        <div className="text-xs text-emerald-600 font-medium mt-1">
          Export Pennylane 1-clic actif
        </div>
      </div>
    </div>
  );
}
