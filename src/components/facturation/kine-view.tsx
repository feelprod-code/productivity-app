"use client";

import React, { useState, useMemo } from "react";
import { 
  Search, 
  Plus, 
  Stethoscope, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  CreditCard, 
  Banknote, 
  ArrowRightLeft,
  FileCheck2,
  Eye,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Inbox,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { KineSession, KinePaymentStatus, KinePaymentMethod } from "@/types/facturation";
import { cn } from "@/lib/utils";

interface KineViewProps {
  sessions: KineSession[];
  onOpenNewSessionModal: () => void;
  onUpdateSessionStatus: (id: string, newStatus: KinePaymentStatus) => void;
  onSelectSessionForReceipt: (session: KineSession) => void;
}

export function KineView({
  sessions,
  onOpenNewSessionModal,
  onUpdateSessionStatus,
  onSelectSessionForReceipt,
}: KineViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showSupplierHelper, setShowSupplierHelper] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const supplierEmailTemplate = `Madame, Monsieur,

Dans le cadre de la gestion comptable et de la facturation électronique de mon cabinet, merci d'adresser vos factures à :

Guillaume PHILIPPE • Masseur-Kinésithérapeute D.E.
Cabinet Via Sana • 28 bis boulevard Sébastopol, 75004 Paris
Identifiants : RPPS 10005682603 • ADELI 757068309 • CDOMK 75 : 52508
Plateforme de réception électronique : Pennylane
Compte de règlement : LCL Compte Professionnel (6300E)

Bien cordialement,
Guillaume PHILIPPE`;

  const handleCopySupplierMessage = () => {
    navigator.clipboard.writeText(supplierEmailTemplate);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2500);
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesSearch =
        s.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.actLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.number.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (filterType === "all") return true;
      if (filterType === "hn") return s.actType === "hors_nomenclature";
      if (filterType === "conv") return s.actType === "conventionne";
      if (filterType === "pending") return s.paymentStatus !== "regle";
      return true;
    });
  }, [sessions, searchTerm, filterType]);

  const getPaymentMethodBadge = (method: KinePaymentMethod) => {
    switch (method) {
      case "cb":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <CreditCard className="w-3.5 h-3.5 text-sky-500" /> CB
          </span>
        );
      case "cheque":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <FileCheck2 className="w-3.5 h-3.5 text-amber-500" /> Chèque
          </span>
        );
      case "especes":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Espèces
          </span>
        );
      case "virement":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-500" /> Virement
          </span>
        );
      default:
        return <span className="text-[11px] text-slate-400">En attente</span>;
    }
  };

  const getStatusBadge = (status: KinePaymentStatus, session: KineSession) => {
    switch (status) {
      case "regle":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> Encaissé
          </span>
        );
      case "differe":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400" title={`Dépôt prévu : ${session.deferredDepositDate}`}>
            <Clock className="w-3 h-3" /> Différé ({session.deferredDepositDate ? session.deferredDepositDate.slice(5) : "fin de mois"})
          </span>
        );
      case "en_attente":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400">
            <AlertCircle className="w-3 h-3" /> En attente
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
      {/* Bandeau d'assistance Réception Fournisseurs Kiné (Pennylane PDP) */}
      <div className="bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/30 dark:to-teal-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#064E3B] text-[#34D399]">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                  Réception Factures Fournisseurs Kiné (Pennylane PDP)
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/60 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-300">
                  LCL Pro 6300E Connecté
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Vos fournisseurs professionnels (matériel, consommables, CPO, assurances) sont automatiquement routés vers votre Pennylane.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <a
              href="https://app.pennylane.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#064E3B] dark:text-[#34D399]" />
              <span>Ouvrir Pennylane</span>
            </a>
            <button
              onClick={() => setShowSupplierHelper(!showSupplierHelper)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#064E3B] text-[#34D399] hover:bg-[#064E3B]/90 cursor-pointer transition-colors"
            >
              <span>{showSupplierHelper ? "Masquer" : "Consignes Fournisseurs"}</span>
              {showSupplierHelper ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Contenu déroulant avec modèle copiable */}
        {showSupplierHelper && (
          <div className="mt-4 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/40 space-y-3 animate-in fade-in duration-150">
            <div className="text-[11.5px] text-slate-700 dark:text-slate-300 leading-relaxed">
              Pour que vos fournisseurs (vendeurs de matériel de kiné, consommables médicaux, table, assurances, etc.) vous transmettent leurs factures sans friction, transmettez-leur ce message type :
            </div>

            <div className="relative bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono text-slate-800 dark:text-slate-200 whitespace-pre-line shadow-xs">
              {supplierEmailTemplate}
              <button
                onClick={handleCopySupplierMessage}
                className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-sans font-semibold hover:bg-emerald-200 cursor-pointer transition-colors"
              >
                {copiedMessage ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Copié !</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Copier le texte</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Barre de recherche et filtres rapides */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#151D24] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher patient, acte, N°..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#34D399]/60"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs">
            <button
              onClick={() => setFilterType("all")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                filterType === "all"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              Tous ({sessions.length})
            </button>
            <button
              onClick={() => setFilterType("hn")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                filterType === "hn"
                  ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              Hors Nomenclature (HN)
            </button>
            <button
              onClick={() => setFilterType("conv")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                filterType === "conv"
                  ? "bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              Conventionné
            </button>
            <button
              onClick={() => setFilterType("pending")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                filterType === "pending"
                  ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              À Encaisser
            </button>
          </div>

          <button
            onClick={onOpenNewSessionModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#064E3B] text-[#34D399] hover:bg-[#064E3B]/90 shadow-sm transition-all duration-200 cursor-pointer ml-auto sm:ml-0 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Pointer une Séance</span>
          </button>
        </div>
      </div>

      {/* Tableau des séances Cabinet */}
      <div className="bg-white dark:bg-[#151D24] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Date & N°</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Typologie & Acte</th>
                <th className="py-3 px-4">TVA / Régime</th>
                <th className="py-3 px-4">Mode de Paiement</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-center">Reçu / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredSessions.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-emerald-50/40 dark:hover:bg-slate-800/40 transition-colors group"
                >
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {s.date}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {s.number}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {s.patientName}
                    </div>
                    {s.patientPhone && (
                      <div className="text-[10px] text-slate-400">
                        {s.patientPhone}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {s.actType === "hors_nomenclature" ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                          Hors Nomenclature (HN)
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                          Conventionné
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {s.actLabel}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Exonéré (0%)
                    </div>
                    <div className="text-[9.5px] text-slate-400 italic">
                      Art. 261-4-1° CGI
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {getPaymentMethodBadge(s.paymentMethod)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white text-sm">
                    {formatEuro(s.totalAmount)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getStatusBadge(s.paymentStatus, s)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onSelectSessionForReceipt(s)}
                        title="Voir la note d'honoraires (Mutuelle)"
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Note d'honoraires</span>
                      </button>
                      {s.paymentStatus !== "regle" && (
                        <button
                          onClick={() => onUpdateSessionStatus(s.id, "regle")}
                          title="Marquer comme encaissé"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
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
