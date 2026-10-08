"use client";

import React, { useState, useEffect } from "react";
import { 
  ActivityUniverse, 
  FeelProdInvoice, 
  KineSession, 
  InvoiceStatus,
  KinePaymentStatus
} from "@/types/facturation";
import { 
  INITIAL_FEELPROD_INVOICES, 
  INITIAL_KINE_SESSIONS 
} from "@/lib/facturation-mock";
import { ActivitySwitcher } from "@/components/facturation/activity-switcher";
import { KpiCards } from "@/components/facturation/kpi-cards";
import { AnalyticsCharts } from "@/components/facturation/analytics-charts";
import { FeelProdView } from "@/components/facturation/feelprod-view";
import { KineView } from "@/components/facturation/kine-view";
import { ConsolidatedView } from "@/components/facturation/consolidated-view";
import { ModalNewFeelProd } from "@/components/facturation/modal-new-feelprod";
import { ModalNewKine } from "@/components/facturation/modal-new-kine";
import { ModalPreview } from "@/components/facturation/modal-preview";
import { ModalExport } from "@/components/facturation/modal-export";
import { 
  Download, 
  Plus, 
  Layers, 
  RotateCcw, 
  Sparkles,
  Film,
  Stethoscope
} from "lucide-react";

export default function FacturationPage() {
  const [universe, setUniverse] = useState<ActivityUniverse>("feelprod");
  const [feelprodInvoices, setFeelprodInvoices] = useState<FeelProdInvoice[]>([]);
  const [kineSessions, setKineSessions] = useState<KineSession[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Modals state
  const [isNewFeelProdOpen, setIsNewFeelProdOpen] = useState(false);
  const [isNewKineOpen, setIsNewKineOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<{
    item: FeelProdInvoice | KineSession;
    type: "feelprod" | "kine";
  } | null>(null);

  // Charger depuis le localStorage ou les mocks initiaux
  useEffect(() => {
    try {
      const savedFP = localStorage.getItem("feelprod_invoices_v1");
      const savedKine = localStorage.getItem("kine_sessions_v1");
      const savedUniverse = localStorage.getItem("facturation_universe");

      if (savedFP) {
        setFeelprodInvoices(JSON.parse(savedFP));
      } else {
        setFeelprodInvoices(INITIAL_FEELPROD_INVOICES);
      }

      if (savedKine) {
        setKineSessions(JSON.parse(savedKine));
      } else {
        setKineSessions(INITIAL_KINE_SESSIONS);
      }

      if (savedUniverse && (savedUniverse === "feelprod" || savedUniverse === "kine" || savedUniverse === "consolidated")) {
        setUniverse(savedUniverse as ActivityUniverse);
      }
    } catch (e) {
      setFeelprodInvoices(INITIAL_FEELPROD_INVOICES);
      setKineSessions(INITIAL_KINE_SESSIONS);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Sauvegarder dans localStorage
  const handleSaveFeelProdInvoice = (newInv: FeelProdInvoice) => {
    const updated = [newInv, ...feelprodInvoices];
    setFeelprodInvoices(updated);
    localStorage.setItem("feelprod_invoices_v1", JSON.stringify(updated));
  };

  const handleUpdateFeelProdStatus = (id: string, newStatus: InvoiceStatus) => {
    const updated = feelprodInvoices.map((inv) =>
      inv.id === id ? { ...inv, status: newStatus, remainingDue: newStatus === "paye" ? 0 : inv.remainingDue } : inv
    );
    setFeelprodInvoices(updated);
    localStorage.setItem("feelprod_invoices_v1", JSON.stringify(updated));
  };

  const handleSaveKineSession = (newSession: KineSession) => {
    const updated = [newSession, ...kineSessions];
    setKineSessions(updated);
    localStorage.setItem("kine_sessions_v1", JSON.stringify(updated));
  };

  const handleUpdateKineStatus = (id: string, newStatus: KinePaymentStatus) => {
    const updated = kineSessions.map((s) =>
      s.id === id ? { ...s, paymentStatus: newStatus } : s
    );
    setKineSessions(updated);
    localStorage.setItem("kine_sessions_v1", JSON.stringify(updated));
  };

  const handleUniverseChange = (newUni: ActivityUniverse) => {
    setUniverse(newUni);
    localStorage.setItem("facturation_universe", newUni);
  };

  const handleResetData = () => {
    if (confirm("Réinitialiser les données avec les jeux de démonstration 2026 ?")) {
      setFeelprodInvoices(INITIAL_FEELPROD_INVOICES);
      setKineSessions(INITIAL_KINE_SESSIONS);
      localStorage.removeItem("feelprod_invoices_v1");
      localStorage.removeItem("kine_sessions_v1");
    }
  };

  // Statistiques pour le switcher
  const stats = {
    feelprodCount: feelprodInvoices.length,
    kineCount: kineSessions.length,
    feelprodPending: feelprodInvoices.filter((i) => i.status !== "paye").length,
    kinePending: kineSessions.filter((s) => s.paymentStatus !== "regle").length,
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#FDFBEF] dark:bg-[#1E2A33]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#AE7D5C] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#1E2A33] dark:text-[#FDFBEF]">
            Chargement de l'espace de facturation...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBEF] dark:bg-[#1E2A33] text-[#1E2A33] dark:text-[#FDFBEF] p-4 sm:p-6 lg:p-8 space-y-6 transition-colors duration-300">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1E2A33]/10 dark:border-white/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#AE7D5C]/20 text-[#AE7D5C] uppercase tracking-wider">
              Pilotage Bi-Activité 2026
            </span>
            <span className="text-xs text-slate-400">
              FeelProd SASU & Cabinet Libéral
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-bebas tracking-wide text-slate-900 dark:text-white">
            GESTION & FACTURATION
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
            Interface étanche multi-activités : saisie rapide, suivi analytique et exports comptables standardisés vers Pennylane.
          </p>
        </div>

        {/* Boutons d'action rapides */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-xs cursor-pointer transition-all"
          >
            <Download className="w-4 h-4 text-[#AE7D5C]" />
            <span>Export Compta (CSV / JSON)</span>
          </button>

          {universe === "feelprod" && (
            <button
              onClick={() => setIsNewFeelProdOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0F172A] text-[#E2B357] hover:bg-slate-900 shadow-md cursor-pointer transition-all active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Devis / Facture</span>
            </button>
          )}

          {universe === "kine" && (
            <button
              onClick={() => setIsNewKineOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#064E3B] text-[#34D399] hover:bg-[#064E3B]/90 shadow-md cursor-pointer transition-all active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>Pointer une Séance</span>
            </button>
          )}

          {universe === "consolidated" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsNewFeelProdOpen(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0F172A] text-[#E2B357] hover:bg-slate-900 cursor-pointer shadow-xs"
              >
                <Film className="w-3.5 h-3.5" /> + FeelProd
              </button>
              <button
                onClick={() => setIsNewKineOpen(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-[#064E3B] text-[#34D399] hover:bg-[#064E3B]/90 cursor-pointer shadow-xs"
              >
                <Stethoscope className="w-3.5 h-3.5" /> + Cabinet
              </button>
            </div>
          )}

          <button
            onClick={handleResetData}
            title="Réinitialiser les données par défaut"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. Sélecteur d'univers étanche en haut de page */}
      <ActivitySwitcher
        currentUniverse={universe}
        onUniverseChange={handleUniverseChange}
        stats={stats}
      />

      {/* 2. Indicateurs KPI dynamiques */}
      <KpiCards
        universe={universe}
        feelprodInvoices={feelprodInvoices}
        kineSessions={kineSessions}
      />

      {/* 3. Graphiques d'analyse comparative (Recharts) */}
      <AnalyticsCharts universe={universe} />

      {/* 4. Vue Spécifique selon l'univers sélectionné */}
      <div className="pt-2">
        {universe === "feelprod" && (
          <FeelProdView
            invoices={feelprodInvoices}
            onOpenNewInvoiceModal={() => setIsNewFeelProdOpen(true)}
            onUpdateInvoiceStatus={handleUpdateFeelProdStatus}
            onSelectInvoiceForPreview={(inv) =>
              setPreviewItem({ item: inv, type: "feelprod" })
            }
          />
        )}

        {universe === "kine" && (
          <KineView
            sessions={kineSessions}
            onOpenNewSessionModal={() => setIsNewKineOpen(true)}
            onUpdateSessionStatus={handleUpdateKineStatus}
            onSelectSessionForReceipt={(session) =>
              setPreviewItem({ item: session, type: "kine" })
            }
          />
        )}

        {universe === "consolidated" && (
          <ConsolidatedView
            feelprodInvoices={feelprodInvoices}
            kineSessions={kineSessions}
            onOpenExportModal={() => setIsExportOpen(true)}
          />
        )}
      </div>

      {/* Modales */}
      <ModalNewFeelProd
        isOpen={isNewFeelProdOpen}
        onClose={() => setIsNewFeelProdOpen(false)}
        onSave={handleSaveFeelProdInvoice}
      />

      <ModalNewKine
        isOpen={isNewKineOpen}
        onClose={() => setIsNewKineOpen(false)}
        onSave={handleSaveKineSession}
      />

      <ModalPreview
        isOpen={previewItem !== null}
        onClose={() => setPreviewItem(null)}
        item={previewItem?.item || null}
        type={previewItem?.type || "feelprod"}
      />

      <ModalExport
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        feelprodInvoices={feelprodInvoices}
        kineSessions={kineSessions}
      />
    </div>
  );
}
