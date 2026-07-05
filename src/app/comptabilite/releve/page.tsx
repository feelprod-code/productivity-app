"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  Bot,
  ReceiptEuro,
  FileText,
  Sparkles,
  RefreshCcw,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  CheckCircle,
  AlertCircle,
  Building2,
  User2,
  Calendar,
  Layers,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Upload,
  Download,
  ExternalLink,
  Loader2,
  Wallet,
  BadgeCheck
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Transaction {
  id: number;
  date: string;
  label: string;
  amount: number;
  absAmount: number;
  isOutflow: boolean;
  category: "card" | "direct_debit" | "transfer" | "other";
  isProAccount: boolean;
  isPro: boolean;
  noJustificatif?: boolean;
  bankAccountName: string;
  productDescription?: string | null;
  matchedInvoice?: {
    id: number;
    date: string;
    label: string;
    filename: string;
    publicFileUrl: string;
    invoiceLines?: Array<{ label: string; amount: number }>;
  } | null;
}

interface BankAccount {
  name: string;
  isPro: boolean;
  balance: number;
}

interface MonthGroup {
  key: string;
  label: string;
  transactions: Transaction[];
  inflows: number;
  outflows: number;
  net: number;
  matchedCount: number;
  totalOutflowCount: number;
  matchingRate: number;
}

const formatAmount = (num: number) => {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(num);
};

const getCategoryBadge = (category: string) => {
  switch (category) {
    case "card":
      return { label: "Carte", icon: <CreditCard className="w-3.5 h-3.5 text-[#AE7D5C]" /> };
    case "direct_debit":
      return { label: "Prélèvement", icon: <Bot className="w-3.5 h-3.5 text-[#1E2A33]" /> };
    case "transfer":
      return { label: "Virement", icon: <ReceiptEuro className="w-3.5 h-3.5 text-blue-600" /> };
    default:
      return { label: "Autre", icon: <Layers className="w-3.5 h-3.5 text-gray-500" /> };
  }
};

function cleanDisplayLabel(label: string): string {
  const lower = label.toLowerCase();

  // Remplacement immédiat par le fournisseur propre
  if (lower.includes("sumup")) return "SUM UP";
  if (lower.includes("amazon")) return "AMAZON";
  if (lower.includes("gandi")) return "GANDI";
  if (lower.includes("apple")) return "APPLE";
  if (lower.includes("doctolib")) return "DOCTOLIB";
  if (lower.includes("chargemap")) return "CHARGEMAP";
  if (lower.includes("freebox")) return "FREEBOX";
  if (lower.includes("google")) return "GOOGLE";
  if (lower.includes("paypal")) return "PAYPAL";
  if (lower.includes("cloudflare")) return "CLOUDFLARE";
  if (lower.includes("spotify")) return "SPOTIFY";
  if (lower.includes("canva")) return "CANVA";
  if (lower.includes("soundcloud")) return "SOUNDCLOUD";
  if (lower.includes("gocardless") || lower.includes("viasana")) return "VIASANA";
  if (lower.includes("lcl") || lower.includes("telelion")) return "LCL";
  if (lower.includes("bouygues")) return "BOUYGUES";
  if (lower.includes("vw bank") || lower.includes("volkswagen")) return "VW BANK";
  if (lower.includes("mgen")) return "MGEN";
  if (lower.includes("sfr")) return "SFR";
  if (lower.includes("orange")) return "ORANGE";
  if (lower.includes("edf")) return "EDF";
  if (lower.includes("urssaf")) return "URSSAF";
  if (lower.includes("dgfip") || lower.includes("impot")) return "IMPÔTS";
  if (lower.includes("malakoff") || lower.includes("humanis")) return "MALAKOFF HUMANIS";
  if (lower.includes("nike")) return "NIKE";
  if (lower.includes("agios") || lower.includes("commission") || lower.includes("arrete de compte")) return "Frais bancaires";

  let cleaned = label;

  // 1. Clean common payment method tags
  cleaned = cleaned.replace(/PRELVT SEPA RECU D\/O CONFRERE PRLV SEPA/gi, 'PRLV Confrère');
  cleaned = cleaned.replace(/PRELVT SEPA RECU D\/O CONFRERE/gi, 'PRLV Confrère');
  cleaned = cleaned.replace(/VIREMENT PERMANENT/gi, 'VT PERM');
  cleaned = cleaned.replace(/VIR\.PERMANENT/gi, 'VT PERM');
  cleaned = cleaned.replace(/VIREMENT INSTANTANE/gi, 'VIR Inst.');
  cleaned = cleaned.replace(/VIREMENT SEPA RECU/gi, 'VIR');
  cleaned = cleaned.replace(/VIR SEPA/gi, 'VIR');
  cleaned = cleaned.replace(/VIR INST/gi, 'VIR Inst.');
  cleaned = cleaned.replace(/PRLV SEPA/gi, 'PRLV');
  cleaned = cleaned.replace(/PRELVT/gi, 'PRLV');
  cleaned = cleaned.replace(/PRLV/gi, 'PRLV');
  cleaned = cleaned.replace(/Virement/g, 'VIR');
  cleaned = cleaned.replace(/VIREMENT/g, 'VIR');
  
  // Specific cases
  cleaned = cleaned.replace(/VT PERM appart/gi, 'VT PERM - Appartement');

  // 2. Remove standard bank tracking metadata
  cleaned = cleaned.replace(/CARTE\s+\d+\s+CB/gi, '');
  cleaned = cleaned.replace(/CARTE\s+CB/gi, '');
  cleaned = cleaned.replace(/\bCB\b/g, '');
  cleaned = cleaned.replace(/\bCBL[M]?\b/gi, '');
  cleaned = cleaned.replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, '');
  cleaned = cleaned.replace(/ICS\.[A-Z0-9]+/gi, '');
  cleaned = cleaned.replace(/\.RUM\.[A-Z0-9]+/gi, '');
  cleaned = cleaned.replace(/SDR\d+/gi, '');
  cleaned = cleaned.replace(/PID\d+/gi, '');
  cleaned = cleaned.replace(/PAYOUT\s+\d+/gi, '');
  cleaned = cleaned.replace(/EXT BAL SWEEP\s+[A-Z0-9]+/gi, '');
  cleaned = cleaned.replace(/\b[A-Z0-9]{15,}\b/g, ''); // Mandate IDs
  cleaned = cleaned.replace(/\b\d{10,}\b/g, ''); // Serial numbers

  // 3. Remove client name repetitions and card meta details
  cleaned = cleaned.replace(/EUR\s*\d+[\.,]\d*/gi, '');
  cleaned = cleaned.replace(/\d+[\.,]\d*\s*EUR/gi, '');
  cleaned = cleaned.replace(/\b\d+[\.,]\d*\b/g, ''); 
  cleaned = cleaned.replace(/\b(EUR|USD)\b/gi, '');
  cleaned = cleaned.replace(/\b(Paris|PARIS)\b/gi, '');
  cleaned = cleaned.replace(/PHILIPPE\s+GUILLAUME/gi, '');
  cleaned = cleaned.replace(/GUILLAUME\s+PHILIPPE/gi, '');
  cleaned = cleaned.replace(/M GUILLAUME PHILIPPE/gi, '');
  cleaned = cleaned.replace(/M GUILLAUME OU MM/gi, '');
  cleaned = cleaned.replace(/MR PHILIPPE GUILLAUME/gi, '');
  cleaned = cleaned.replace(/M\.? PHILIPPE GUILLAUME/gi, '');

  // 4. Final sanitization
  // Éliminer les répétitions consécutives de mots identiques comme "VIR VIR" ou "PRLV PRLV" (insensible à la casse)
  cleaned = cleaned.replace(/\b(\w+)\b(?:\s+\1\b)+/gi, '$1');

  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.trim();
  
  // Remove trailing dots, dashes, or slashes
  cleaned = cleaned.replace(/[\s\-\.\/]+$/, '');

  return cleaned || label;
}

