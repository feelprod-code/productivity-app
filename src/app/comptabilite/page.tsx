import { prisma } from '@/lib/prisma';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import InvoiceTable from '@/components/invoice-table';
import DashboardStats from '@/components/dashboard-stats';
import ExportButton from '@/components/ExportButton';

import { InvoiceUploader } from '@/components/finops/InvoiceUploader';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  // In a real app, you would add authentication and error handling here
  let invoices: any[] = [];
  try {
    invoices = await prisma.invoice.findMany({
      orderBy: { date: 'desc' },
      take: 1000,
    });
  } catch (e) {
    console.error('Error fetching invoices: ', e);
    // Silent catch if DB connection fails
  }

  return (
    <main className="min-h-screen bg-[#FDFBEF] text-[#1E2A33] p-8 font-sans relative overflow-hidden">
      {/* TDT Grid Background Effect */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 z-0"></div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">

        <div className="flex flex-col lg:flex-row justify-between items-center gap-6 mb-6 pb-4 border-b border-[#1E2A33]/10">
          <div className="flex items-center gap-4 pt-4 lg:pt-0 shrink-0">
            <div className="h-full w-2 bg-[#AE7D5C] rounded-full self-stretch shadow-[0_0_15px_rgba(174,125,92,0.4)]"></div>
            <h1 className="text-3xl sm:text-5xl font-bebas tracking-wide text-[#1E2A33] text-center md:text-left leading-tight">TABLEAU DE BORD <span className="text-[#AE7D5C]">/ COMPTABILITE</span></h1>
          </div>
          <div className="flex w-full lg:w-auto items-center justify-end gap-4">
            <InvoiceUploader />
            <ExportButton />
          </div>
        </div>

        <DashboardStats invoices={invoices} />

        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-roboto font-bold text-[#1E2A33]/80 uppercase tracking-widest">
                Factures récentes
              </h2>
              <p className="font-roboto font-light text-xs text-[#1E2A33]/40 mt-1">Synchronisation automatique depuis Gmail</p>
            </div>
          </div>
          <div className="bg-white/40 ring-1 ring-[#1E2A33]/5 rounded-2xl p-4 backdrop-blur-sm">
            <InvoiceTable invoices={invoices} />
          </div>
        </div>

      </div>
    </main>
  );
}
