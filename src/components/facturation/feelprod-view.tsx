"use client";

import React, { useState, useMemo } from "react";
import { 
  Search, 
  Plus, 
  Film, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText,
  Building2,
  Euro,
  Download,
  Eye,
  Trash2
} from "lucide-react";
import { FeelProdInvoice, InvoiceStatus } from "@/types/facturation";
import { cn } from "@/lib/utils";

interface FeelProdViewProps {
  invoices: FeelProdInvoice[];
  onOpenNewInvoiceModal: () => void;
  onUpdateInvoiceStatus: (id: string, newStatus: InvoiceStatus) => void;
  onSelectInvoiceForPreview: (invoice: FeelProdInvoice) => void;
}

export function FeelProdView({
  invoices,
  onOpenNewInvoiceModal,
  onUpdateInvoiceStatus,
  onSelectInvoiceForPreview,
}: FeelProdViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.projectTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.number.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return inv.status !== "paye";
      return inv.status === statusFilter;
    });
  }, [invoices, searchTerm, statusFilter]);

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case "paye":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> Réglé
          </span>
        );
      case "partiel":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400">
            <Clock className="w-3 h-3" /> Acompte reçu
          </span>
        );
      case "facture":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
            <Clock className="w-3 h-3" /> Émise (En attente)
          </span>
        );
      case "devis_accepte":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400">
            <CheckCircle2 className="w-3 h-3" /> Devis accepté
          </span>
        );
      case "devis_envoye":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            <FileText className="w-3 h-3" /> Devis envoyé
          </span>
        );
      case "en_retard":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400">
            <AlertCircle className="w-3 h-3" /> En retard
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            Brouillon
          </span>
        );
    }
  };

  const formatEuro = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      {/* Barre d'outils et filtres */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#151D24] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher client, projet, N°..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E2B357]/60"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                statusFilter === "all"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              Tous ({invoices.length})
            </button>
            <button
              onClick={() => setStatusFilter("pending")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                statusFilter === "pending"
                  ? "bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              En attente
            </button>
            <button
              onClick={() => setStatusFilter("paye")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                statusFilter === "paye"
                  ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              Réglés
            </button>
          </div>

          <button
            onClick={onOpenNewInvoiceModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#0F172A] text-[#E2B357] hover:bg-slate-800 shadow-sm transition-all duration-200 cursor-pointer ml-auto sm:ml-0 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Devis / Facture</span>
          </button>
        </div>
      </div>

      {/* Tableau des prestations FeelProd */}
      <div className="bg-white dark:bg-[#151D24] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">N° & Date</th>
                <th className="py-3 px-4">Client & Projet</th>
                <th className="py-3 px-4">Prestations Clés</th>
                <th className="py-3 px-4 text-right">Total HT</th>
                <th className="py-3 px-4 text-right">TVA (20%)</th>
                <th className="py-3 px-4 text-right">Total TTC</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Reste Dû</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="hover:bg-amber-50/40 dark:hover:bg-slate-800/40 transition-colors group"
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {inv.number}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {inv.date}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {inv.clientName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                      {inv.projectTitle}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {inv.items.map((it) => (
                        <span
                          key={it.id}
                          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400"
                        >
                          {it.type === "tjm_tournage" && `Tournage ${it.quantity}j`}
                          {it.type === "tjm_realisation" && `Réal. ${it.quantity}j`}
                          {it.type === "tjm_drone" && `Drone ${it.quantity}j`}
                          {it.type === "forfait_montage" && "Montage"}
                          {it.type === "forfait_etalonnage" && "Étalonnage"}
                          {it.type === "materiel" && "Matériel"}
                          {it.type === "deplacement_km" && "Déplacement"}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-medium">
                    {formatEuro(inv.totalHT)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-500">
                    {formatEuro(inv.vatAmount)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatEuro(inv.totalTTC)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getStatusBadge(inv.status)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold">
                    {inv.remainingDue > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {formatEuro(inv.remainingDue)}
                      </span>
                    ) : (
                      <span className="text-emerald-600 text-[11px] font-medium">
                        Soldé (0 €)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onSelectInvoiceForPreview(inv)}
                        title="Aperçu rapide"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {inv.status !== "paye" && (
                        <button
                          onClick={() => onUpdateInvoiceStatus(inv.id, "paye")}
                          title="Marquer comme payé"
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
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
