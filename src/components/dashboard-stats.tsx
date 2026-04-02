'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

export default function DashboardStats({ invoices }: { invoices: any[] }) {
  const now = new Date();
  const [filterYear, setFilterYear] = useState<string>(now.getFullYear().toString());
  const [filterMonth, setFilterMonth] = useState<string>(now.getMonth().toString());

  const filteredInvoicesList = invoices.filter(inv => {
    const d = new Date(inv.date);
    const matchesYear = filterYear === 'all' || d.getFullYear().toString() === filterYear;
    const matchesMonth = filterMonth === 'all' || d.getMonth().toString() === filterMonth;
    return matchesYear && matchesMonth;
  });

  const filteredExpenses = filteredInvoicesList.reduce((acc, inv) => acc + (inv.amount || 0), 0);
  const currentCount = filteredInvoicesList.length;

  let filterLabel = 'Historique complet';
  if (filterYear !== 'all') {
    if (filterMonth !== 'all') {
      const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
      filterLabel = `${monthNames[parseInt(filterMonth)]} ${filterYear}`;
    } else {
      filterLabel = `Année ${filterYear}`;
    }
  } else if (filterMonth !== 'all') {
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    filterLabel = `${monthNames[parseInt(filterMonth)]} (Toutes années)`;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="group relative overflow-hidden flex flex-col gap-1 p-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-roboto font-bold text-[#1E2A33]/80 uppercase tracking-wider">
            Dépenses
          </h3>
          <div className="w-1.5 h-1.5 rounded-full bg-[#AE7D5C] opacity-50 group-hover:opacity-100 transition-opacity"></div>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-roboto font-light text-[#1E2A33] tracking-tight">
            {filteredExpenses > 999999 ? 'Hors Stats' : `${filteredExpenses.toFixed(2)}`}
          </div>
          <span className="text-sm font-roboto text-[#1E2A33]/40">€</span>
        </div>
        <div className="flex flex-col xl:flex-row justify-between xl:items-center mt-2 gap-2">
          <span className="font-roboto font-light text-xs text-[#1E2A33]/40 capitalize">
            {filterLabel}
          </span>
          <div className="flex gap-2 shrink-0 self-start xl:self-auto">
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-transparent border-b border-[#1E2A33]/10 focus-visible:outline-none focus-visible:border-[#AE7D5C] text-[#1E2A33]/60 font-roboto text-[10px] px-1 py-1 uppercase tracking-widest cursor-pointer"
            >
              <option value="all">Tous mois</option>
              <option value="0">Jan</option>
              <option value="1">Fév</option>
              <option value="2">Mar</option>
              <option value="3">Avr</option>
              <option value="4">Mai</option>
              <option value="5">Jun</option>
              <option value="6">Jul</option>
              <option value="7">Aoû</option>
              <option value="8">Sep</option>
              <option value="9">Oct</option>
              <option value="10">Nov</option>
              <option value="11">Déc</option>
            </select>

            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="bg-transparent border-b border-[#1E2A33]/10 focus-visible:outline-none focus-visible:border-[#AE7D5C] text-[#1E2A33]/60 font-roboto text-[10px] px-1 py-1 uppercase tracking-widest cursor-pointer"
            >
              <option value="all">Global</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>
          </div>
        </div>
      </div>

      <div className="group flex flex-col gap-1 p-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-roboto font-bold text-[#1E2A33]/80 uppercase tracking-wider">
            Total Factures
          </h3>
          <div className="w-1.5 h-1.5 rounded-full bg-[#1E2A33]/20 group-hover:bg-[#1E2A33]/40 transition-colors"></div>
        </div>
        <div className="text-3xl font-roboto font-light text-[#1E2A33] tracking-tight">{currentCount}</div>
        <span className="font-roboto font-light text-xs text-[#1E2A33]/40 mt-2">Synchronisées automatiquement</span>
      </div>

      <div className="group flex flex-col gap-1 p-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-roboto font-bold text-[#1E2A33]/80 uppercase tracking-wider">
            Dernière synchro
          </h3>
          <div className="w-1.5 h-1.5 rounded-full bg-[#1E2A33]/20 group-hover:bg-[#1E2A33]/40 transition-colors"></div>
        </div>
        <div className="text-3xl font-roboto font-light text-[#1E2A33] tracking-tight">
          {invoices.length > 0 ? new Date(invoices[0].createdAt).toLocaleDateString('fr-FR') : '---'}
        </div>
        <span className="font-roboto font-light text-xs text-[#1E2A33]/40 mt-2">Webhook Zapier</span>
      </div>
    </div>
  );
}
