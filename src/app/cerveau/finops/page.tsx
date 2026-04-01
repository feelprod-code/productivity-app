import React from "react";
import { Server, Database, Globe, Cpu, CreditCard, Activity, Video, Bot, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { FinOpsChart } from "@/components/finops/FinOpsChart";
import { InvoiceUploader } from "@/components/finops/InvoiceUploader";

import { prisma } from "@/lib/prisma";

export const metadata = {
    title: "FinOps - Mission TDT",
    description: "Analyse des coûts de l'écosystème TDT",
};

export default async function FinOpsPage() {
    const [expenses, invoices] = await Promise.all([
        // @ts-ignore
        prisma.expense.findMany({ orderBy: { date: 'asc' } }),
        // @ts-ignore
        prisma.invoice.findMany({ orderBy: { date: 'asc' } })
    ]);

    // 1. Filtrer uniquement les prestataires d'infrastructure, de logiciels, d'IA, et autres services "FinOps" (exclut SumUp, Via Sana, compta classique)
    const softwareProviders = [
        'vercel', 'supabase', 'cloudflare', 'modal', 'aws', 'google', 'azure',
        'openai', 'anthropic', 'openrouter', 'hugging', 'replicate', 'elevenlabs',
        'deepgram', 'stripe', 'twilio', 'sendgrid', 'postmark', 'zapier', 'canva', 'notion', 'hiffsfiekd', 'canvas', 'netlify', 'github', 'gitlab', 'render', 'railway'
    ];

    let allItems = [...expenses, ...invoices];

    // Filtrage strict : on ne garde que ce qui appartient aux softwareProviders
    allItems = allItems.filter(item => {
        if (!item.provider) return false;
        const prv = item.provider.toLowerCase();
        return softwareProviders.some(sp => prv.includes(sp));
    });

    // Retrier tout en ascendant pour le graphique
    allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 2. Agréger les données par mois et préparer le regroupement des listes
    const monthlyDataMap: Record<string, number> = {};
    const groupedItemsByMonth: Record<string, typeof allItems> = {};
    let totalVariableCost = 0;

    const processItem = (item: { amount: number | null, date: Date, provider?: string, id?: string }) => {
        if (!item.amount) return;
        const d = new Date(item.date);
        const monthKey = `${d.toLocaleString('fr-FR', { month: 'long' })} ${d.getFullYear()}`;
        const formattedMonth = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);

        // Pour le Graphique
        const shortMonthKey = `${d.toLocaleString('fr-FR', { month: 'short' })} ${d.getFullYear()}`;
        const shortFormattedMonth = shortMonthKey.charAt(0).toUpperCase() + shortMonthKey.slice(1);
        monthlyDataMap[shortFormattedMonth] = (monthlyDataMap[shortFormattedMonth] || 0) + item.amount;

        // Pour la Liste
        if (!groupedItemsByMonth[formattedMonth]) {
            groupedItemsByMonth[formattedMonth] = [];
        }
        groupedItemsByMonth[formattedMonth].push(item as any);

        totalVariableCost += item.amount;
    };

    allItems.forEach(processItem);

    // Retourner les items du mois le plus récent au plus ancien dans chaque groupe
    Object.keys(groupedItemsByMonth).forEach(month => {
        groupedItemsByMonth[month].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    // Ordonner les clés de mois de la plus récente à la plus ancienne
    const sortedMonthKeys = Object.keys(groupedItemsByMonth).sort((a, b) => {
        const dateA = new Date(groupedItemsByMonth[a][0].date);
        const dateB = new Date(groupedItemsByMonth[b][0].date);
        return dateB.getTime() - dateA.getTime();
    });

    // 3. Calculer les dépenses du MOIS COURANT par prestataire pour l'affichage des dépassements
    const now = new Date();
    const currentMonthItems = allItems.filter(item => {
        if (!item.date) return false;
        const d = new Date(item.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const getProviderTotal = (keywords: string[]) => {
        return currentMonthItems.reduce((sum, item) => {
            const providerStr = item.provider ? item.provider.toLowerCase() : '';
            if (item.amount && keywords.some(k => providerStr.includes(k))) {
                return sum + item.amount;
            }
            return sum;
        }, 0);
    };

    const vercelTotal = getProviderTotal(['vercel']);
    const supabaseTotal = getProviderTotal(['supabase']);
    const cloudflareTotal = getProviderTotal(['cloudflare']);
    const aiTotal = getProviderTotal(['openai', 'anthropic']);

    // Fonction de formatage pour les cartes
    const formatCost = (amount: number, defaultText: string) => {
        if (amount > 0) return <span className="font-bold text-red-500">{amount.toFixed(2)} € (Ce mois)</span>;
        return <span className="font-medium text-[#1E2A33]/70">{defaultText}</span>;
    };

    // Trier les mois chronologiquement
    const chartData = Object.keys(monthlyDataMap).map(m => ({
        month: m,
        total: monthlyDataMap[m]
    }));

    return (
        <div className="min-h-screen bg-[#FDFBEF] text-[#1E2A33] font-sans relative overflow-hidden pb-12">
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 z-0"></div>

            <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="mb-12 border-b border-[#1E2A33]/10 pb-8 flex flex-col items-center text-center">
                    <div className="flex items-center justify-center w-full gap-6 mb-6">
                        <div className="h-px bg-[#AE7D5C]/40 flex-1 max-w-[80px]"></div>
                        <h1 className="text-5xl tracking-wide font-bebas text-[#AE7D5C] inline-flex items-center gap-4">
                            <Activity className="w-10 h-10" />
                            TABLEAU DE BORD FINOPS
                        </h1>
                        <div className="h-px bg-[#AE7D5C]/40 flex-1 max-w-[80px]"></div>
                    </div>
                </div>

                {/* Grille Principale (Uploader + Graphique) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
                    {/* Zone Upload AI */}
                    <div className="lg:col-span-1">
                        <InvoiceUploader />
                        <p className="text-xs text-center mt-3 text-[#1E2A33]/50 italic">
                            Glissez un PDF : Gemini en extraira automatiquement le montant.
                        </p>
                    </div>

                    {/* Zone Graphique */}
                    <div className="lg:col-span-2">
                        <FinOpsChart data={chartData} />
                    </div>
                </div>

                {/* Résumé Global Statique */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <Card className="bg-white/50 backdrop-blur-md border-[#AE7D5C]/20 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-roboto font-medium text-[#1E2A33]/60 flex items-center space-x-2">
                                <CreditCard className="w-4 h-4 text-[#AE7D5C]" />
                                <span>Coûts Fixes Déclarés (Vercel)</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bebas text-[#1E2A33]">20 <span className="text-2xl text-[#1E2A33]/50">$/mois</span></div>
                            <p className="text-xs text-[#1E2A33]/60 mt-1">Abonnement Vercel Pro global.</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white/50 backdrop-blur-md border-[#AE7D5C]/20 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-roboto font-medium text-[#1E2A33]/60 flex items-center space-x-2">
                                <Cpu className="w-4 h-4 text-[#AE7D5C]" />
                                <span>Dépenses Globales TDT</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bebas text-[#1E2A33]">{totalVariableCost.toFixed(2)} <span className="text-2xl text-[#1E2A33]/50">€/$</span></div>
                            <p className="text-xs text-[#1E2A33]/60 mt-1">Cumul de toutes les factures pro historiques de l'entreprise (Cloud, Logiciels IA, Matériel, Prestataires...).</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-[#AE7D5C] border-none shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-roboto font-medium text-[#FDFBEF]/80 flex items-center space-x-2">
                                <Database className="w-4 h-4 text-[#FDFBEF]" />
                                <span>Économie Réalisée Mensuelle</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bebas text-white">~250 <span className="text-2xl text-white/70">€/mois</span></div>
                            <p className="text-xs text-white/80 mt-1">Économie vs solutions CMS/SaaS traditionnelles.</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Liste des factures par mois */}
                <h2 className="text-2xl font-bebas tracking-wide text-[#1E2A33] mb-6 flex items-center gap-3">
                    <CalendarDays className="w-5 h-5 text-[#AE7D5C]" />
                    DÉTAIL DES DÉPENSES PAR MOIS
                </h2>

                <div className="space-y-8 mb-12">
                    {sortedMonthKeys.length === 0 ? (
                        <div className="bg-white border border-[#1E2A33]/10 shadow-sm rounded-xl p-8 text-center text-[#1E2A33]/60 flex flex-col items-center">
                            <span className="bg-[#FDFBEF] p-4 rounded-full mb-3 shadow-inner text-[#AE7D5C]"><CalendarDays size={32} /></span>
                            Aucune dépense logicielle ou cloud détectée pour le moment.
                        </div>
                    ) : (
                        sortedMonthKeys.map((month, index) => (
                            <details key={month} className="group bg-white border border-[#1E2A33]/10 shadow-sm rounded-xl overflow-hidden" open={index === 0}>
                                <summary className="bg-[#FDFBEF]/50 px-6 py-4 border-b border-[#1E2A33]/5 font-bebas text-xl text-[#1E2A33] cursor-pointer flex justify-between items-center transition-colors hover:bg-[#FDFBEF] select-none">
                                    <span className="flex items-center gap-3">
                                        {month}
                                        <span className="font-roboto text-sm text-[#1E2A33]/50 font-normal bg-white px-2 py-1 rounded-full shadow-sm border border-[#1E2A33]/5">
                                            {groupedItemsByMonth[month].length} facture(s)
                                        </span>
                                    </span>
                                    <span className="text-sm font-roboto text-[#1E2A33]/50 group-open:hidden border border-[#1E2A33]/10 rounded-full px-3 py-1">Voir les détails +</span>
                                    <span className="text-sm font-roboto text-[#1E2A33]/50 hidden group-open:block border border-[#1E2A33]/10 rounded-full px-3 py-1 bg-[#1E2A33]/5">Fermer -</span>
                                </summary>
                                <div className="divide-y divide-[#1E2A33]/5 bg-white">
                                    {groupedItemsByMonth[month].map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-center px-6 py-3 hover:bg-[#FDFBEF]/30 transition-colors">
                                            <div>
                                                <div className="font-medium text-[#1E2A33] text-sm">{item.provider}</div>
                                                <div className="text-xs text-[#1E2A33]/50 font-roboto">{new Date(item.date).toLocaleDateString('fr-FR')}</div>
                                            </div>
                                            <div className="font-bebas text-xl text-[#1E2A33]">
                                                {item.amount?.toFixed(2)} <span className="text-sm text-[#1E2A33]/50">€</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        ))
                    )}
                </div>

                {/* Détails par Application */}
                <h2 className="text-2xl font-bebas tracking-wide text-[#1E2A33] mb-6 flex items-center gap-3">
                    <Server className="w-5 h-5 text-[#AE7D5C]" />
                    INFRASTRUCTURES PAR APPLICATION
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-white border-[#1E2A33]/10 shadow-sm">
                        <CardHeader className="border-b border-[#1E2A33]/5 pb-4 bg-[#FDFBEF]/50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl font-roboto font-medium text-[#1E2A33]">Application Thérapeute TDT</CardTitle>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Globe className="w-4 h-4 text-green-600" /> Hébergement (Vercel)</span>
                                {formatCost(vercelTotal, 'Mutualisé (Pro)')}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Database className="w-4 h-4 text-blue-600" /> DB (Supabase)</span>
                                {formatCost(supabaseTotal, 'Gratuit (Hobby)')}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-[#1E2A33]/10 shadow-sm">
                        <CardHeader className="border-b border-[#1E2A33]/5 pb-4 bg-[#FDFBEF]/50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl font-roboto font-medium text-[#1E2A33]">Plateforme Embryo App</CardTitle>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Globe className="w-4 h-4 text-green-600" /> Hébergement (Vercel)</span>
                                {formatCost(vercelTotal, 'Mutualisé (Pro)')}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Video className="w-4 h-4 text-red-500" /> Vidéos (Cloudflare)</span>
                                {formatCost(cloudflareTotal, '~5 $ / mois')}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Cerveau (Productivity App) */}
                    <Card className="bg-white border-[#1E2A33]/10 shadow-sm">
                        <CardHeader className="border-b border-[#1E2A33]/5 pb-4 bg-[#FDFBEF]/50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl font-roboto font-medium text-[#1E2A33]">Cerveau CRM (FinOps)</CardTitle>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Globe className="w-4 h-4 text-green-600" /> Hébergement (Vercel)</span>
                                {formatCost(vercelTotal, 'Mutualisé (Pro)')}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Database className="w-4 h-4 text-blue-600" /> DB (Supabase)</span>
                                {formatCost(supabaseTotal, 'Gratuit (Hobby)')}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Bot className="w-4 h-4 text-purple-600" /> Agent IA (OpenAI / Anthropic)</span>
                                {formatCost(aiTotal, '0.00 € (Pay-as-you-go)')}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Feelprod */}
                    <Card className="bg-white border-[#1E2A33]/10 shadow-sm">
                        <CardHeader className="border-b border-[#1E2A33]/5 pb-4 bg-[#FDFBEF]/50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl font-roboto font-medium text-[#1E2A33]">Feelprod (Production Vidéo)</CardTitle>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Globe className="w-4 h-4 text-green-600" /> Hébergement (Vercel)</span>
                                {formatCost(vercelTotal, 'Mutualisé (Pro)')}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2"><Video className="w-4 h-4 text-red-500" /> Vidéos Portfolio</span>
                                {formatCost(cloudflareTotal, '0.00 €')}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
