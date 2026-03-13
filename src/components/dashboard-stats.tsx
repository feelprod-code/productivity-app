'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

type TimeFilter = 'month' | 'year' | 'all';

export default function DashboardStats({ invoices }: { invoices: any[] }) {
    const [filter, setFilter] = useState<TimeFilter>('month');

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate stats based on filter
    const filteredExpenses = invoices.filter(inv => {
        const d = new Date(inv.date);
        if (filter === 'month') return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        if (filter === 'year') return d.getFullYear() === currentYear;
        return true; // 'all'
    }).reduce((acc, inv) => acc + (inv.amount || 0), 0);

    const pendingCount = invoices.filter(i => i.status === 'PENDING').length;

    let filterLabel = 'Historique complet';
    if (filter === 'month') {
        filterLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    } else if (filter === 'year') {
        filterLabel = `Année ${currentYear}`;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="bg-white border-[#1E2A33]/10 shadow-sm group hover:border-[#AE7D5C]/50 transition-colors relative overflow-hidden">
        <CardHeader className="pb-2 relative z-10">
          <CardTitle className="text-xl font-bebas tracking-wide text-[#1E2A33] flex items-center justify-between">
            Dépenses
            <div className="w-2 h-2 rounded-full bg-[#AE7D5C] opacity-50 group-hover:opacity-100 transition-opacity"></div>
          </CardTitle>
          <div className="flex justify-between items-center mt-1">
             <CardDescription className="font-roboto font-light text-[#1E2A33]/60 capitalize truncate">
              {filterLabel}
            </CardDescription>
            <div className="flex bg-[#1E2A33]/5 rounded-md p-0.5">
              <button 
                onClick={() => setFilter('month')} 
                className={`px-2 py-1 text-[10px] font-medium rounded uppercase tracking-wider transition-colors ${filter === 'month' ? 'bg-white shadow-sm text-[#AE7D5C]' : 'text-[#1E2A33]/50 hover:text-[#1E2A33]'}`}
              >
                Mois
              </button>
              <button 
                onClick={() => setFilter('year')} 
                className={`px-2 py-1 text-[10px] font-medium rounded uppercase tracking-wider transition-colors ${filter === 'year' ? 'bg-white shadow-sm text-[#AE7D5C]' : 'text-[#1E2A33]/50 hover:text-[#1E2A33]'}`}
              >
                Année
              </button>
              <button 
                onClick={() => setFilter('all')} 
                className={`px-2 py-1 text-[10px] font-medium rounded uppercase tracking-wider transition-colors ${filter === 'all' ? 'bg-white shadow-sm text-[#AE7D5C]' : 'text-[#1E2A33]/50 hover:text-[#1E2A33]'}`}
              >
                Tout
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold font-bebas text-[#AE7D5C] tracking-wide">
             {filteredExpenses > 999999 ? 'Hors Stats' : `${filteredExpenses.toFixed(2)} €`}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-[#1E2A33]/10 shadow-sm group hover:border-[#AE7D5C]/50 transition-colors">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-bebas tracking-wide text-[#1E2A33] flex items-center justify-between">
            Factures à traiter
            <div className="w-2 h-2 rounded-full bg-[#AE7D5C] opacity-50 group-hover:opacity-100 transition-opacity"></div>
          </CardTitle>
          <CardDescription className="font-roboto font-light text-[#1E2A33]/60">Nécessitent votre attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-bebas text-[#1E2A33] tracking-wide">{pendingCount}</div>
        </CardContent>
      </Card>

      <Card className="bg-white border-[#1E2A33]/10 shadow-sm group hover:border-[#AE7D5C]/50 transition-colors">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-bebas tracking-wide text-[#1E2A33] flex items-center justify-between">
            Dernière synchro
            <div className="w-2 h-2 rounded-full bg-[#AE7D5C] opacity-50 group-hover:opacity-100 transition-opacity"></div>
          </CardTitle>
          <CardDescription className="font-roboto font-light text-[#1E2A33]/60">Webhook Zapier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-bebas text-[#1E2A33] tracking-wide">
            {invoices.length > 0 ? new Date(invoices[0].createdAt).toLocaleDateString('fr-FR') : 'Bientôt...'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
