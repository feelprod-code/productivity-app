"use client";

import React, { useEffect, useState } from "react";
import { 
    ReceiptEuro, 
    Printer, 
    Bot, 
    TrendingUp, 
    ShieldCheck, 
    Wifi, 
    Sparkles, 
    ArrowLeft, 
    CreditCard, 
    FileText,
    Search,
    X
} from "lucide-react";

interface OutflowItem {
    id: string;
    category: "charges" | "fixes" | "tech";
    provider: string;
    amount: number;
    currency: string;
    frequency: string;
    lastPaymentDate: string;
    status: string;
    bankAccount?: string;
    description: string;
    details?: { month?: string; period?: string; amount: number }[];
}

export default function RegularOutflowsPage() {
    const [outflows, setOutflows] = useState<OutflowItem[]>([]);
    const [variations, setVariations] = useState<any[]>([]);
    const [variationProviders, setVariationProviders] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"all" | "charges" | "fixes" | "tech" | "personal">("all");
    const [selectedAccount, setSelectedAccount] = useState<"all" | "6300" | "47827">("all");
    const [searchQuery, setSearchQuery] = useState("");
    
    const [personalTransactions, setPersonalTransactions] = useState<any[]>([]);
    const [loadingPersonal, setLoadingPersonal] = useState(false);

    useEffect(() => {
        async function loadData() {
            try {
                const res = await fetch("/api/invoices/regular-outflows");
                if (res.ok) {
                    const data = await res.json();
                    setOutflows(data.outflows || []);
                    setVariations(data.variations || []);
                    setVariationProviders(data.variationProviders || []);
                }
            } catch (err) {
                console.error("Failed to load regular outflows:", err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    useEffect(() => {
        if (activeTab === "personal" && personalTransactions.length === 0) {
            setLoadingPersonal(true);
            fetch("/api/transactions/personal-review")
                .then(res => res.json())
                .then(data => {
                    setPersonalTransactions(data.transactions || []);
                })
                .catch(err => console.error("Error loading personal review transactions:", err))
                .finally(() => setLoadingPersonal(false));
        }
    }, [activeTab, personalTransactions.length]);

    // Filter items based on category, bank account, and search query
    const filteredOutflows = outflows.filter(item => {
        const matchesCategory = activeTab === "all" || item.category === activeTab;
        const matchesAccount = selectedAccount === "all" || item.bankAccount?.includes(selectedAccount);
        
        let matchesSearch = true;
        if (searchQuery.trim() !== "") {
            const query = searchQuery.toLowerCase();
            const matchesProvider = item.provider.toLowerCase().includes(query);
            const matchesDesc = item.description?.toLowerCase().includes(query) || false;
            matchesSearch = matchesProvider || matchesDesc;
        }
        
        return matchesCategory && matchesAccount && matchesSearch;
    });

    const filteredVariationProviders = variationProviders.filter(p => {
        if (searchQuery.trim() === "") return true;
        return p.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const filteredPersonalTransactions = personalTransactions.filter(tx => {
        if (searchQuery.trim() === "") return true;
        const query = searchQuery.toLowerCase();
        const matchesLabel = tx.label.toLowerCase().includes(query);
        const matchesReason = tx.flagReason?.toLowerCase().includes(query) || false;
        return matchesLabel || matchesReason;
    });

    // Calculate totals (excluding annual and cancelled items from monthly sums)
    const calculateMonthlyTotal = (items: OutflowItem[]) => {
        return items.reduce((sum, item) => {
            if (item.frequency.toLowerCase().includes("annuel") || item.status === "RÉSILIÉ") {
                return sum;
            }
            return sum + item.amount;
        }, 0);
    };

    const calculateAnnualTotal = (items: OutflowItem[]) => {
        return items.reduce((sum, item) => {
            if (!item.frequency.toLowerCase().includes("annuel") || item.status === "RÉSILIÉ") {
                return sum;
            }
            return sum + item.amount;
        }, 0);
    };

    // Responsive totals based on selected bank account
    const accountOutflows = outflows.filter(o => selectedAccount === "all" || o.bankAccount?.includes(selectedAccount));
    const monthlyTotalAll = calculateMonthlyTotal(accountOutflows);
    const monthlyTotalCharges = calculateMonthlyTotal(accountOutflows.filter(i => i.category === "charges"));
    const monthlyTotalFixes = calculateMonthlyTotal(accountOutflows.filter(i => i.category === "fixes"));
    const monthlyTotalTech = calculateMonthlyTotal(accountOutflows.filter(i => i.category === "tech"));

    // Pro vs Perso Monthly Outflows
    const monthlyTotalPro = calculateMonthlyTotal(outflows.filter(o => o.bankAccount?.includes("6300")));
    const monthlyTotalPerso = calculateMonthlyTotal(outflows.filter(o => o.bankAccount?.includes("47827")));
    const annualTotalAll = calculateAnnualTotal(accountOutflows);

    const renderTable = (items: OutflowItem[]) => {
        if (items.length === 0) {
            return (
                <div className="p-8 text-center text-xs font-roboto text-[#1E2A33]/40 bg-white border border-[#1E2A33]/10 rounded-2xl">
                    Aucune dépense dans cette catégorie pour le moment.
                </div>
            );
        }

        const getCategoryIcon = (category: string) => {
            switch (category) {
                case "charges":
                    return <ShieldCheck className="w-4 h-4 text-red-600 flex-shrink-0" />;
                case "fixes":
                    return <Wifi className="w-4 h-4 text-blue-600 flex-shrink-0" />;
                case "tech":
                    return <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0" />;
                default:
                    return <ReceiptEuro className="w-4 h-4 text-gray-600 flex-shrink-0" />;
            }
        };

        // Sort chronologically (monthly by day 1-31, annual by month/day of year)
        const sorted = [...items].sort((a, b) => {
            const dateA = new Date(a.lastPaymentDate);
            const dateB = new Date(b.lastPaymentDate);

            if (a.frequency.toLowerCase().includes("annuel")) {
                // Annual items: sort by month of the year, then by day
                if (dateA.getMonth() !== dateB.getMonth()) {
                    return dateA.getMonth() - dateB.getMonth();
                }
                return dateA.getDate() - dateB.getDate();
            }

            // Monthly items: sort strictly by day of the month (1-31)
            return dateA.getDate() - dateB.getDate();
        });

        return (
            <div className="bg-white border border-[#1E2A33]/10 rounded-2xl overflow-hidden shadow-sm print:shadow-none print:border-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse print:table">
                        <thead>
                            <tr className="bg-[#FDFBEF]/50 border-b border-[#1E2A33]/10 text-xs font-roboto font-medium text-[#1E2A33]/70 uppercase tracking-wider print:bg-gray-100 print:text-black">
                                <th className="px-6 py-4 print:px-2 print:py-2">Jour</th>
                                <th className="px-6 py-4 print:px-2 print:py-2">Dépense (Prestataire — Description)</th>
                                <th className="px-6 py-4 print:px-2 print:py-2">Compte</th>
                                <th className="px-6 py-4 print:px-2 print:py-2">Catégorie</th>
                                <th className="px-6 py-4 print:px-2 print:py-2">Montant</th>
                                <th className="px-6 py-4 print:px-2 print:py-2 print:hidden">Statut</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E2A33]/5 print:divide-y print:divide-gray-300">
                            {sorted.map((item) => {
                                const dateObj = new Date(item.lastPaymentDate);
                                const day = dateObj.getDate();
                                const isAnnual = item.frequency.toLowerCase().includes("annuel");
                                const dayLabel = isAnnual 
                                    ? `${day} ${dateObj.toLocaleDateString('fr-FR', { month: 'short' })}`
                                    : `Le ${day}`;

                                return (
                                    <tr key={item.id} className="hover:bg-[#FDFBEF]/20 transition-colors print:hover:bg-transparent">
                                        <td className="px-6 py-4 text-sm font-roboto font-medium text-[#AE7D5C] print:px-2 print:py-2 print:text-black whitespace-nowrap">
                                            {dayLabel}
                                        </td>
                                        <td className="px-6 py-4 print:px-2 print:py-2">
                                            <div className="flex items-center gap-2">
                                                <span className="print:hidden text-xs">{item.category === "tech" ? "💻" : item.category === "charges" ? "💼" : "🏠"}</span>
                                                <div className="font-roboto text-sm text-[#1E2A33] whitespace-nowrap overflow-hidden text-overflow-ellipsis max-w-[500px] flex items-center">
                                                    <span className="font-semibold">{item.provider}</span>
                                                    {item.description && (
                                                        <span className="text-xs text-[#1E2A33]/50 font-light ml-2 print:text-black/60 truncate">— {item.description}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-roboto font-semibold print:px-2 print:py-2 print:text-black whitespace-nowrap">
                                            {item.bankAccount?.includes("6300") ? (
                                                <span className="text-blue-800">Pro</span>
                                            ) : (
                                                <span className="text-[#AE7D5C]">Perso</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs font-roboto font-normal text-[#1E2A33]/70 print:px-2 print:py-2 print:text-black whitespace-nowrap">
                                            {item.category === "charges" && "Charges Pro"}
                                            {item.category === "fixes" && "Abonnement"}
                                            {item.category === "tech" && "Tech & IA"}
                                        </td>
                                        <td className="px-6 py-4 font-bebas text-lg text-[#1E2A33] print:px-2 print:py-2 print:font-bold print:text-sm whitespace-nowrap">
                                            {item.amount.toFixed(2)} {item.currency}
                                        </td>
                                        <td className="px-6 py-4 print:px-2 print:py-2 print:hidden whitespace-nowrap">
                                            <span className={`text-[10px] font-roboto font-medium px-2 py-0.5 rounded-md border ${
                                                item.status === "RÉSILIÉ" 
                                                    ? "text-red-700 bg-red-50 border-red-200/60" 
                                                    : "text-green-700 bg-green-50 border-green-200/60"
                                            }`}>
                                                {item.status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#FDFBEF] text-[#1E2A33]">
                <span className="loader mb-4 border-2 border-[#AE7D5C] border-t-transparent rounded-full w-8 h-8 animate-spin" />
                <p className="font-roboto text-sm">Chargement des échéanciers et abonnements...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FDFBEF] text-[#1E2A33] font-sans relative overflow-hidden pb-16 print:bg-white print:text-black print:pb-0">
            {/* TDT Grid Background Effect */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 z-0 print:hidden"></div>

            <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 print:px-0 print:py-4">
                
                {/* Back to Compta Button */}
                <div className="mb-6 print:hidden">
                    <a 
                        href="/comptabilite" 
                        className="inline-flex items-center gap-2 text-sm font-roboto font-medium text-[#AE7D5C] hover:underline"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Retour à la comptabilité
                    </a>
                </div>

                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-center border-b border-[#1E2A33]/10 pb-8 mb-10 print:mb-6 print:border-b-2 print:border-black">
                    <div className="text-center md:text-left mb-6 md:mb-0">
                        <h1 className="text-4xl md:text-5xl font-bebas tracking-wide text-[#1E2A33] print:text-3xl">
                            ÉCHÉANCIERS & SORTIES RÉGULIÈRES
                        </h1>
                        <p className="text-sm font-roboto font-light text-[#1E2A33]/60 print:text-xs print:text-black">
                            Suivi analytique des charges, abonnements et dépenses technologiques de l'activité.
                        </p>
                    </div>
                    
                    <button 
                        onClick={handlePrint}
                        className="print:hidden bg-[#1E2A33] text-[#FDFBEF] hover:bg-[#AE7D5C] transition-colors font-roboto font-medium text-sm px-5 py-3 rounded-full flex items-center gap-2 shadow-md cursor-pointer"
                    >
                        <Printer className="w-4 h-4" />
                        Exporter / Imprimer en PDF
                    </button>
                </div>

                {/* Print Title Banner */}
                <div className="hidden print:block mb-8 text-center bg-gray-100 p-4 rounded border border-gray-300">
                    <h2 className="text-xl font-bold font-roboto">BILAN ANNUEL DES DÉPENSES ET ABONNEMENTS - 2026</h2>
                    <p className="text-xs text-gray-600">Généré le {new Date().toLocaleDateString('fr-FR')} pour GUILLAUME PHILIPPE</p>
                </div>

                {/* Category Cards / Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 print:grid-cols-4 print:gap-4 print:mb-8">
                    
                    <div className="bg-white/75 backdrop-blur-md p-6 rounded-2xl border border-[#1E2A33]/10 shadow-sm print:bg-white print:border-gray-300">
                        <h3 className="text-xs font-roboto font-medium text-[#1E2A33]/50 uppercase tracking-wider print:text-black">
                            Total Mensuel Estimé
                        </h3>
                        <div className="text-3xl font-bebas text-[#AE7D5C] mt-2 print:text-2xl print:text-black">
                            {monthlyTotalAll.toFixed(2)} €
                        </div>
                        <p className="text-[10px] text-[#1E2A33]/60 mt-1 print:text-black">
                            {selectedAccount === "all" ? "Toutes les dépenses mensuelles" : selectedAccount === "6300" ? "Dépenses mensuelles Pro" : "Dépenses mensuelles Perso"}
                        </p>
                    </div>

                    <div className="bg-white/75 backdrop-blur-md p-6 rounded-2xl border border-[#1E2A33]/10 shadow-sm print:bg-white print:border-gray-300">
                        <h3 className="text-xs font-roboto font-medium text-[#1E2A33]/50 uppercase tracking-wider print:text-black">
                            Compte Pro (6300)
                        </h3>
                        <div className="text-3xl font-bebas text-blue-800 mt-2 print:text-2xl">
                            {monthlyTotalPro.toFixed(2)} €
                        </div>
                        <p className="text-[10px] text-[#1E2A33]/60 mt-1 print:text-black">
                            Dépenses pro (URSSAF, loyer, tech, etc.)
                        </p>
                    </div>

                    <div className="bg-white/75 backdrop-blur-md p-6 rounded-2xl border border-[#1E2A33]/10 shadow-sm print:bg-white print:border-gray-300">
                        <h3 className="text-xs font-roboto font-medium text-[#1E2A33]/50 uppercase tracking-wider print:text-black">
                            Compte Perso (47827)
                        </h3>
                        <div className="text-3xl font-bebas text-[#AE7D5C] mt-2 print:text-2xl">
                            {monthlyTotalPerso.toFixed(2)} €
                        </div>
                        <p className="text-[10px] text-[#1E2A33]/60 mt-1 print:text-black">
                            Dépenses perso (Canal Plus, etc.)
                        </p>
                    </div>

                    <div className="bg-white/75 backdrop-blur-md p-6 rounded-2xl border border-[#1E2A33]/10 shadow-sm print:bg-white print:border-gray-300">
                        <h3 className="text-xs font-roboto font-medium text-[#1E2A33]/50 uppercase tracking-wider print:text-black">
                            Dépenses Annuelles
                        </h3>
                        <div className="text-3xl font-bebas text-[#1E2A33] mt-2 print:text-2xl">
                            {annualTotalAll.toFixed(2)} €
                        </div>
                        <p className="text-[10px] text-[#1E2A33]/60 mt-1 print:text-black">
                            Facturées à l'année (Suno, CFE, MAIF, etc.)
                        </p>
                    </div>
                </div>

                {/* Bank Account Selector & Search Input */}
                <div className="flex flex-col xl:flex-row justify-between gap-4 mb-8 print:hidden">
                    <div className="flex flex-wrap items-center gap-2 bg-[#1E2A33]/5 p-1.5 rounded-xl border border-[#1E2A33]/5 w-fit">
                        <span className="text-xs font-roboto font-semibold text-[#1E2A33]/50 px-3 uppercase tracking-wider">Compte bancaire :</span>
                        <button 
                            onClick={() => setSelectedAccount("all")}
                            className={`px-4 py-2 text-xs font-roboto font-semibold rounded-lg cursor-pointer transition-all ${selectedAccount === "all" ? "bg-[#1E2A33] text-[#FDFBEF] shadow-sm" : "bg-transparent text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
                        >
                            Tous les comptes
                        </button>
                        <button 
                            onClick={() => setSelectedAccount("6300")}
                            className={`px-4 py-2 text-xs font-roboto font-semibold rounded-lg cursor-pointer transition-all ${selectedAccount === "6300" ? "bg-blue-800 text-[#FDFBEF] shadow-sm" : "bg-transparent text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
                        >
                            Compte Pro (6300)
                        </button>
                        <button 
                            onClick={() => setSelectedAccount("47827")}
                            className={`px-4 py-2 text-xs font-roboto font-semibold rounded-lg cursor-pointer transition-all ${selectedAccount === "47827" ? "bg-[#AE7D5C] text-[#FDFBEF] shadow-sm" : "bg-transparent text-[#1E2A33]/60 hover:text-[#1E2A33]"}`}
                        >
                            Compte Perso (47827)
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

                {/* Navigation Tabs */}
                <div className="flex flex-wrap border-b border-[#1E2A33]/10 mb-8 gap-4 print:hidden">
                    <button 
                        onClick={() => setActiveTab("all")}
                        className={`pb-4 text-sm font-roboto font-medium tracking-wide border-b-2 cursor-pointer transition-colors ${activeTab === "all" ? "border-[#AE7D5C] text-[#AE7D5C]" : "border-transparent text-[#1E2A33]/50 hover:text-[#1E2A33]"}`}
                    >
                        Toutes ({outflows.length}) <span className="ml-1 text-xs opacity-75">({monthlyTotalAll.toFixed(0)} €/m)</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab("charges")}
                        className={`pb-4 text-sm font-roboto font-medium tracking-wide border-b-2 cursor-pointer transition-colors ${activeTab === "charges" ? "border-[#AE7D5C] text-[#AE7D5C]" : "border-transparent text-[#1E2A33]/50 hover:text-[#1E2A33]"}`}
                    >
                        Charges ({outflows.filter(o => o.category === "charges").length}) <span className="ml-1 text-xs opacity-75">({monthlyTotalCharges.toFixed(0)} €/m)</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab("fixes")}
                        className={`pb-4 text-sm font-roboto font-medium tracking-wide border-b-2 cursor-pointer transition-colors ${activeTab === "fixes" ? "border-[#AE7D5C] text-[#AE7D5C]" : "border-transparent text-[#1E2A33]/50 hover:text-[#1E2A33]"}`}
                    >
                        Fixes ({outflows.filter(o => o.category === "fixes").length}) <span className="ml-1 text-xs opacity-75">({monthlyTotalFixes.toFixed(0)} €/m)</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab("tech")}
                        className={`pb-4 text-sm font-roboto font-medium tracking-wide border-b-2 cursor-pointer transition-colors ${activeTab === "tech" ? "border-[#AE7D5C] text-[#AE7D5C]" : "border-transparent text-[#1E2A33]/50 hover:text-[#1E2A33]"}`}
                    >
                        Tech & IA ({outflows.filter(o => o.category === "tech").length}) <span className="ml-1 text-xs opacity-75">({monthlyTotalTech.toFixed(0)} €/m)</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab("personal")}
                        className={`pb-4 text-sm font-roboto font-medium tracking-wide border-b-2 cursor-pointer transition-colors ${activeTab === "personal" ? "border-[#AE7D5C] text-[#AE7D5C]" : "border-transparent text-[#1E2A33]/50 hover:text-[#1E2A33]"}`}
                    >
                        Perso sur Pro ⚠️
                    </button>
                </div>

                {/* Double Table Layout: Annual above, Monthly below */}
                {activeTab !== "personal" && (
                    <div className="space-y-12">
                        
                        {/* 1. Annual Outflows (Render only if there are annual items in the current selection) */}
                        {filteredOutflows.some(o => o.frequency.toLowerCase().includes("annuel")) && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-[#1E2A33]/10 pb-2">
                                    <h2 className="text-xl font-bebas tracking-wide text-[#AE7D5C] flex items-center gap-2">
                                        <span>📅 ABONNEMENTS & DÉPENSES ANNUELLES</span>
                                    </h2>
                                    <span className="text-xs font-roboto font-normal text-amber-800 bg-amber-50 border border-amber-200/50 px-2.5 py-0.5 rounded-full">
                                        Débités une fois par an
                                    </span>
                                </div>
                                {renderTable(filteredOutflows.filter(o => o.frequency.toLowerCase().includes("annuel")))}
                            </div>
                        )}

                        {/* 2. Monthly Outflows */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-[#1E2A33]/10 pb-2">
                                <h2 className="text-xl font-bebas tracking-wide text-[#1E2A33] flex items-center gap-2">
                                    <span>💳 DÉPENSES & ABONNEMENTS MENSUELS</span>
                                </h2>
                                <span className="text-xs font-roboto font-normal text-[#1E2A33]/60">
                                    Dépenses récurrentes chaque mois
                                </span>
                            </div>
                            {renderTable(filteredOutflows.filter(o => !o.frequency.toLowerCase().includes("annuel")))}
                        </div>

                        {/* 3. Monthly Variations (Tech & variable services) */}
                        {(activeTab === "all" || activeTab === "tech") && variations.length > 0 && (
                            <div className="space-y-4 pt-6">
                                <div className="flex items-center justify-between border-b border-[#1E2A33]/10 pb-2">
                                    <h2 className="text-xl font-bebas tracking-wide text-[#AE7D5C] flex items-center gap-2">
                                        <span>📊 HISTORIQUE DES VARIATIONS & DÉPASSEMENTS (2026)</span>
                                    </h2>
                                    <span className="text-xs font-roboto font-normal text-[#1E2A33]/60">
                                        Consommation réelle mensuelle par prestataire
                                    </span>
                                </div>
                                <div className="bg-white border border-[#1E2A33]/10 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-[#FDFBEF]/50 border-b border-[#1E2A33]/10 text-xs font-roboto font-medium text-[#1E2A33]/70 uppercase tracking-wider">
                                                    <th className="px-6 py-4">Mois</th>
                                                    {filteredVariationProviders.map(p => (
                                                        <th key={p} className="px-6 py-4 text-right">{p}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#1E2A33]/5">
                                                {variations.map((v, i) => (
                                                    <tr key={i} className="hover:bg-[#FDFBEF]/20 transition-colors">
                                                        <td className="px-6 py-4 text-sm font-roboto font-semibold text-[#AE7D5C] whitespace-nowrap">
                                                            {v.month}
                                                        </td>
                                                        {filteredVariationProviders.map(p => {
                                                            const val = v[p];
                                                            return (
                                                                <td key={p} className="px-6 py-4 text-sm font-mono text-[#1E2A33] text-right whitespace-nowrap">
                                                                    {val > 0 ? `${val.toFixed(2)} €` : <span className="text-[#1E2A33]/30">—</span>}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/* 4. Personal Transactions Review Panel */}
                {activeTab === "personal" && (
                    <div className="space-y-6">
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4">
                            <span className="text-2xl">⚠️</span>
                            <div>
                                <h3 className="font-bebas text-lg tracking-wide text-amber-900">
                                    Dépenses personnelles détectées sur vos comptes professionnels (depuis Janvier 2026)
                                </h3>
                                <p className="text-xs font-roboto text-amber-800/80 mt-1 leading-relaxed">
                                    Ces transactions ont été effectuées avec vos moyens de paiement professionnels mais correspondent à des motifs personnels (Canal+, supermarchés, vêtements, etc.). Pour que votre comptabilité soit propre, vous devez les <strong>pointer comme dépenses personnelles (compte 108000)</strong> directement sur Pennylane.
                                </p>
                            </div>
                        </div>

                        {loadingPersonal ? (
                            <div className="text-center py-12">
                                <span className="inline-block animate-spin text-2xl text-[#AE7D5C]">⏳</span>
                                <p className="text-xs font-roboto text-[#1E2A33]/60 mt-2">Chargement des transactions depuis Pennylane...</p>
                            </div>
                        ) : personalTransactions.length === 0 ? (
                            <div className="bg-white border border-[#1E2A33]/10 rounded-2xl p-12 text-center">
                                <span className="text-4xl">🎉</span>
                                <h3 className="font-bebas text-lg text-[#1E2A33] mt-4">Aucune dépense personnelle détectée</h3>
                                <p className="text-xs font-roboto text-[#1E2A33]/60 mt-1">Félicitations, toutes vos dépenses pro semblent propres ou déjà traitées !</p>
                            </div>
                        ) : (
                            <div className="bg-white border border-[#1E2A33]/10 rounded-2xl overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-[#FDFBEF]/50 border-b border-[#1E2A33]/10 text-xs font-roboto font-medium text-[#1E2A33]/70 uppercase tracking-wider">
                                                <th className="px-6 py-4">Date</th>
                                                <th className="px-6 py-4">Compte</th>
                                                <th className="px-6 py-4">Transaction</th>
                                                <th className="px-6 py-4">Statut</th>
                                                <th className="px-6 py-4 text-right">Montant</th>
                                                <th className="px-6 py-4 text-center">Actions Pennylane</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#1E2A33]/5 text-xs font-roboto">
                                            {filteredPersonalTransactions.map((tx) => (
                                                <tr key={tx.id} className="hover:bg-[#FDFBEF]/20 transition-colors">
                                                    <td className="px-6 py-4 font-semibold text-[#1E2A33]/70 whitespace-nowrap">
                                                        {new Date(tx.date).toLocaleDateString('fr-FR')}
                                                    </td>
                                                    <td className="px-6 py-4 text-[#1E2A33]/50 whitespace-nowrap">
                                                        {tx.bankAccountName}
                                                    </td>
                                                    <td className="px-6 py-4 font-medium text-[#1E2A33] font-mono select-all">
                                                        {tx.label}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                                                            tx.alreadyExploitant 
                                                                ? 'bg-green-50 text-green-700 border border-green-200' 
                                                                : 'bg-red-50 text-red-700 border border-red-200'
                                                        }`}>
                                                            {tx.flagReason}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-semibold text-[#1E2A33] font-mono whitespace-nowrap">
                                                        -{tx.amount.toFixed(2)} €
                                                    </td>
                                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                                        <div className="inline-flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(tx.label);
                                                                    alert("Libellé copié ! Ouvrez Pennylane et collez-le dans la recherche pour la retrouver instantanément.");
                                                                }}
                                                                className="px-2.5 py-1 text-[10px] font-semibold bg-[#1E2A33]/5 hover:bg-[#1E2A33]/10 text-[#1E2A33] rounded transition-all cursor-pointer"
                                                            >
                                                                Copier Libellé
                                                            </button>
                                                            <a
                                                                href="https://app.pennylane.com/transactions"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="px-2.5 py-1 text-[10px] font-semibold bg-[#AE7D5C] hover:bg-[#966b4d] text-white rounded transition-all cursor-pointer"
                                                            >
                                                                Ouvrir Pennylane
                                                            </a>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Detailed Schedules & Calendars */}
                {(activeTab === "charges" || activeTab === "all") && (
                    <div className="mt-16 space-y-12 print:mt-10 page-break-before">
                        
                        {/* Section Header */}
                        <div className="border-b border-[#1E2A33]/10 pb-4">
                            <h2 className="text-3xl font-bebas tracking-wide text-[#1E2A33] flex items-center gap-3 print:text-xl">
                                <FileText className="w-6 h-6 text-[#AE7D5C]" />
                                ÉCHÉANCIERS DÉTAILLÉS & PLANIFICATION
                            </h2>
                            <p className="text-xs font-roboto font-light text-[#1E2A33]/60 mt-1 print:text-black">
                                Répartition mensuelle des dépenses et calendrier des abonnements annuels.
                            </p>
                        </div>

                        {/* URSSAF & CARPIMKO Grids */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:grid-cols-1 print:gap-6">
                            
                            {/* URSSAF Grid */}
                            <div className="bg-white p-6 rounded-2xl border border-[#1E2A33]/10 shadow-sm print:border-gray-300">
                                <h3 className="text-lg font-bebas tracking-wide text-[#AE7D5C] mb-4 flex items-center gap-2">
                                    <span>📈 Échéancier URSSAF 2026</span>
                                </h3>
                                <div className="grid grid-cols-3 gap-3">
                                    {outflows.find(o => o.id === "urssaf-2026")?.details?.map((u: any) => (
                                        <div key={u.month} className="bg-[#FDFBEF]/40 p-3 rounded-lg border border-[#1E2A33]/5 text-center">
                                            <div className="text-[10px] font-roboto font-medium text-[#1E2A33]/60">{u.month}</div>
                                            <div className="text-lg font-bebas text-[#1E2A33] mt-0.5">{u.amount.toFixed(0)} €</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* CARPIMKO Grid */}
                            <div className="bg-white p-6 rounded-2xl border border-[#1E2A33]/10 shadow-sm print:border-gray-300">
                                <h3 className="text-lg font-bebas tracking-wide text-[#AE7D5C] mb-4 flex items-center gap-2">
                                    <span>🏥 Échéancier CARPIMKO 2026 (Estimé)</span>
                                </h3>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { month: "Janvier", amount: 520 },
                                        { month: "Février", amount: 520 },
                                        { month: "Mars", amount: 520 },
                                        { month: "Avril", amount: 520 },
                                        { month: "Mai", amount: 520 },
                                        { month: "Juin", amount: 520 },
                                        { month: "Juillet", amount: 520 },
                                        { month: "Août", amount: 520 },
                                        { month: "Septembre", amount: 520 },
                                        { month: "Octobre", amount: 520 },
                                        { month: "Novembre", amount: 520 },
                                        { month: "Décembre", amount: 520 }
                                    ].map((c) => (
                                        <div key={c.month} className="bg-[#FDFBEF]/40 p-3 rounded-lg border border-[#1E2A33]/5 text-center">
                                            <div className="text-[10px] font-roboto font-medium text-[#1E2A33]/60">{c.month}</div>
                                            <div className="text-lg font-bebas text-[#1E2A33] mt-0.5">{c.amount.toFixed(0)} €</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>

                        {/* Annual Subscriptions Calendar Timeline */}
                        <div className="bg-white p-6 rounded-2xl border border-[#1E2A33]/10 shadow-sm print:border-gray-300">
                            <h3 className="text-lg font-bebas tracking-wide text-[#AE7D5C] mb-6">
                                📅 Calendrier Annuel des Prélèvements (Abonnements & Impôts)
                            </h3>
                            <div className="relative border-l-2 border-[#AE7D5C]/30 ml-4 space-y-8 py-2">
                                {[
                                    { month: "Février", items: [{ name: "Zapier", amount: 248.65, desc: "Automations" }] },
                                    { month: "Mars", items: [{ name: "Ausha", amount: 288.00, desc: "Podcast Hosting" }, { name: "Impôts (CFE)", amount: 470.00, desc: "Taxe annuelle" }] },
                                    { month: "Mai", items: [{ name: "Suno AI", amount: 345.60, desc: "Musique IA" }, { name: "Higgsfield AI", amount: 96.95, desc: "Vidéo IA" }] },
                                    { month: "Juin", items: [{ name: "ACE Studio", amount: 264.00, desc: "Chant & Voix IA" }] },
                                    { month: "Novembre", items: [{ name: "Krotos Studio", amount: 194.99, desc: "Design Sonore" }] }
                                ].map((cal) => (
                                    <div key={cal.month} className="relative pl-6">
                                        {/* Timeline node dot */}
                                        <div className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-[#AE7D5C] border-2 border-white shadow-sm"></div>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                                            <span className="font-bebas text-lg text-[#1E2A33] tracking-wide">{cal.month}</span>
                                            <div className="flex flex-wrap gap-2 mt-1 sm:mt-0">
                                                {cal.items.map((it) => (
                                                    <span key={it.name} className="inline-flex items-center gap-1.5 text-xs font-roboto bg-[#FDFBEF] text-[#1E2A33] border border-[#1E2A33]/10 px-3 py-1 rounded-full">
                                                        <span className="font-medium">{it.name}</span>
                                                        <span className="text-[#AE7D5C] font-semibold">{it.amount.toFixed(2)} €</span>
                                                        <span className="text-[10px] text-gray-500 font-light">({it.desc})</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                )}

                {/* Print Footer */}
                <div className="hidden print:block mt-16 text-center text-xs text-gray-500 border-t border-gray-300 pt-4">
                    <p>Ce document administratif est fourni à titre indicatif pour le lettrage comptable de l'année 2026.</p>
                </div>

            </div>
        </div>
    );
}