export default function RelevePage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const flowParam = searchParams.get("flow");

  useEffect(() => {
    if (tabParam === "pro" || tabParam === "perso") {
      setActiveTab(tabParam);
      setSelectedMonth("all");
    }
  }, [tabParam]);

  useEffect(() => {
    if (flowParam === "inflow" || flowParam === "outflow" || flowParam === "all") {
      setFilterFlow(flowParam);
    }
  }, [flowParam]);

  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [activeTab, setActiveTab] = useState<"pro" | "perso">("pro");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("2025");
  const [togglingTxId, setTogglingTxId] = useState<string | null>(null);
  const [reconcilingTxId, setReconcilingTxId] = useState<string | null>(null);
  
  // PDF Preview State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Manual File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingTx, setUploadingTx] = useState<Transaction | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Expanded Transactions State
  const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(new Set());

  // Filters
  const [filterFlow, setFilterFlow] = useState<"all" | "inflow" | "outflow">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMatched, setFilterMatched] = useState<"all" | "matched" | "unmatched">("unmatched");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);

  const handleTogglePro = useCallback(async (transactionId: string | number, currentIsPro: boolean) => {
    const newIsPro = !currentIsPro;
    setTogglingTxId(String(transactionId));
    
    // 1. Optimistic Update: immediately update local state
    setTransactions(prev => 
      prev.map(tx => 
        String(tx.id) === String(transactionId) 
          ? { ...tx, isPro: newIsPro } 
          : tx
      )
    );

    // 2. Perform API call in the background
    try {
      const res = await fetch('/api/transactions/toggle-pro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactionId: String(transactionId), isPro: newIsPro }),
      });
      
      if (!res.ok) {
        // Revert change on error
        setTransactions(prev => 
          prev.map(tx => 
            String(tx.id) === String(transactionId) 
              ? { ...tx, isPro: currentIsPro } 
              : tx
          )
        );
        alert("Erreur lors de la modification de la catégorie");
      }
    } catch (err: any) {
      // Revert change on error
      setTransactions(prev => 
        prev.map(tx => 
          String(tx.id) === String(transactionId) 
            ? { ...tx, isPro: currentIsPro } 
            : tx
        )
      );
      alert(err.message || "Erreur de connexion");
    } finally {
      setTogglingTxId(null);
    }
  }, [setTransactions]);

  const handleReconcileAuto = useCallback(async (tx: Transaction) => {
    setReconcilingTxId(String(tx.id));
    try {
      const res = await fetch('/api/transactions/reconcile-auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: String(tx.id),
          label: tx.label,
          amount: tx.amount,
          date: tx.date
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Update transaction locally with the new matchedInvoice
        setTransactions(prev =>
          prev.map(t =>
            String(t.id) === String(tx.id)
              ? { ...t, matchedInvoice: data.invoice }
              : t
          )
        );
        alert(`Rapprochement réussi avec le fichier : ${data.matchedFile}`);
      } else {
        alert(data.error || "Une erreur s'est produite lors du rapprochement automatique.");
      }
    } catch (err: any) {
      alert(err.message || "Erreur de connexion lors du rapprochement.");
    } finally {
      setReconcilingTxId(null);
    }
  }, [setTransactions]);

  const triggerManualUpload = (e: React.MouseEvent, tx: Transaction) => {
    e.stopPropagation();
    setUploadingTx(tx);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleManualFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadingTx || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("transactionId", String(uploadingTx.id));
      formData.append("label", uploadingTx.label);
      formData.append("amount", String(uploadingTx.amount));
      formData.append("date", uploadingTx.date);
      formData.append("file", file);

      const res = await fetch("/api/transactions/reconcile-file", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTransactions(prev =>
          prev.map(t =>
            String(t.id) === String(uploadingTx.id)
              ? { ...t, matchedInvoice: data.invoice }
              : t
          )
        );
        alert(`Justificatif téléversé et transaction rapprochée avec succès !`);
      } else {
        alert(data.error || "Erreur de rapprochement manuel.");
      }
    } catch (err: any) {
      alert(err.message || "Erreur réseau lors de l'envoi.");
    } finally {
      setIsUploading(false);
      setUploadingTx(null);
    }
  };

  const toggleTxExpansion = (txId: string) => {
    setExpandedTxIds(prev => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const loadData = async () => {
    const silent = transactions.length > 0;
    if (silent) {
      setIsRefetching(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch("/api/transactions/releve?t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setBankAccounts(data.bankAccounts || []);
      }
    } catch (err) {
      console.error("Failed to fetch statement data:", err);
    } finally {
      setLoading(false);
      setIsRefetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter transactions
  const filteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      // 1. Pro vs Perso Bank Account
      if (activeTab === "pro" && !tx.isProAccount) return false;
      if (activeTab === "perso" && tx.isProAccount) return false;

      // 1b. Year Selector
      if (selectedYear !== "all") {
        const txYear = tx.date.substring(0, 4);
        if (txYear !== selectedYear) return false;
      }

      // 2. Month Selector
      if (selectedMonth !== "all") {
        const txMonth = tx.date.substring(0, 7); // "2026-06"
        if (txMonth !== selectedMonth) return false;
      }

      const isSearching = searchQuery.trim() !== "";

      // 3. Flow (Inflow / Outflow)
      if (filterFlow === "inflow" && tx.isOutflow) return false;
      if (filterFlow === "outflow" && !tx.isOutflow) return false;

      // 4. Category
      if (filterCategory !== "all" && tx.category !== filterCategory) return false;

      // 5. Matched invoice status
      if (filterMatched === "matched") {
        // Les rentrées (inflows) sont considérées comme rapprochées par défaut car elles ne nécessitent pas de facture fournisseur
        if (tx.isOutflow && !tx.matchedInvoice) return false;
      }
      if (filterMatched === "unmatched") {
        // Seules les dépenses (sorties) peuvent être en attente de rapprochement
        if (!tx.isOutflow) return false;
        if (tx.matchedInvoice || tx.noJustificatif) return false;
      }

      // 6. Search query
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesLabel = tx.label.toLowerCase().includes(query);
        const matchesInvoiceLabel = tx.matchedInvoice?.label?.toLowerCase().includes(query) || false;
        const matchesFilename = tx.matchedInvoice?.filename?.toLowerCase().includes(query) || false;
        if (!matchesLabel && !matchesInvoiceLabel && !matchesFilename) return false;
      }

      return true;
    });
  }, [transactions, activeTab, selectedYear, selectedMonth, filterFlow, filterCategory, filterMatched, searchQuery]);

  // Extract unique years for select
  const uniqueYears = useMemo(() => {
    const years = Array.from(
      new Set(
        transactions
          .filter(tx => (activeTab === "pro" ? tx.isProAccount : !tx.isProAccount))
          .map(tx => tx.date.substring(0, 4))
      )
    ).sort((a, b) => b.localeCompare(a));

    if (years.length === 0) {
      return ["2026", "2025"];
    }
    return years;
  }, [transactions, activeTab]);

  // Extract unique months for select dropdown
  const uniqueMonths = useMemo(() => {
    return Array.from(
      new Set(
        transactions
          .filter(tx => (activeTab === "pro" ? tx.isProAccount : !tx.isProAccount))
          .filter(tx => selectedYear === "all" || tx.date.startsWith(selectedYear))
          .map(tx => tx.date.substring(0, 7))
      )
    ).sort((a, b) => b.localeCompare(a));
  }, [transactions, activeTab, selectedYear]);

  // Group by Month (sorted descending, no day sub-grouping for minimalist look)
  const groupedByMonth = useMemo(() => {
    const groups: { [key: string]: MonthGroup } = {};
    
    filteredTxs.forEach(tx => {
      const monthKey = tx.date.substring(0, 7); // "2026-06"
      if (!groups[monthKey]) {
        const d = new Date(`${monthKey}-02`);
        const monthLabel = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
        const capitalizedLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
        
        groups[monthKey] = {
          key: monthKey,
          label: capitalizedLabel,
          transactions: [],
          inflows: 0,
          outflows: 0,
          net: 0,
          matchedCount: 0,
          totalOutflowCount: 0,
          matchingRate: 100
        };
      }
      
      const g = groups[monthKey];
      g.transactions.push(tx);
      
      if (tx.isOutflow) {
        g.outflows += Math.abs(tx.amount);
      } else {
        g.inflows += tx.amount;
      }

      if (!tx.noJustificatif) {
        g.totalOutflowCount++;
        if (tx.matchedInvoice) {
          g.matchedCount++;
        }
      }
    });
    
    const sortedMonthKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    sortedMonthKeys.forEach(mKey => {
      const g = groups[mKey];
      g.net = g.inflows - g.outflows;
      g.matchingRate = g.totalOutflowCount > 0 ? Math.round((g.matchedCount / g.totalOutflowCount) * 100) : 100;
      // Sort transactions of this month by date descending
      g.transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    
    return { groups, sortedMonthKeys };
  }, [filteredTxs]);

  // Global Statistics
  const totalInflows = useMemo(() => {
    return filteredTxs
      .filter(tx => !tx.isOutflow)
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const totalOutflows = useMemo(() => {
    return filteredTxs
      .filter(tx => tx.isOutflow)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }, [filteredTxs]);

  const netBalance = totalInflows - totalOutflows;

  const globalMatchingRate = useMemo(() => {
    const totalCount = filteredTxs.filter(tx => !tx.noJustificatif).length;
    const matchedCount = filteredTxs.filter(tx => !tx.noJustificatif && tx.matchedInvoice).length;
    return totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 100;
  }, [filteredTxs]);

  // Toggle Month Accordion
  const isMonthExpanded = (monthKey: string) => {
    return expandedMonths[monthKey] !== false; // Default to true
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: prev[monthKey] === false
    }));
  };

  return (
    <main className="min-h-screen bg-[#FDFBEF] text-[#1E2A33] p-4 sm:p-6 lg:p-8 font-sans relative">
      {/* TDT Grid Background Effect */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 z-0"></div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-4">
        {/* Sticky Header & Filters Container */}
        <div className="sticky top-0 bg-[#FDFBEF]/95 backdrop-blur-md z-40 -mt-4 pt-10 pb-3 sm:-mt-6 sm:pt-14 lg:-mt-8 lg:pt-16 border-b border-[#1E2A33]/10 space-y-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-row justify-between items-center gap-3 w-full mb-3.5">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-1 bg-[#AE7D5C] rounded-full min-h-[22px] sm:min-h-[32px] self-stretch shadow-[0_0_15px_rgba(174,125,92,0.4)]"></div>
              <h1 className="text-lg xs:text-xl sm:text-4xl font-bebas tracking-wide text-[#1E2A33] leading-none">
                TRANSACTIONS
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Year Switcher (Segmented Control chic) */}
              <div className="flex bg-white/60 p-0.5 sm:p-1.5 rounded-lg sm:rounded-2xl border border-[#1E2A33]/5 gap-0.5 sm:gap-1.5 shadow-inner shrink-0">
                {uniqueYears.map(y => (
                  <button
                    key={y}
                    onClick={() => {
                      setSelectedYear(y);
                      setSelectedMonth("all");
                    }}
                    className={`flex items-center justify-center px-2.5 py-1 sm:px-5 sm:py-2.5 rounded-md sm:rounded-xl text-[10px] sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
                      selectedYear === y
                        ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                        : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>

              <button
                onClick={loadData}
                disabled={loading || isRefetching}
                className="flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-1.5 text-xs text-[#1E2A33]/50 hover:text-[#1E2A33] transition-colors rounded-lg cursor-pointer disabled:opacity-75"
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${loading || isRefetching ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
            </div>
          </div>

          {/* Switcher & Search Bar */}
          <div className="flex flex-row flex-wrap justify-center items-center gap-3 bg-transparent p-0 border-none shadow-none print:hidden select-none w-full">

          {/* Account Switcher */}
          <div className="flex bg-white/60 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-[#1E2A33]/5 gap-1 sm:gap-1.5 shadow-inner shrink-0">
            <button
              onClick={() => {
                setActiveTab("pro");
                setSelectedMonth("all");
              }}
              className={`flex items-center justify-center gap-1 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === "pro"
                  ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">COMPTE </span>PRO
            </button>
            <button
              onClick={() => {
                setActiveTab("perso");
                setSelectedMonth("all");
              }}
              className={`flex items-center justify-center gap-1 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === "perso"
                  ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              <User2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">COMPTE </span>PERSO
            </button>
          </div>

          {/* Flow Filter (Entrées/Sorties sobre) */}
          <div className="flex bg-white/60 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-[#1E2A33]/5 gap-1 sm:gap-1.5 shadow-inner shrink-0">
            <button
              onClick={() => setFilterFlow(filterFlow === "inflow" ? "all" : "inflow")}
              className={`flex items-center justify-center px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterFlow === "inflow"
                  ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              ENTRÉES
            </button>
            <button
              onClick={() => setFilterFlow(filterFlow === "outflow" ? "all" : "outflow")}
              className={`flex items-center justify-center px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterFlow === "outflow"
                  ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              SORTIES
            </button>
          </div>
        </div>

        {/* Secondary Filters & Search Bar */}
        <div className="flex flex-row flex-wrap items-center gap-2.5 bg-transparent p-0 border-none shadow-none print:hidden select-none w-full">

          {/* Month Filter Dropdown Premium */}
          <div className="relative shrink-0 z-30">
            <button
              onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}
              className="flex bg-white/60 p-1.5 py-2 rounded-2xl border border-[#1E2A33]/5 gap-2 shadow-inner items-center px-3 transition-all hover:bg-white hover:border-[#1E2A33]/10 cursor-pointer min-w-[150px] justify-between text-[10px] sm:text-xs font-bold text-[#1E2A33] whitespace-nowrap"
            >
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1E2A33]/50 shrink-0" />
                {selectedMonth === "all"
                  ? "Tous les mois"
                  : new Date(`${selectedMonth}-02`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-[#1E2A33]/40 shrink-0 transition-transform duration-200 ${isMonthDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isMonthDropdownOpen && (
              <>
                {/* Backdrop invisible pour clore au clic extérieur */}
                <div className="fixed inset-0 z-40" onClick={() => setIsMonthDropdownOpen(false)} />
                
                {/* Liste des mois déroulante */}
                <div className="absolute left-0 mt-2 w-56 bg-white/95 backdrop-blur-md rounded-2xl border border-[#1E2A33]/10 shadow-2xl p-1.5 z-50 overflow-hidden max-h-[300px] overflow-y-auto">
                  <button
                    onClick={() => {
                      setSelectedMonth("all");
                      setIsMonthDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedMonth === "all"
                        ? "bg-[#1E2A33] text-white shadow-sm"
                        : "text-[#1E2A33]/70 hover:bg-[#AE7D5C]/10 hover:text-[#1E2A33]"
                    }`}
                  >
                    Tous les mois
                  </button>
                  <div className="h-px bg-[#1E2A33]/5 my-1" />
                  {uniqueMonths.map(m => (
                    <button
                      key={m}
                      onClick={() => {
                        setSelectedMonth(m);
                        setIsMonthDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        selectedMonth === m
                          ? "bg-[#1E2A33] text-white shadow-sm"
                          : "text-[#1E2A33]/70 hover:bg-[#AE7D5C]/10 hover:text-[#1E2A33]"
                      }`}
                    >
                      {new Date(`${m}-02`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Matched Filter (Segmented Control avec "Tout") */}
          <div className="flex bg-white/60 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-[#1E2A33]/5 gap-1 sm:gap-1.5 shadow-inner shrink-0">
            <button
              onClick={() => setFilterMatched("all")}
              className={`flex items-center justify-center px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterMatched === "all"
                  ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              Tout
            </button>
            <button
              onClick={() => setFilterMatched("unmatched")}
              className={`flex items-center justify-center px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterMatched === "unmatched"
                  ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              <span className="hidden xs:inline">À rapprocher</span>
              <span className="xs:hidden">À rappr.</span>
            </button>
            <button
              onClick={() => setFilterMatched("matched")}
              className={`flex items-center justify-center px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterMatched === "matched"
                  ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              <span className="hidden xs:inline">Rapprochés</span>
              <span className="xs:hidden">Rapproch.</span>
            </button>
          </div>

          {/* Search Input (Loupe) */}
          <div className="flex items-center gap-2 bg-[#FDFBEF] border border-[#1E2A33]/10 rounded-xl px-3 py-2 w-full xl:w-64 xl:ml-auto">
            <Search className="w-4 h-4 text-[#1E2A33]/50 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher par marchand/facture..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#1E2A33] border-none outline-none w-full placeholder-[#1E2A33]/40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-[#1E2A33]/40 hover:text-[#1E2A33] focus:outline-none">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main daily transactions list */}
      {loading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-4">
            <RefreshCcw className="w-8 h-8 text-[#AE7D5C] animate-spin" />
            <span className="text-sm font-medium text-[#1E2A33]/60">Récupération des transactions...</span>
          </div>
        ) : groupedByMonth.sortedMonthKeys.length === 0 ? (
          <div className="bg-white border border-[#1E2A33]/10 rounded-3xl p-12 text-center shadow-sm">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-bebas tracking-wide text-[#1E2A33]">Aucune transaction trouvée</h3>
            <p className="text-xs text-[#1E2A33]/50 max-w-sm mx-auto mt-2">
              Aucun mouvement bancaire ne correspond aux critères de filtre sélectionnés.
            </p>
          </div>
        ) : (
          <div className={`space-y-6 transition-all duration-300 ${isRefetching ? "opacity-60 pointer-events-none" : ""}`}>
            {groupedByMonth.sortedMonthKeys.map(mKey => {
              const group = groupedByMonth.groups[mKey];
              const isExpanded = isMonthExpanded(mKey);

              return (
                <div key={mKey} className="bg-white border border-[#1E2A33]/10 rounded-2xl overflow-hidden shadow-sm">
                  {/* Month Accordion Header */}
                  <button
                    onClick={() => toggleMonth(mKey)}
                    className="w-full flex flex-row items-center justify-between px-3 sm:px-4 py-3 bg-[#1E2A33]/5 hover:bg-[#1E2A33]/10 transition-colors text-left gap-3 border-b border-[#1E2A33]/10"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-[#AE7D5C]" /> : <ChevronRight className="w-5 h-5 text-[#AE7D5C]" />}
                      <span className="text-lg sm:text-xl font-bebas tracking-wider text-[#1E2A33] uppercase truncate">
                        {group.label}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-[#AE7D5C]/10 text-[#AE7D5C] rounded-lg shrink-0">
                        {group.transactions.length} relevé{group.transactions.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-[#1E2A33]/70">
                      <span className="text-[#AE7D5C] bg-[#AE7D5C]/10 px-2 py-0.5 rounded-lg text-[11px]">
                        Rapproché : {group.matchingRate}%
                      </span>
                    </div>
                  </button>

                  {/* Month Accordion Content: Sleek single-line Table */}
                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <Table className="w-full table-fixed">
                        <TableHeader>
                          <TableRow className="border-[#1E2A33]/10 hover:bg-transparent hidden sm:table-row">
                            <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest pl-6 w-24">Date</TableHead>
                            <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest flex-1">Libellé / Marchand</TableHead>
                            <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest w-36 hidden sm:table-cell">Compte</TableHead>
                            <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest w-24 text-center hidden sm:table-cell">Catégorie</TableHead>
                            <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest w-32 text-center hidden sm:table-cell">Justificatif</TableHead>
                            <TableHead className="text-right font-roboto text-rose-600 text-[10px] uppercase tracking-widest w-28">Débit (Sorties)</TableHead>
                            <TableHead className="text-right font-roboto text-emerald-600 text-[10px] uppercase tracking-widest pr-6 w-28">Crédit (Entrées)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.transactions.map((tx) => {
                            const badgeInfo = getCategoryBadge(tx.category);
                            const txExpanded = expandedTxIds.has(String(tx.id));

                            return (
                              <React.Fragment key={tx.id}>
                                {/* Transaction Row (single line) */}
                                <TableRow
                                  className={`border-b border-b-[#1E2A33]/5 hover:bg-[#FDFBEF] transition-colors cursor-pointer group ${txExpanded ? 'bg-[#FDFBEF]/30' : ''}`}
                                  onClick={() => toggleTxExpansion(String(tx.id))}
                                >
                                  {/* Date */}
                                  <TableCell className="font-roboto font-light text-[#1E2A33]/50 text-xs sm:pl-6 pl-3 whitespace-nowrap py-2 sm:py-3.5">
                                    {new Date(tx.date).toLocaleDateString('fr-FR')}
                                  </TableCell>

                                  <TableCell className="font-roboto font-medium text-[#1E2A33] text-sm py-2 sm:py-3.5 max-w-[200px] sm:max-w-none">
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                      <span className="truncate max-w-[180px] xs:max-w-[240px] sm:max-w-[400px] block font-semibold text-[#1E2A33]" title={tx.label}>{cleanDisplayLabel(tx.label)}</span>
                                      {tx.label !== cleanDisplayLabel(tx.label) && (
                                        <span className="text-[10px] text-[#1E2A33]/40 font-light truncate max-w-[180px] xs:max-w-[240px] sm:max-w-[400px] hidden sm:block" title={tx.label}>
                                          {tx.label}
                                        </span>
                                      )}
                                      
                                      {/* Mobile-only badges and details stacked inline */}
                                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-[#1E2A33]/50 sm:hidden mt-1">
                                        
                                        {/* Mobile Pro/Perso toggler button */}
                                        <div onClick={(e) => e.stopPropagation()} className="inline-flex">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-5 px-2 font-roboto text-[8px] font-medium rounded-full border transition-all cursor-pointer ${
                                              !tx.isPro
                                                ? 'border-blue-200 text-blue-700 bg-blue-50/40 hover:bg-blue-100/50'
                                                : 'border-amber-200 text-amber-800 bg-amber-50/40 hover:bg-amber-100/50'
                                            }`}
                                            onClick={() => handleTogglePro(tx.id, tx.isPro)}
                                            disabled={togglingTxId === String(tx.id)}
                                          >
                                            {togglingTxId === String(tx.id) ? (
                                              <Loader2 className="w-2 h-2 animate-spin" />
                                            ) : !tx.isPro ? (
                                              <span>🏠 Perso</span>
                                            ) : (
                                              <span>💼 Pro</span>
                                            )}
                                          </Button>
                                        </div>
                                        
                                        {/* Mobile Reconciled Badge / Button */}
                                        {tx.isPro && (
                                          <div onClick={(e) => e.stopPropagation()} className="inline-flex">
                                            {tx.matchedInvoice ? (
                                              <button
                                                onClick={() => setPreviewUrl(tx.matchedInvoice?.publicFileUrl || null)}
                                                className="cursor-pointer"
                                              >
                                                <Badge variant="outline" className="border-green-500/30 text-green-700 bg-green-50/50 font-roboto font-normal text-[8px] px-1.5 py-0 flex items-center gap-0.5">
                                                  <span className="w-1 h-1 rounded-full bg-green-500" />
                                                  <span>Rapproché</span>
                                                  <FileText className="w-2 h-2 ml-0.5 opacity-70" />
                                                </Badge>
                                              </button>
                                            ) : tx.noJustificatif ? (
                                              tx.amount > 0 ? (
                                                <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-50/40 font-roboto font-medium text-[8px] px-1.5 py-0 flex items-center gap-0.5">
                                                  <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                                  <span>Recette Validée</span>
                                                </Badge>
                                              ) : (
                                                <Badge variant="outline" className="border-slate-300 text-slate-600 bg-slate-100/50 font-roboto font-normal text-[8px] px-1.5 py-0 flex items-center gap-0.5">
                                                  <span className="w-1 h-1 rounded-full bg-slate-400" />
                                                  <span>Sans justificatif</span>
                                                </Badge>
                                              )
                                            ) : (
                                              <button
                                                onClick={() => handleReconcileAuto(tx)}
                                                disabled={reconcilingTxId === String(tx.id)}
                                                className="flex items-center gap-0.5 text-amber-600 bg-amber-50 border border-amber-200/50 hover:bg-amber-100/80 transition-colors px-1.5 py-0 rounded text-[8px] font-bold cursor-pointer disabled:opacity-50"
                                              >
                                                {reconcilingTxId === String(tx.id) ? (
                                                  <>
                                                    <Loader2 className="w-2 h-2 animate-spin mr-0.5" />
                                                    <span>Recherche...</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <AlertCircle className="w-2 h-2 shrink-0" />
                                                    <span>À rapprocher</span>
                                                  </>
                                                )}
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>

                                  {/* Compte */}
                                  <TableCell className="font-roboto font-light text-[#1E2A33]/50 text-xs hidden sm:table-cell py-3.5 max-w-[160px] truncate">
                                    {tx.bankAccountName}
                                  </TableCell>

                                  {/* Catégorie */}
                                  <TableCell className="hidden sm:table-cell text-center py-3.5" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className={`h-7 px-2.5 font-roboto text-[10px] font-medium rounded-full border transition-all cursor-pointer ${
                                        !tx.isPro
                                          ? 'border-blue-200 text-blue-700 bg-blue-50/40 hover:bg-blue-100/50'
                                          : 'border-amber-200 text-amber-800 bg-amber-50/40 hover:bg-amber-100/50'
                                      }`}
                                      onClick={() => handleTogglePro(tx.id, tx.isPro)}
                                      disabled={togglingTxId === String(tx.id)}
                                    >
                                      {togglingTxId === String(tx.id) ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : !tx.isPro ? (
                                        <>
                                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5" />
                                          <span>🏠 Perso</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
                                          <span>💼 Pro</span>
                                        </>
                                      )}
                                    </Button>
                                  </TableCell>

                                  {/* Justificatif */}
                                  <TableCell className="text-center py-3.5 hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
                                    <div className="inline-flex justify-center w-full">
                                      {!tx.isPro ? (
                                        <span className="text-[10px] text-[#1E2A33]/30 font-light">—</span>
                                      ) : tx.matchedInvoice ? (
                                        <button
                                          onClick={() => setPreviewUrl(tx.matchedInvoice?.publicFileUrl || null)}
                                          className="cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                                          title="Ouvrir le justificatif PDF"
                                        >
                                          <Badge variant="outline" className="border-green-500/30 text-green-700 bg-green-50/50 hover:bg-green-100/50 font-roboto font-normal text-[10px] px-2 py-0.5 flex items-center gap-1">
                                            <span className="w-1 h-1 rounded-full bg-green-500" />
                                            <span>Rapproché</span>
                                            <FileText className="w-2.5 h-2.5 ml-0.5 opacity-70" />
                                          </Badge>
                                        </button>
                                      ) : tx.noJustificatif ? (
                                         tx.amount > 0 ? (
                                           <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-50/40 font-roboto font-medium text-[10px] px-2 py-0.5 flex items-center gap-1.5">
                                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                             <span>Recette Validée</span>
                                           </Badge>
                                         ) : (
                                           <Badge variant="outline" className="border-slate-300 text-slate-600 bg-slate-100/50 font-roboto font-normal text-[10px] px-2 py-0.5 flex items-center gap-1">
                                             <span className="w-1 h-1 rounded-full bg-slate-400" />
                                             <span>Sans justificatif</span>
                                           </Badge>
                                         )
                                      ) : (
                                        <button
                                          onClick={() => handleReconcileAuto(tx)}
                                          disabled={reconcilingTxId === String(tx.id)}
                                          className="flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-200/50 hover:bg-amber-100/80 transition-colors px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50"
                                        >
                                          {reconcilingTxId === String(tx.id) ? (
                                            <>
                                              <Loader2 className="w-2.5 h-2.5 animate-spin mr-0.5" />
                                              <span>Recherche...</span>
                                            </>
                                          ) : (
                                            <>
                                              <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                              <span>À rapprocher</span>
                                            </>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>

                                  {/* Débit (Sorties) */}
                                  <TableCell className="text-right py-2 sm:py-3.5 whitespace-nowrap w-28">
                                    {tx.isOutflow ? (
                                      <span className="inline-flex items-center gap-1 text-sm sm:text-base font-bebas tracking-wider px-2 py-0.5 rounded-lg border font-bold text-rose-700 bg-rose-50/70 border-rose-200/50">
                                        - {formatAmount(tx.absAmount)}
                                      </span>
                                    ) : (
                                      <span className="text-[#1E2A33]/20 font-light text-xs">-</span>
                                    )}
                                  </TableCell>

                                  {/* Crédit (Entrées) */}
                                  <TableCell className="text-right sm:pr-6 pr-3 py-2 sm:py-3.5 whitespace-nowrap w-28">
                                    <div className="flex items-center justify-end gap-2">
                                      {!tx.isOutflow ? (
                                        <span className="inline-flex items-center gap-1 text-sm sm:text-base font-bebas tracking-wider px-2 py-0.5 rounded-lg border font-bold text-emerald-700 bg-emerald-50/70 border-emerald-200/50">
                                          + {formatAmount(tx.absAmount)}
                                        </span>
                                      ) : (
                                        <span className="text-[#1E2A33]/20 font-light text-xs">-</span>
                                      )}
                                      {txExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#1E2A33]/40" /> : <ChevronRight className="w-3.5 h-3.5 text-[#1E2A33]/40 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                    </div>
                                  </TableCell>
                                </TableRow>
                                {/* Expanded Transaction Details */}
                                {txExpanded && (
                                  <TableRow className="bg-[#1E2A33]/[0.01] hover:bg-transparent">
                                    <TableCell colSpan={7} className="p-0 border-t-0">
                                       <div className="px-3 sm:px-6 py-4 bg-[#FDFBEF]/30 border-l-4 border-[#AE7D5C] rounded-r-xl transition-all space-y-5 w-full overflow-hidden">
                                        {/* Top Side: Metadata / Details */}
                                        <div className="space-y-4 text-xs">
                                          {/* Show patient details for SumUp / CPAM */}
                                          {typeof tx.productDescription === 'string' && tx.productDescription && (() => {
                                            if (tx.productDescription.startsWith("SUMUP_JSON:")) {
                                              try {
                                                const patients = JSON.parse(tx.productDescription.substring(11)) as { name: string, amount: number }[];
                                                return (
                                                  <div className="space-y-3">
                                                    <h4 className="font-roboto font-bold text-[10px] uppercase tracking-wider text-emerald-700 font-bold flex items-center gap-1.5">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                      Détail des règlements patients (SumUp)
                                                    </h4>
                                                    <div className="space-y-1.5 bg-emerald-50/10 border border-emerald-500/10 p-3.5 rounded-2xl max-h-[180px] overflow-y-auto">
                                                      {patients.map((pat, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-emerald-500/5 last:border-b-0">
                                                          <span className="text-[#1E2A33] font-medium">{pat.name}</span>
                                                          <span className="text-emerald-700 font-bold font-bebas tracking-wide text-sm">{pat.amount.toFixed(2)} €</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                );
                                              } catch (e) {}
                                            }
                                            if (tx.productDescription.startsWith("CPAM_JSON:")) {
                                              try {
                                                const patients = JSON.parse(tx.productDescription.substring(10)) as { name: string, amount: number }[];
                                                return (
                                                  <div className="space-y-3">
                                                    <h4 className="font-roboto font-bold text-[10px] uppercase tracking-wider text-blue-700 font-bold flex items-center gap-1.5">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                      Détail des remboursements tiers-payant (CPAM)
                                                    </h4>
                                                    <div className="space-y-1.5 bg-blue-50/10 border border-blue-500/10 p-3.5 rounded-2xl max-h-[180px] overflow-y-auto">
                                                      {patients.map((pat, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-blue-500/5 last:border-b-0">
                                                          <span className="text-[#1E2A33] font-medium">{pat.name}</span>
                                                          <span className="text-blue-700 font-bold font-bebas tracking-wide text-sm">{pat.amount.toFixed(2)} €</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                );
                                              } catch (e) {}
                                            }
                                            return null;
                                          })()}

                                          {/* Show origin label if not SumUp/CPAM patient data */}
                                          {(!tx.productDescription || (!tx.productDescription.startsWith("SUMUP_JSON:") && !tx.productDescription.startsWith("CPAM_JSON:"))) && (
                                            <div className="space-y-1.5">
                                              <h4 className="font-roboto font-bold text-[10px] uppercase tracking-wider text-[#1E2A33]/50">Libellé d'origine</h4>
                                               <div className="font-mono text-[10px] text-[#1E2A33]/70 break-all bg-[#1E2A33]/5 p-2.5 rounded-xl leading-normal select-all">
                                                 {tx.label}
                                               </div>
                                            </div>
                                          )}

                                          {/* Product details */}
                                          {(() => {
                                            const displayProductDescription = tx.productDescription || (
                                              (tx.label && (tx.label.toLowerCase().includes("paris halles") || tx.label.toLowerCase().includes("sebastopol")))
                                                ? "Restaurant"
                                                : ""
                                            );
                                            if (!displayProductDescription || displayProductDescription.startsWith("SUMUP_JSON:") || displayProductDescription.startsWith("CPAM_JSON:")) return null;
                                            return (
                                              <div className="pt-3 border-t border-[#1E2A33]/10 space-y-1">
                                                <h4 className="font-roboto font-bold text-[10px] uppercase tracking-wider text-[#AE7D5C] font-semibold">Produit / Service acheté</h4>
                                                <div className="bg-[#AE7D5C]/5 p-2.5 rounded-xl border border-[#AE7D5C]/10 text-[#1E2A33] font-medium leading-relaxed">
                                                  {displayProductDescription}
                                                </div>
                                              </div>
                                            );
                                          })()}

                                          {tx.matchedInvoice?.invoiceLines && tx.matchedInvoice.invoiceLines.length > 0 && (
                                            <div className="pt-3 border-t border-[#1E2A33]/10 space-y-2">
                                              <h4 className="font-roboto font-bold text-[10px] uppercase tracking-wider text-[#AE7D5C] font-semibold">Articles de la facture</h4>
                                              <div className="space-y-1.5 bg-white border border-[#1E2A33]/5 p-2.5 rounded-xl max-h-[140px] overflow-y-auto">
                                                {tx.matchedInvoice.invoiceLines.map((line, idx) => (
                                                  <div key={idx} className="flex justify-between items-start gap-4 text-[11px] py-0.5 border-b border-[#1E2A33]/5 last:border-b-0 last:pb-0">
                                                    <span className="text-[#1E2A33] font-medium leading-normal break-words">{line.label}</span>
                                                    <span className="text-[#AE7D5C] font-mono font-semibold text-[10px] shrink-0">{line.amount.toFixed(2)} €</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        {/* Bottom Side: Reconcile / Attachments manager */}
                                        <div className="pt-4 border-t border-[#1E2A33]/10 space-y-3 flex flex-col justify-center">
                                          <h4 className="font-roboto font-bold text-[10px] uppercase tracking-wider text-[#1E2A33]/50 mb-1">Pièce Justificative (Facture)</h4>
                                          
                                          {tx.matchedInvoice ? (
                                            <div className="space-y-3">
                                              <div className="p-3 bg-white border border-[#1E2A33]/10 rounded-xl flex items-center justify-between shadow-sm w-full max-w-md gap-3">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                  <FileText className="w-5 h-5 text-[#AE7D5C] shrink-0" />
                                                  <div className="min-w-0 flex-1">
                                                    <span className="text-xs font-semibold text-[#1E2A33] block truncate max-w-[130px] xs:max-w-[180px] sm:max-w-[260px]" title={tx.matchedInvoice.filename}>
                                                      {tx.matchedInvoice.filename}
                                                    </span>
                                                    <span className="text-[9px] text-[#1E2A33]/40 block">Identifié sur Pennylane</span>
                                                  </div>
                                                </div>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-8 w-8 text-[#1E2A33]/40 hover:text-rose-600 rounded-full shrink-0"
                                                  onClick={() => triggerManualUpload(null as any, tx)}
                                                  title="Remplacer le justificatif"
                                                >
                                                  <Upload className="w-4 h-4" />
                                                </Button>
                                              </div>
                                              
                                              <div className="flex gap-2 w-full max-w-md">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="text-xs bg-white text-[#1E2A33] hover:bg-[#FDFBEF] rounded-xl flex-1 h-9 cursor-pointer min-w-0"
                                                  onClick={() => setPreviewUrl(tx.matchedInvoice?.publicFileUrl || null)}
                                                >
                                                  <FileText className="w-4 h-4 mr-2 shrink-0" />
                                                  <span className="truncate">Voir la facture</span>
                                                </Button>
                                                
                                                {tx.matchedInvoice.publicFileUrl && (
                                                  <a
                                                    href={tx.matchedInvoice.publicFileUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="h-9 px-3 border border-[#1E2A33]/10 text-[#1E2A33]/60 hover:text-[#1E2A33] bg-white rounded-xl flex items-center justify-center shrink-0"
                                                    title="Télécharger directement"
                                                  >
                                                    <Download className="w-4 h-4" />
                                                  </a>
                                                )}
                                              </div>
                                            </div>
                                          ) : tx.noJustificatif && !tx.label.toLowerCase().includes("sumup") && !tx.label.toLowerCase().includes("cpam") ? (
                                            <div className="bg-slate-50/50 border border-slate-200 p-3 rounded-xl max-w-md">
                                              <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs mb-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                Opération dispensée de justificatif
                                              </div>
                                              <p className="text-[11px] text-slate-500 leading-relaxed font-light">
                                                Certaines opérations (agios, commissions de compte, abonnements sans facture dédiée) sont exemptées de pièce justificative.
                                              </p>
                                            </div>
                                          ) : (
                                            <div className="space-y-2 max-w-md">
                                              <p className="text-xs font-light text-[#1E2A33]/60 mb-2">
                                                Aucune pièce jointe n'est liée à cette opération.
                                              </p>
                                              <div className="flex flex-col sm:flex-row gap-2">
                                                <Button
                                                  onClick={() => handleReconcileAuto(tx)}
                                                  disabled={reconcilingTxId === String(tx.id)}
                                                  className="text-xs bg-[#1E2A33] hover:bg-[#1E2A33]/90 text-white rounded-xl flex-1 h-9 font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                                                >
                                                  {reconcilingTxId === String(tx.id) ? (
                                                    <>
                                                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                                                      Recherche en cours...
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Sparkles className="w-3.5 h-3.5 mr-2 text-[#AE7D5C]" />
                                                      Rechercher automatique
                                                    </>
                                                  )}
                                                </Button>

                                                <Button
                                                  onClick={(e) => triggerManualUpload(e, tx)}
                                                  className="text-xs bg-white border border-[#AE7D5C]/40 text-[#AE7D5C] hover:bg-[#AE7D5C]/5 rounded-xl flex-1 h-9 font-semibold shadow-sm transition-all cursor-pointer"
                                                >
                                                  <Upload className="w-3.5 h-3.5 mr-2" />
                                                  Uploader un fichier
                                                </Button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-[#1E2A33]/10">
          <DialogHeader className="p-4 border-b border-[#1E2A33]/5 flex-shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-xl font-bebas tracking-wide text-[#1E2A33]">
              Aperçu de la Facture
            </DialogTitle>
            {previewUrl && (
              <a
                href={`/api/invoices/preview?url=${encodeURIComponent(previewUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-roboto font-medium text-[#AE7D5C] hover:underline mr-8 flex items-center gap-1"
              >
                <ExternalLink className="w-4 h-4" />
                Ouvrir dans un nouvel onglet
              </a>
            )}
          </DialogHeader>
          <div className="flex-1 w-full h-full relative bg-[#1E2A33]/5 flex flex-col items-center justify-center">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#1E2A33]/50 -z-10">
              <span className="loader mb-4 border-2 border-[#AE7D5C] border-t-transparent rounded-full w-8 h-8 animate-spin" />
              <p className="font-roboto text-sm">Chargement du document...</p>
              <p className="font-roboto text-xs mt-2 opacity-60">Si rien ne s'affiche, utilisez le lien en haut à droite.</p>
            </div>
            {previewUrl && (
              <iframe
                src={`/api/invoices/preview?url=${encodeURIComponent(previewUrl)}#toolbar=1&navpanes=0&view=FitH`}
                className="absolute inset-0 w-full h-full border-none z-10"
                title="Aperçu PDF"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden manual file input for reconciliation */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="application/pdf,image/png,image/jpeg"
        onChange={handleManualFileChange}
      />
    </main>
  );
}
