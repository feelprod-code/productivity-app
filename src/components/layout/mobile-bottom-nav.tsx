"use client";

import { CreditCard, ReceiptEuro, Upload, ExternalLink, Building2, User2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Si on est sur la page de relevé compta (Transactions)
    if (pathname === "/comptabilite/releve") {
        const tab = searchParams.get("tab") || "pro";
        const flow = searchParams.get("flow") || "all";

        const items = [
            { 
                title: "Pro", 
                url: `/comptabilite/releve?tab=pro&flow=${flow}`, 
                icon: Building2,
                isActive: tab === "pro",
                external: false
            },
            { 
                title: "Perso", 
                url: `/comptabilite/releve?tab=perso&flow=${flow}`, 
                icon: User2,
                isActive: tab === "perso",
                external: false
            },
            { 
                title: "Entrées", 
                url: `/comptabilite/releve?tab=${tab}&flow=${flow === "inflow" ? "all" : "inflow"}`, 
                icon: ArrowDownLeft,
                isActive: flow === "inflow",
                external: false
            },
            { 
                title: "Sorties", 
                url: `/comptabilite/releve?tab=${tab}&flow=${flow === "outflow" ? "all" : "outflow"}`, 
                icon: ArrowUpRight,
                isActive: flow === "outflow",
                external: false
            },
            { 
                title: "Import", 
                url: "/comptabilite/import", 
                icon: Upload,
                isActive: false,
                external: false
            },
            { 
                title: "Pennylane", 
                url: "https://app.pennylane.com", 
                icon: ExternalLink,
                isActive: false,
                external: true
            },
        ];

        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#FDFBEF] border-t border-[#1E2A33]/10 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-around py-2 w-full px-2 max-w-md mx-auto">
                    {items.map((item) => {
                        const content = (
                            <>
                                <item.icon className={cn("w-5.5 h-5.5", item.isActive && "stroke-[2.5px]")} />
                                <span className="text-[10px] font-roboto tracking-tight">{item.title}</span>
                            </>
                        );

                        const className = cn(
                            "flex flex-col items-center justify-center w-full py-1 space-y-1 transition-colors",
                            item.isActive ? "text-[#AE7D5C]" : "text-[#1E2A33]/50 hover:text-[#1E2A33]"
                        );

                        if (item.external) {
                            return (
                                <a
                                    key={item.title}
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={className}
                                >
                                    {content}
                                </a>
                            );
                        }

                        return (
                            <Link
                                key={item.title}
                                href={item.url}
                                className={className}
                            >
                                {content}
                            </Link>
                        );
                    })}
                </div>
            </div>
        );
    }

    // Menu par défaut pour les autres pages
    const defaultItems = [
        { 
            title: "Compta", 
            url: "/comptabilite/releve", 
            icon: ReceiptEuro,
            isActive: pathname === "/comptabilite/releve",
            external: false
        },
        { 
            title: "Import", 
            url: "/comptabilite/import", 
            icon: Upload,
            isActive: pathname === "/comptabilite/import",
            external: false
        },
        { 
            title: "Charges", 
            url: "/comptabilite/sorties", 
            icon: CreditCard,
            isActive: pathname.startsWith("/comptabilite/sorties"),
            external: false
        },
        { 
            title: "Pennylane", 
            url: "https://app.pennylane.com", 
            icon: ExternalLink,
            isActive: false,
            external: true
        },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#FDFBEF] border-t border-[#1E2A33]/10 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-around py-2 w-full px-2 max-w-md mx-auto">
                {defaultItems.map((item) => {
                    const content = (
                        <>
                            <item.icon className={cn("w-5.5 h-5.5", item.isActive && "stroke-[2.5px]")} />
                            <span className="text-[10px] font-roboto tracking-tight">{item.title}</span>
                        </>
                    );

                    const className = cn(
                        "flex flex-col items-center justify-center w-full py-1 space-y-1 transition-colors",
                        item.isActive ? "text-[#AE7D5C]" : "text-[#1E2A33]/50 hover:text-[#1E2A33]"
                    );

                    if (item.external) {
                        return (
                            <a
                                key={item.title}
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={className}
                            >
                                {content}
                            </a>
                        );
                    }

                    return (
                        <Link
                            key={item.title}
                            href={item.url}
                            className={className}
                        >
                            {content}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
