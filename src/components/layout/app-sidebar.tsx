import { Calendar, Home, Inbox, Search, Settings, BrainCircuit, ReceiptEuro, LineChart } from "lucide-react"

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
        title: "Accueil Mission",
        url: "/",
        icon: Home,
    },
    {
        title: "Cerveau Vectoriel",
        url: "/cerveau",
        icon: BrainCircuit,
    },
    {
        title: "Comptabilité",
        url: "/comptabilite",
        icon: ReceiptEuro,
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
