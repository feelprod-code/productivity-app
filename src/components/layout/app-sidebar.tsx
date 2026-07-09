import { Calendar, Home, Inbox, Search, Settings, BrainCircuit, ReceiptEuro, LineChart, CreditCard, Sparkles, Key, Upload, ExternalLink } from "lucide-react"

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
        title: "Import justificatifs",
        url: "/comptabilite/import",
        icon: Upload,
    },
    {
        title: "Charges",
        url: "/comptabilite/sorties",
        icon: CreditCard,
    },
    {
        title: "Pennylane",
        url: "https://app.pennylane.com",
        icon: ExternalLink,
    },
]

export function AppSidebar() {
    return (
        <Sidebar>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Compta</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild>
                                        <a 
                                            href={item.url}
                                            target={item.url.startsWith("http") ? "_blank" : undefined}
                                            rel={item.url.startsWith("http") ? "noopener noreferrer" : undefined}
                                        >
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
