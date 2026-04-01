"use client";

import { Home, BrainCircuit, ReceiptEuro, Settings, LineChart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
    { title: "Accueil", url: "/", icon: Home },
    { title: "Cerveau", url: "/cerveau", icon: BrainCircuit },
    { title: "Compta", url: "/comptabilite", icon: ReceiptEuro },
    { title: "FinOps", url: "/cerveau/finops", icon: LineChart },
    { title: "Réglages", url: "#", icon: Settings },
];

export function MobileBottomNav() {
    const pathname = usePathname();

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#FDFBEF] border-t border-[#1E2A33]/10 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-around h-16 w-full px-2 max-w-md mx-auto">
                {items.map((item) => {
                    const isActive = pathname === item.url;
                    return (
                        <Link
                            key={item.title}
                            href={item.url}
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                                isActive ? "text-[#AE7D5C]" : "text-[#1E2A33]/50 hover:text-[#1E2A33]"
                            )}
                        >
                            <item.icon className={cn("w-6 h-6", isActive && "stroke-[2.5px]")} />
                            <span className="text-[10px] font-roboto tracking-tight">{item.title}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
