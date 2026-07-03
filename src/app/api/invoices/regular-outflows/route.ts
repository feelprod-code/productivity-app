import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const [invoices, expenses] = await Promise.all([
            prisma.invoice.findMany({ orderBy: { date: 'desc' } }),
            prisma.expense.findMany({ orderBy: { date: 'desc' } })
        ]);

        const allItems = [
            ...invoices.map(i => ({ ...i, source: 'Invoice' })),
            ...expenses.map(e => ({ ...e, source: 'Expense' }))
        ];

        // 1. Define match rules for categories
        const regularOutflows: any[] = [];

        // Add URSSAF (from Guillaume's official 2026 schedule)
        const urssafMonthly = [
            { month: "Janvier", amount: 491.00 },
            { month: "Février", amount: 491.00 },
            { month: "Mars", amount: 491.00 },
            { month: "Avril", amount: 491.00 },
            { month: "Mai", amount: 531.00 },
            { month: "Juin", amount: 491.00 },
            { month: "Juillet", amount: 334.00 },
            { month: "Août", amount: 328.00 },
            { month: "Septembre", amount: 328.00 },
            { month: "Octobre", amount: 328.00 },
            { month: "Novembre", amount: 448.00 },
            { month: "Décembre", amount: 322.00 }
        ];
        
        regularOutflows.push({
            id: "urssaf-2026",
            category: "charges",
            provider: "URSSAF",
            amount: 420.00, // Average monthly
            currency: "EUR",
            frequency: "Mensuel (Variable)",
            lastPaymentDate: "2026-06-20",
            status: "ACTIF",
            bankAccount: "6300 (Pro)",
            description: "Cotisations sociales personnelles (Praticien PAM - kinésithérapeute/thérapeute)",
            details: urssafMonthly
        });

        regularOutflows.push({
            id: "carpimko-2026",
            category: "charges",
            provider: "CARPIMKO",
            amount: 520.00, // Standard monthly estimated
            currency: "EUR",
            frequency: "Mensuel",
            lastPaymentDate: "2026-06-10",
            status: "ACTIF",
            bankAccount: "6300 (Pro)",
            description: "Caisse autonome de retraite et prévoyance des auxiliaires médicaux",
            details: [
                { period: "Mensuel", amount: 520.00 }
            ]
        });

        // Add MACSF (RCP & Auto Pro Insurance)
        regularOutflows.push({
            id: "macsf-2026",
            category: "charges",
            provider: "MACSF",
            amount: 85.00, // RCP + Auto Pro average
            currency: "EUR",
            frequency: "Mensuel",
            lastPaymentDate: "2026-06-22", // matches the 22nd from his latest email date
            status: "ACTIF",
            bankAccount: "6300 (Pro)",
            description: "Assurance auto professionnelle & Responsabilité Civile Professionnelle (RCP)",
            details: [
                { period: "Mensuel", amount: 85.00 }
            ]
        });

        // Add Impôts (DGFiP)
        regularOutflows.push({
            id: "impots-cfe-2026",
            category: "charges",
            provider: "Impôts (DGFiP) - CFE",
            amount: 470.00, // CFE payment
            currency: "EUR",
            frequency: "Annuel",
            lastPaymentDate: "2026-03-24", // exact payment date from DB
            status: "ACTIF",
            bankAccount: "6300 (Pro)",
            description: "Cotisation Foncière des Entreprises (CFE) - Impôt professionnel annuel",
            details: [
                { period: "Annuel", amount: 470.00 }
            ]
        });

        // Helper to find latest and average from DB, with fallback
        const getStatsForProvider = (keywords: string[], fallbackAmount: number, fallbackDate: string, excludeKeywords: string[] = []) => {
            const matches = allItems.filter(item => {
                if (!item.provider) return false;
                const p = item.provider.toLowerCase();
                const matchesKeyword = keywords.some(k => p.includes(k));
                const matchesExclude = excludeKeywords.some(ek => p.includes(ek));
                return matchesKeyword && !matchesExclude;
            });

            if (matches.length === 0) {
                return {
                    avg: fallbackAmount,
                    count: 1,
                    latestDate: fallbackDate,
                    latestAmount: fallbackAmount,
                    currency: 'EUR'
                };
            }

            // Sort by date desc
            matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            const total = matches.reduce((sum, item) => sum + (item.amount || 0), 0);
            const avg = total / matches.length;
            const latest = matches[0];

            return {
                avg,
                count: matches.length,
                latestDate: latest.date.toISOString().split('T')[0],
                latestAmount: latest.amount || 0,
                currency: latest.currency || 'EUR'
            };
        };

        // Frais Réguliers & Télécoms
        const telecomProviders = [
            { name: "Via Sana (Loyer)", keys: ["via sana", "sana"], fallbackAmount: 1848.00, fallbackDate: "2026-05-29", desc: "Loyer mensuel du cabinet professionnel", category: "charges" },
            { name: "Doctolib", keys: ["doctolib"], fallbackAmount: 168.00, fallbackDate: "2026-06-08", desc: "Abonnement Doctolib Pro Cabinet (Mensuel)", bankAccount: "6300 (Pro)", category: "charges" },
            { name: "Île-de-France Mobilités (Navigo)", keys: ["mobilités", "comutitres"], fallbackAmount: 90.80, fallbackDate: "2026-05-30", desc: "Abonnement Navigo Pro - Déplacements cabinet (Mensuel)", bankAccount: "6300 (Pro)", category: "charges" },
            { name: "Ordre des Kinés (CNO MK)", keys: ["cno mk", "conseil national de l'ordre"], fallbackAmount: 280.00, fallbackDate: "2026-04-10", desc: "Cotisation ordinale annuelle obligatoire (Annuel)", bankAccount: "6300 (Pro)", category: "charges", frequency: "Annuel" },
            { name: "Bouygues Telecom - Fixe Cabinet (01 48 48 02 12)", keys: ["0148480212"], fallbackAmount: 35.99, fallbackDate: "2026-06-06", desc: "Ligne fixe principale internet et cabinet" },
            { name: "Bouygues Telecom - Fixe Ligne 2 (01 43 56 11 10)", keys: ["0143561110"], fallbackAmount: 47.39, fallbackDate: "2026-06-20", desc: "Ligne fixe secondaire perso", bankAccount: "47827 (Perso)" },
            { name: "Bouygues Telecom - Mobile Guillaume (06 62 74 18 02)", keys: ["0662741802"], fallbackAmount: 40.39, fallbackDate: "2026-06-27", desc: "Ligne mobile professionnelle de Guillaume" },
            { name: "Bouygues Telecom - Mobile Cabinet (07 68 13 79 53)", keys: ["0768137953"], fallbackAmount: 6.99, fallbackDate: "2026-06-20", desc: "Ligne mobile professionnelle secondaire", bankAccount: "47827 (Perso)" },
            { name: "Freebox", keys: ["freebox"], fallbackAmount: 23.99, fallbackDate: "2026-06-04", desc: "Ligne internet de secours ou bureau" },
            { name: "Ausha", keys: ["ausha"], fallbackAmount: 288.00, fallbackDate: "2026-03-07", desc: "Hébergement de podcast et plateforme audio (Annuel)", frequency: "Annuel" },
            { name: "MAIF (Annuel)", keys: ["maif"], excludeKeys: ["habit", "79038"], fallbackAmount: 150.00, fallbackDate: "2026-01-06", desc: "Assurance personnelle (Annuel)", bankAccount: "47827 (Perso)", frequency: "Annuel" },
            { name: "MAIF (Mensuel)", keys: ["maif 79038"], fallbackAmount: 63.88, fallbackDate: "2026-06-08", desc: "Assurances complémentaires mensuelles (Compte Perso)", bankAccount: "47827 (Perso)" },
            { name: "Canal Plus", keys: ["canal"], fallbackAmount: 51.99, fallbackDate: "2026-06-04", desc: "Abonnement TV & divertissement (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "TotalEnergies", keys: ["totalenergies", "total energies"], fallbackAmount: 219.00, fallbackDate: "2026-06-05", desc: "Contrat électricité / gaz (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "DisneyPlus", keys: ["disneyplus", "disney"], fallbackAmount: 15.99, fallbackDate: "2026-06-23", desc: "Abonnement streaming vidéo (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "Spotify", keys: ["spotify"], fallbackAmount: 21.24, fallbackDate: "2026-06-20", desc: "Abonnement audio musique (Mensuel)", bankAccount: "6300 (Pro)" },
            { name: "LCL - Épargne PEL", keys: ["lcl", "pel"], fallbackAmount: 260.00, fallbackDate: "2026-06-30", desc: "Versement programmé Plan d'Épargne Logement (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "Loyer Appartement (VIR)", keys: ["virement permanent appart"], fallbackAmount: 1300.00, fallbackDate: "2026-06-01", desc: "Loyer / Prêt immobilier personnel (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "Eppler Immobilière (Loyer)", keys: ["eppler"], fallbackAmount: 1843.30, fallbackDate: "2026-06-09", desc: "Loyer appartement personnel (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "Volkswagen Bank (Leasing)", keys: ["vw bank"], fallbackAmount: 428.98, fallbackDate: "2026-06-01", desc: "Financement / Leasing véhicule personnel (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "Impôts sur le Revenu (Acompte)", keys: ["direction generale de"], excludeKeys: ["confrere"], fallbackAmount: 465.00, fallbackDate: "2026-06-15", desc: "Prélèvement mensuel impôt sur le revenu (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "Karapass Courtage", keys: ["karapass"], fallbackAmount: 11.99, fallbackDate: "2026-06-05", desc: "Assurance mobile (Mensuel)", bankAccount: "47827 (Perso)" },
            { name: "Virement permanent Théo", keys: ["pour theo"], fallbackAmount: 80.00, fallbackDate: "2026-06-13", desc: "Versement régulier Théo (Mensuel)", bankAccount: "47827 (Perso)" }
        ];

        for (const tp of telecomProviders as any[]) {
            const stats = getStatsForProvider(tp.keys, tp.fallbackAmount, tp.fallbackDate, tp.excludeKeys || []);
            if (stats) {
                regularOutflows.push({
                    id: `telecom-${tp.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    category: tp.category || "fixes",
                    provider: tp.name,
                    amount: stats.avg,
                    currency: stats.currency,
                    frequency: tp.frequency || "Mensuel",
                    lastPaymentDate: stats.latestDate,
                    status: "ACTIF",
                    bankAccount: tp.bankAccount || "6300 (Pro)",
                    description: tp.desc
                });
            }
        }

        // Tech & IA Purchases
        const techProviders = [
            { name: "OpenAI (ChatGPT API)", keys: ["openai"], fallbackAmount: 15.00, fallbackDate: "2026-06-25", desc: "Consommation IA pay-as-you-go (RÉSILIÉ)", status: "RÉSILIÉ" },
            { name: "Anthropic (Claude API)", keys: ["anthropic"], fallbackAmount: 20.00, fallbackDate: "2026-06-25", desc: "Consommation IA de recherche (RÉSILIÉ)", status: "RÉSILIÉ" },
            { name: "OpenRouter", keys: ["openrouter"], fallbackAmount: 90.05, fallbackDate: "2026-04-07", desc: "Passerelle d'IA LLM (Crédits / Abonnement fixe + dépassement variable)", useLatestAmount: true },
            { name: "Eleven Labs", keys: ["eleven-annual-sub-placeholder"], fallbackAmount: 264.00, fallbackDate: "2026-03-06", desc: "Abonnement Annuel Eleven Labs (Les factures mensuelles de 26 € ou 59 € en base sont des dépassements de consommation ou recharges de crédits)", frequency: "Annuel" },
            { name: "ACE Studio", keys: ["ace studio", "acestudio"], fallbackAmount: 264.00, fallbackDate: "2026-06-18", desc: "Synthèse et chant IA (Abonnement Annuel)", frequency: "Annuel" },
            { name: "Suno AI", keys: ["suno"], fallbackAmount: 345.60, fallbackDate: "2026-05-02", desc: "Génération de musique IA (Abonnement Annuel)", frequency: "Annuel" },
            { name: "Krotos Studio", keys: ["krotos"], fallbackAmount: 194.99, fallbackDate: "2025-11-18", desc: "Création d'effets sonores et bruitages (Abonnement Annuel)", frequency: "Annuel" },
            { name: "Higgsfield AI", keys: ["higgsfield-annual-sub-placeholder"], fallbackAmount: 264.83, fallbackDate: "2025-11-28", desc: "Génération de vidéos réalistes IA (Abonnement Annuel - facturé 264,83 € en nov. 2025)", frequency: "Annuel" },
            { name: "Vercel", keys: ["vercel"], fallbackAmount: 62.25, fallbackDate: "2026-06-21", desc: "Hébergement cloud front-end (Abonnement Pro fixe $20 + dépassement variable)", useLatestAmount: true },
            { name: "Supabase", keys: ["supabase"], fallbackAmount: 25.00, fallbackDate: "2026-06-24", desc: "Base de données cloud PostgreSQL (Abonnement Pro fixe $25 + dépassement variable)", useLatestAmount: true },
            { name: "Cloudflare", keys: ["cloudflare"], fallbackAmount: 15.15, fallbackDate: "2026-06-28", desc: "CDN, DNS, stockage et sécurité (Abonnement Pro fixe $20 + dépassement variable)", useLatestAmount: true },
            { name: "Canva Pro", keys: ["canva-annual-sub-placeholder"], fallbackAmount: 120.00, fallbackDate: "2025-11-15", desc: "Abonnement Annuel Canva Pro (Les factures de 61 € ou 73 € en base sont des impressions ponctuelles de cartes de visite)", frequency: "Annuel" },
            { name: "Adobe Systems (Acrobat Pro)", keys: ["adobe"], fallbackAmount: 23.99, fallbackDate: "2026-02-26", desc: "Abonnement d'édition PDF & outils créatifs (Acrobat Pro)" },
            { name: "Apple iCloud+ (Stockage Pro)", keys: ["apple-icloud-sub-placeholder"], fallbackAmount: 2.99, fallbackDate: "2026-06-21", desc: "Abonnement de stockage cloud iCloud+ 200 Go (Mensuel)" },
            { name: "Apple App Store (Applications)", keys: ["apple-appstore-sub-placeholder"], fallbackAmount: 29.99, fallbackDate: "2026-06-14", desc: "Abonnements et licences d'applications professionnelles via l'App Store (Mensuel)" },
            { name: "SoundCloud", keys: ["soundcloud"], fallbackAmount: 12.99, fallbackDate: "2026-06-15", desc: "Abonnement audio et hébergement SoundCloud Pro" },
            { name: "Google Workspace & AI (Gemini)", keys: ["google"], fallbackAmount: 99.99, fallbackDate: "2026-06-21", desc: "Abonnement Google Workspace & services d'IA (Évolutif - de 29,99 € à 139,99 €, puis 219,99 € et stabilisé à 99,99 €)", amountOverride: 99.99 },
            { name: "Zapier", keys: ["zapier"], fallbackAmount: 248.65, fallbackDate: "2026-02-20", desc: "Automations de synchronisation comptable (Abonnement Annuel)", frequency: "Annuel" }
        ];

        for (const tp of techProviders as any[]) {
            const stats = getStatsForProvider(tp.keys, tp.fallbackAmount, tp.fallbackDate, tp.excludeKeys || []);
            if (stats) {
                regularOutflows.push({
                    id: `tech-${tp.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                    category: "tech",
                    provider: tp.name,
                    amount: tp.amountOverride !== undefined ? tp.amountOverride : (tp.useLatestAmount ? stats.latestAmount : stats.avg),
                    currency: stats.currency,
                    frequency: tp.frequency || "Mensuel",
                    lastPaymentDate: stats.latestDate,
                    status: tp.status || "ACTIF",
                    bankAccount: tp.bankAccount || "6300 (Pro)",
                    description: tp.desc
                });
            }
        }

        // Calculate monthly variation for tech services
        const targetProviders = ['Google', 'Vercel', 'OpenRouter', 'Cloudflare', 'Eleven Labs', 'Supabase', 'Adobe'];
        const monthlyData: { [key: string]: { [key: string]: number } } = {};

        const invoices2026 = invoices.filter(inv => {
            const y = new Date(inv.date).getFullYear();
            return y === 2026;
        });

        invoices2026.forEach(inv => {
            const providerLower = (inv.provider || '').toLowerCase();
            let matchedProvider = null;
            
            if (providerLower.includes('google')) {
                // Ignore the 29.99 EUR invoices from June 2026 onwards since it is personal/stabilized at 99.99
                if (inv.amount === 29.99 && new Date(inv.date).getMonth() === 5) {
                    return; 
                }
                matchedProvider = 'Google';
            } else if (providerLower.includes('vercel')) {
                matchedProvider = 'Vercel';
            } else if (providerLower.includes('openrouter')) {
                matchedProvider = 'OpenRouter';
            } else if (providerLower.includes('cloudflare')) {
                matchedProvider = 'Cloudflare';
            } else if (providerLower.includes('eleven')) {
                matchedProvider = 'Eleven Labs';
            } else if (providerLower.includes('supabase')) {
                matchedProvider = 'Supabase';
            } else if (providerLower.includes('adobe')) {
                matchedProvider = 'Adobe';
            }
            
            if (matchedProvider) {
                const dateObj = new Date(inv.date);
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const monthKey = `${year}-${month}`;
                
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = {};
                    targetProviders.forEach(p => {
                        monthlyData[monthKey][p] = 0;
                    });
                }
                
                monthlyData[monthKey][matchedProvider] += inv.amount || 0;
            }
        });

        // Ensure Google in June 2026 is stabilized at 99.99 €
        if (monthlyData['2026-06']) {
            if (monthlyData['2026-06']['Google'] === 0 || monthlyData['2026-06']['Google'] === 29.99) {
                monthlyData['2026-06']['Google'] = 99.99;
            }
        }

        const monthNamesFR: { [key: string]: string } = {
            '01': 'Janvier',
            '02': 'Février',
            '03': 'Mars',
            '04': 'Avril',
            '05': 'Mai',
            '06': 'Juin',
            '07': 'Juillet',
            '08': 'Août',
            '09': 'Septembre',
            '10': 'Octobre',
            '11': 'Novembre',
            '12': 'Décembre'
        };

        const sortedMonths = Object.keys(monthlyData).sort();
        const variations = sortedMonths.map(monthKey => {
            const [year, month] = monthKey.split('-');
            return {
                month: `${monthNamesFR[month]} ${year}`,
                ...monthlyData[monthKey]
            };
        });

        return NextResponse.json({ 
            outflows: regularOutflows, 
            variations, 
            variationProviders: targetProviders 
        });
    } catch (error: any) {
        console.error("Error in regular-outflows API:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
