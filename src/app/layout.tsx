import type { Metadata } from "next";
import { Bebas_Neue, Roboto } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense } from "react";

const bebas = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas",
  subsets: ["latin"],
});

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  variable: "--font-roboto",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Compta",
  description: "Gestion comptable & Rapprochement de factures",
  icons: {
    icon: "/favicon-compta.png?v=3",
    apple: "/apple-favicon-compta.png?v=3",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Compta",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${bebas.variable} ${roboto.variable} font-sans antialiased`}
      >
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <main className="flex-1 w-full relative pb-20 md:pb-0">
              <div className="hidden md:block absolute top-4 left-4 z-50">
                <SidebarTrigger />
              </div>
              {children}
            </main>
            <Suspense fallback={null}>
              <MobileBottomNav />
            </Suspense>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
