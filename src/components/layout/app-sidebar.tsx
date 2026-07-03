import { Calendar, Home, Inbox, Search, Settings, BrainCircuit, ReceiptEuro, LineChart, CreditCard, Sparkles, Key } from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"

// Menu items.
const items = [
    {
        title: "Relevé & Rapprochement",
        url: "/comptabilite/releve",
        icon: Sparkles,
    },
    {
        title: "Sorties & Abonnements",
        url: "/comptabilite/sorties",
        icon: CreditCard,
    },
    {
        title: "Identifiants & Fournisseurs",
        url: "/comptabilite/fournisseurs",
        icon: Key,
    },
    {
        title: "Coûts & FinOps",
        url: "/cerveau/finops",
        icon: LineChart,
    },
    {
        title: "Paramètres",
        url: "#",
        icon: Settings,
    },
]

export function AppSidebar() {
    return (
        <Sidebar>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Application Mission</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild>
                                        <a href={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    )
}
