"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  CreditCard,
  Bot,
  ReceiptEuro,
  ArrowLeft,
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
  Search,
  X
} from "lucide-react";
import Link from "next/link";

interface Transaction {
  id: number;
  date: string;
  label: string;
  amount: number;
  absAmount: number;
  isOutflow: boolean;
  category: "card" | "direct_debit" | "transfer" | "other";
  isPro: boolean;
  noJustificatif?: boolean;
  bankAccountName: string;
  matchedInvoice?: {
    id: number;
    date: string;
    label: string;
    filename: string;
    publicFileUrl: string;
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
  groupedByDate: { [key: string]: Transaction[] };
  sortedDates: string[];
}

export default function RelevePage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [activeTab, setActiveTab] = useState<"pro" | "perso">("pro");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  
  // Filters
  const [filterFlow, setFilterFlow] = useState<"all" | "inflow" | "outflow">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMatched, setFilterMatched] = useState<"all" | "matched" | "unmatched">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    setLoading(true);
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
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter transactions
  const filteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      // 1. Pro vs Perso
      if (activeTab === "pro" && !tx.isPro) return false;
      if (activeTab === "perso" && tx.isPro) return false;

      // 2. Month Selector
      if (selectedMonth !== "all") {
        const txMonth = tx.date.substring(0, 7); // "2026-06"
        if (txMonth !== selectedMonth) return false;
      }

      // 3. Flow (Inflow / Outflow)
      if (filterFlow === "inflow" && tx.isOutflow) return false;
      if (filterFlow === "outflow" && !tx.isOutflow) return false;

      // 4. Category
      if (filterCategory !== "all" && tx.category !== filterCategory) return false;

      // 5. Matched invoice status
      if (filterMatched === "matched" && !tx.matchedInvoice) return false;
      if (filterMatched === "unmatched" && (tx.matchedInvoice || tx.noJustificatif)) return false;

      // 6. Search query (magnifying glass)
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesLabel = tx.label.toLowerCase().includes(query);
        const matchesInvoiceLabel = tx.matchedInvoice?.label?.toLowerCase().includes(query) || false;
        const matchesFilename = tx.matchedInvoice?.filename?.toLowerCase().includes(query) || false;
        if (!matchesLabel && !matchesInvoiceLabel && !matchesFilename) return false;
      }

      return true;
    });
  }, [transactions, activeTab, selectedMonth, filterFlow, filterCategory, filterMatched, searchQuery]);

  // Extract unique months for select dropdown
  const uniqueMonths = useMemo(() => {
    return Array.from(
      new Set(
        transactions
          .filter(tx => (activeTab === "pro" ? tx.isPro : !tx.isPro))
          .map(tx => tx.date.substring(0, 7))
      )
    ).sort((a, b) => b.localeCompare(a));
  }, [transactions, activeTab]);

  // Group by Month first, then by Day
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
          matchingRate: 100,
          groupedByDate: {},
          sortedDates: []
        };
      }
      
      const g = groups[monthKey];
      g.transactions.push(tx);
      
      if (tx.isOutflow) {
        g.outflows += Math.abs(tx.amount);
        if (!tx.noJustificatif) {
          g.totalOutflowCount++;
          if (tx.matchedInvoice) {
            g.matchedCount++;
          }
        }
      } else {
        g.inflows += tx.amount;
      }
      
      if (!g.groupedByDate[tx.date]) {
        g.groupedByDate[tx.date] = [];
      }
      g.groupedByDate[tx.date].push(tx);
    });
    
    const sortedMonthKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    sortedMonthKeys.forEach(mKey => {
      const g = groups[mKey];
      g.net = g.inflows - g.outflows;
      g.matchingRate = g.totalOutflowCount > 0 ? Math.round((g.matchedCount / g.totalOutflowCount) * 100) : 100;
      g.sortedDates = Object.keys(g.groupedByDate).sort((a, b) => b.localeCompare(a));
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
    const totalOutflowCount = filteredTxs.filter(tx => tx.isOutflow && !tx.noJustificatif).length;
    const matchedOutflowCount = filteredTxs.filter(tx => tx.isOutflow && !tx.noJustificatif && tx.matchedInvoice).length;
    return totalOutflowCount > 0 ? Math.round((matchedOutflowCount / totalOutflowCount) * 100) : 100;
  }, [filteredTxs]);

  // Toggle Month Accordion
  const isExpanded = (monthKey: string) => {
    return expandedMonths[monthKey] !== false; // Default to true
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: prev[monthKey] === false
    }));
  };

  // Formatter helpers
  const formatAmount = (num: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR"
    }).format(num);
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
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

  return (
    <main className="min-h-screen bg-[#FDFBEF] text-[#1E2A33] p-4 sm:p-6 lg:p-8 font-sans relative overflow-hidden">
      {/* TDT Grid Background Effect */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 z-0"></div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-[#1E2A33]/10">
          <div className="flex items-start gap-3">
            <Link
              href="/comptabilite"
              className="p-2 hover:bg-[#1E2A33]/5 rounded-xl transition-all border border-[#1E2A33]/5 text-[#1E2A33]/70 shrink-0 mt-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl lg:text-4xl font-bebas tracking-wide text-[#1E2A33] leading-tight break-words">
                RELEVÉ BANCAIRE <span className="text-[#AE7D5C]">/ TRANSACTIONS & RAPPROCHEMENT</span>
              </h1>
              <p className="font-roboto font-light text-xs text-[#1E2A33]/60 mt-0.5">
                Vue mensuelle et quotidienne simplifiée des mouvements et justificatifs
              </p>
            </div>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white ring-1 ring-[#1E2A33]/5 hover:bg-[#FDFBEF] rounded-xl text-xs font-semibold shadow-sm transition-all shrink-0 self-end md:self-auto"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>

        {/* Bank Balances Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-white/40 backdrop-blur-sm p-3 rounded-2xl border border-[#1E2A33]/5">
          {bankAccounts
            .filter(acc => (activeTab === "pro" ? acc.isPro : !acc.isPro))
            .slice(0, 4)
            .map((acc, idx) => (
              <div key={idx} className="bg-white p-3 rounded-xl border border-[#1E2A33]/5 shadow-sm">
                <span className="text-[10px] uppercase font-bold text-[#1E2A33]/50 block truncate">
                  {acc.name}
                </span>
                <span className="text-lg font-bebas tracking-wider text-[#1E2A33] block mt-0.5">
                  {formatAmount(acc.balance)}
                </span>
              </div>
            ))}
        </div>

        {/* Switcher & Search Bar */}
        <div className="flex flex-col xl:flex-row justify-between gap-4">
          <div className="flex bg-white/60 p-1.5 rounded-2xl border border-[#1E2A33]/5 w-full sm:w-fit gap-1.5 shadow-inner">
            <button
              onClick={() => {
                setActiveTab("pro");
                setSelectedMonth("all");
              }}
              className={`flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex-1 sm:flex-initial ${
                activeTab === "pro"
                  ? "bg-[#1E2A33] text-white shadow-md shadow-[#1E2A33]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              <Building2 className="w-4 h-4" />
              COMPTE PRO
            </button>
            <button
              onClick={() => {
                setActiveTab("perso");
                setSelectedMonth("all");
              }}
              className={`flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex-1 sm:flex-initial ${
                activeTab === "perso"
                  ? "bg-[#AE7D5C] text-white shadow-md shadow-[#AE7D5C]/20"
                  : "text-[#1E2A33]/60 hover:text-[#1E2A33]"
              }`}
            >
              <User2 className="w-4 h-4" />
              COMPTE PERSO
            </button>
          </div>

          {/* Search Input (Loupe) */}
          <div className="flex items-center gap-2 bg-[#FDFBEF] border border-[#1E2A33]/10 rounded-xl px-3 py-2 w-full xl:w-64">
            <Search className="w-4 h-4 text-[#1E2A33]/50 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher par fournisseur..."
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

        {/* Synthese Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#1E2A33]/5 shadow-sm relative overflow-hidden group">
            <span className="text-[10px] uppercase font-bold text-[#1E2A33]/50 block">Entrées</span>
            <span className="text-xl sm:text-2xl lg:text-3xl font-bebas tracking-wider text-emerald-600 block mt-2">
              {formatAmount(totalInflows)}
            </span>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#1E2A33]/5 shadow-sm relative overflow-hidden group">
            <span className="text-[10px] uppercase font-bold text-[#1E2A33]/50 block">Sorties</span>
            <span className="text-xl sm:text-2xl lg:text-3xl font-bebas tracking-wider text-rose-600 block mt-2">
              {formatAmount(totalOutflows)}
            </span>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#1E2A33]/5 shadow-sm relative overflow-hidden group">
            <span className="text-[10px] uppercase font-bold text-[#1E2A33]/50 block">Solde Net</span>
            <span className={`text-xl sm:text-2xl lg:text-3xl font-bebas tracking-wider block mt-2 ${netBalance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatAmount(netBalance)}
            </span>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#1E2A33]/5 shadow-sm relative overflow-hidden group col-span-2 lg:col-span-1">
            <span className="text-[10px] uppercase font-bold text-[#1E2A33]/50 block">Rapprochement Global</span>
            <span className="text-xl sm:text-2xl lg:text-3xl font-bebas tracking-wider text-[#AE7D5C] block mt-2">
              {globalMatchingRate} %
            </span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white border border-[#1E2A33]/10 p-4 rounded-2xl shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row lg:flex-wrap lg:items-center gap-3 w-full">

            {/* Month Filter */}
            <div className="flex items-center gap-2 bg-[#FDFBEF] border border-[#1E2A33]/10 rounded-xl px-3 py-2 w-full lg:w-auto">
              <Calendar className="w-4 h-4 text-[#1E2A33]/50 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-semibold text-[#1E2A33] border-none outline-none cursor-pointer w-full lg:w-auto"
              >
                <option value="all">Tous les mois</option>
                {uniqueMonths.map(m => (
                  <option key={m} value={m}>
                    {new Date(`${m}-02`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  </option>
                ))}
              </select>
            </div>

            {/* Inflow/Outflow Filter */}
            <div className="flex items-center gap-1 bg-[#FDFBEF] border border-[#1E2A33]/10 p-1 rounded-xl w-full lg:w-auto">
              <button
                onClick={() => setFilterFlow("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 lg:flex-none text-center cursor-pointer ${filterFlow === "all" ? "bg-[#1E2A33] text-white" : "text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
              >
                Tout
              </button>
              <button
                onClick={() => setFilterFlow("inflow")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 lg:flex-none text-center cursor-pointer ${filterFlow === "inflow" ? "bg-emerald-600 text-white" : "text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
              >
                Entrées
              </button>
              <button
                onClick={() => setFilterFlow("outflow")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 lg:flex-none text-center cursor-pointer ${filterFlow === "outflow" ? "bg-rose-600 text-white" : "text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
              >
                Sorties
              </button>
            </div>

            {/* Payment Category Filter */}
            <div className="flex items-center gap-2 bg-[#FDFBEF] border border-[#1E2A33]/10 rounded-xl px-3 py-2 w-full lg:w-auto">
              <Filter className="w-4 h-4 text-[#1E2A33]/50 shrink-0" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-transparent text-xs font-semibold text-[#1E2A33] border-none outline-none cursor-pointer w-full lg:w-auto"
              >
                <option value="all">Tous les types</option>
                <option value="card">Cartes Bancaires</option>
                <option value="direct_debit">Prélèvements</option>
                <option value="transfer">Virements</option>
                <option value="other">Autres</option>
              </select>
            </div>

            {/* Matched Filter */}
            <div className="flex items-center gap-1 bg-[#FDFBEF] border border-[#1E2A33]/10 p-1 rounded-xl w-full lg:w-auto">
              <button
                onClick={() => setFilterMatched("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 lg:flex-none text-center cursor-pointer ${filterMatched === "all" ? "bg-[#1E2A33] text-white" : "text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
              >
                Tous
              </button>
              <button
                onClick={() => setFilterMatched("matched")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 lg:flex-none text-center cursor-pointer ${filterMatched === "matched" ? "bg-emerald-600 text-white" : "text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
              >
                Rapprochés
              </button>
              <button
                onClick={() => setFilterMatched("unmatched")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 lg:flex-none text-center cursor-pointer ${filterMatched === "unmatched" ? "bg-amber-600 text-white" : "text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
              >
                À rapprocher
              </button>
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
          <div className="space-y-6">
            {groupedByMonth.sortedMonthKeys.map(mKey => {
              const group = groupedByMonth.groups[mKey];
              const expanded = isExpanded(mKey);

              return (
                <div key={mKey} className="bg-white border border-[#1E2A33]/10 rounded-2xl overflow-hidden shadow-sm">
                  {/* Month Accordion Header */}
                  <button
                    onClick={() => toggleMonth(mKey)}
                    className="w-full flex flex-col md:flex-row md:items-center justify-between p-4 bg-[#1E2A33]/5 hover:bg-[#1E2A33]/10 transition-colors text-left gap-3 border-b border-[#1E2A33]/10"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronDown className={`w-5 h-5 text-[#AE7D5C] transition-transform shrink-0 ${expanded ? "" : "-rotate-90"}`} />
                      <span className="text-lg sm:text-xl font-bebas tracking-wider text-[#1E2A33] uppercase truncate">
                        {group.label}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-[#AE7D5C]/10 text-[#AE7D5C] rounded-lg shrink-0">
                        {group.transactions.length} tx
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-[#1E2A33]/70">
                      <span className="text-emerald-700">
                        + {formatAmount(group.inflows)}
                      </span>
                      <span className="text-rose-700">
                        - {formatAmount(group.outflows)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] ${group.net >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                        Solde : {group.net >= 0 ? "+" : ""}{formatAmount(group.net)}
                      </span>
                      <span className="text-[#AE7D5C] bg-[#AE7D5C]/10 px-2 py-0.5 rounded-lg text-[11px]">
                        Rapproché : {group.matchingRate}%
                      </span>
                    </div>
                  </button>

                  {/* Month Accordion Content */}
                  {expanded && (
                    <div className="p-4 space-y-6 bg-white">
                      {group.sortedDates.map(dateStr => {
                        const dayTxs = group.groupedByDate[dateStr];
                        const dayInflow = dayTxs.filter(tx => !tx.isOutflow).reduce((sum, tx) => sum + tx.amount, 0);
                        const dayOutflow = dayTxs.filter(tx => tx.isOutflow).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
                        const dayNet = dayInflow - dayOutflow;

                        return (
                          <div key={dateStr} className="space-y-2">
                            {/* Daily Header */}
                            <div className="flex justify-between items-center px-4 py-1.5 bg-[#1E2A33]/5 rounded-xl border border-[#1E2A33]/5">
                              <span className="text-[10px] sm:text-xs font-bold text-[#1E2A33]/70 uppercase tracking-wider">
                                {formatDateLabel(dateStr)}
                              </span>
                              <span className={`text-[10px] sm:text-xs font-extrabold px-2 py-0.5 rounded-lg ${dayNet >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                {dayNet >= 0 ? "+" : ""}{formatAmount(dayNet)}
                              </span>
                            </div>

                            {/* Day's Transactions list */}
                            <div className="border border-[#1E2A33]/10 rounded-2xl overflow-hidden divide-y divide-[#1E2A33]/5">
                              {dayTxs.map(tx => {
                                const badgeInfo = getCategoryBadge(tx.category);

                                return (
                                  <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 sm:gap-4 hover:bg-[#FDFBEF]/25 transition-colors">
                                    <div className="flex items-start gap-3 min-w-0">
                                      {/* Payment Icon */}
                                      <div className="p-2 bg-[#FDFBEF] border border-[#1E2A33]/10 rounded-xl shrink-0 mt-0.5">
                                        {badgeInfo.icon}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <span className="text-xs sm:text-sm font-semibold text-[#1E2A33] block leading-snug break-words">
                                          {tx.label}
                                        </span>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] font-medium text-[#1E2A33]/50">
                                          <span>{tx.bankAccountName}</span>
                                          <span>•</span>
                                          <span>{badgeInfo.label}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-none pt-2.5 sm:pt-0">
                                      {/* Rapprochement Badge */}
                                      <div className="min-w-0">
                                        {tx.matchedInvoice ? (
                                          <a
                                            href={tx.matchedInvoice.publicFileUrl || "#"}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all truncate max-w-[150px]"
                                            title={tx.matchedInvoice.filename}
                                          >
                                            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                            Rapproché
                                            <FileText className="w-3 h-3 ml-0.5 shrink-0" />
                                          </a>
                                        ) : tx.noJustificatif ? (
                                          <span className="flex items-center gap-1.5 text-slate-500 bg-slate-100/50 border border-slate-200/50 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                            Sans justificatif
                                          </span>
                                        ) : tx.isOutflow ? (
                                          <span className="flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200/50 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                            À rapprocher
                                          </span>
                                        ) : (
                                          <span className="text-[9px] text-[#1E2A33]/30 font-medium italic">
                                            Sans justificatif requis
                                          </span>
                                        )}
                                      </div>

                                      {/* Amount */}
                                      <span className={`text-base sm:text-lg font-bebas tracking-wider whitespace-nowrap ${tx.isOutflow ? "text-rose-600" : "text-emerald-600"}`}>
                                        {tx.isOutflow ? "-" : "+"}{formatAmount(tx.absAmount)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
