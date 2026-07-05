"use client";

import { CreditCard, Building2, User2, ArrowDownLeft, ArrowUpRight, ReceiptEuro } from "lucide-react";
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
                isActive: tab === "pro"
            },
            { 
                title: "Perso", 
                url: `/comptabilite/releve?tab=perso&flow=${flow}`, 
                icon: User2,
                isActive: tab === "perso"
            },
            { 
                title: "Entrées", 
                url: `/comptabilite/releve?tab=${tab}&flow=${flow === "inflow" ? "all" : "inflow"}`, 
                icon: ArrowDownLeft,
                isActive: flow === "inflow"
            },
            { 
                title: "Sorties", 
                url: `/comptabilite/releve?tab=${tab}&flow=${flow === "outflow" ? "all" : "outflow"}`, 
                icon: ArrowUpRight,
                isActive: flow === "outflow"
            },
            { 
                title: "Charges", 
                url: "/comptabilite/sorties", 
                icon: CreditCard,
                isActive: false
            },
        ];

        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#FDFBEF] border-t border-[#1E2A33]/10 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-around py-2 w-full px-2 max-w-md mx-auto">
                    {items.map((item) => {
                        return (
                            <Link
                                key={item.title}
                                href={item.url}
                                className={cn(
                                    "flex flex-col items-center justify-center w-full py-1 space-y-1 transition-colors",
                                    item.isActive ? "text-[#AE7D5C]" : "text-[#1E2A33]/50 hover:text-[#1E2A33]"
                                )}
                            >
                                <item.icon className={cn("w-5 h-5", item.isActive && "stroke-[2.5px]")} />
                                <span className="text-[10px] font-roboto tracking-tight">{item.title}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        );
    }

    // Menu global par défaut pour les autres pages (comprend le lien vers Compta et Charges)
    const defaultItems = [
        { 
            title: "Compta", 
            url: "/comptabilite/releve", 
            icon: ReceiptEuro,
            isActive: pathname === "/comptabilite/releve"
        },
        { 
            title: "Charges", 
            url: "/comptabilite/sorties", 
            icon: CreditCard,
            isActive: pathname.startsWith("/comptabilite/sorties")
        },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#FDFBEF] border-t border-[#1E2A33]/10 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-around py-2 w-full px-2 max-w-md mx-auto">
                {defaultItems.map((item) => {
                    return (
                        <Link
                            key={item.title}
                            href={item.url}
                            className={cn(
                                "flex flex-col items-center justify-center w-full py-1 space-y-1 transition-colors",
                                item.isActive ? "text-[#AE7D5C]" : "text-[#1E2A33]/50 hover:text-[#1E2A33]"
                            )}
                        >
                            <item.icon className={cn("w-5.5 h-5.5", item.isActive && "stroke-[2.5px]")} />
                            <span className="text-[10px] font-roboto tracking-tight">{item.title}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
