import { prisma } from '@/lib/prisma';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import InvoiceTable from '@/components/invoice-table';
import DashboardStats from '@/components/dashboard-stats';

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

        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-6 pb-4 border-b border-[#1E2A33]/10">
          <div className="flex items-center gap-4 pt-4 md:pt-0">
            <div className="h-full w-2 bg-[#AE7D5C] rounded-full self-stretch shadow-[0_0_15px_rgba(174,125,92,0.4)]"></div>
            <h1 className="text-3xl sm:text-5xl font-bebas tracking-wide text-[#1E2A33] text-center md:text-left">TABLEAU DE BORD <span className="text-[#AE7D5C]">/ COMPTABILITE</span></h1>
          </div>
          <Button variant="outline" className="w-full md:w-auto font-roboto tracking-wide border-[#1E2A33]/20 hover:bg-[#1E2A33]/5 text-[#1E2A33]">Gérer les automatisations (Zapier)</Button>
        </div>

        <DashboardStats invoices={invoices} />

        <Card className="bg-white border-[#1E2A33]/10 shadow-sm mt-4">
          <CardHeader className="border-b border-[#1E2A33]/10 pb-4 mb-4">
            <CardTitle className="text-2xl font-bebas tracking-wide text-[#1E2A33] flex items-center justify-between">
              Factures récentes
              <div className="w-2 h-2 rounded-full bg-[#1E2A33]/20"></div>
            </CardTitle>
            <CardDescription className="font-roboto font-light text-[#1E2A33]/60">Les factures récupérées automatiquement depuis vos boîtes mail.</CardDescription>
          </CardHeader>
          <CardContent>
            <InvoiceTable invoices={invoices} />
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
