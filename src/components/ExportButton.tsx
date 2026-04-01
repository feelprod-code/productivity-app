'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export default function ExportButton() {
    const [isOpen, setIsOpen] = useState(false);
    const [filterType, setFilterType] = useState<'all' | 'year' | 'month' | 'week'>('all');
    const [filterValue, setFilterValue] = useState<string>(''); // Vaut: "2026", "2026-03", "2026-W12"

    const [status, setStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState<string>('');

    const currentYearDate = new Date();

    const handleExport = async () => {
        try {
            setStatus('exporting');
            setMessage('');

            let startDateStr, endDateStr, folderName;

            if (filterType === 'all') {
                folderName = 'Factures_Export_Toutes';
                startDateStr = null;
                endDateStr = null;
            } else if (filterType === 'year') {
                const yearInt = parseInt(filterValue || currentYearDate.getFullYear().toString());
                startDateStr = `${yearInt}-01-01`;
                endDateStr = `${yearInt}-12-31T23:59:59`;
                folderName = `Factures_Export_Annee_${yearInt}`;
            } else if (filterType === 'month') {
                const [y, m] = (filterValue || `${currentYearDate.getFullYear()}-01`).split('-');
                startDateStr = `${y}-${m}-01`;
                const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
                endDateStr = `${y}-${m}-${lastDay}T23:59:59`;
                folderName = `Factures_Export_Mois_${y}_${m}`;
            } else if (filterType === 'week') {
                // e.g. "2026-W12"
                const [y, wStr] = (filterValue || `${currentYearDate.getFullYear()}-W01`).split('-W');
                const year = parseInt(y);
                const week = parseInt(wStr);
                // Approximation start/end dates for the week
                const firstDayOfYear = new Date(year, 0, 1);
                const daysToFirstMonday = (8 - firstDayOfYear.getDay()) % 7;
                const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);

                const weekStartDate = new Date(firstMonday.getTime() + (week - 1) * 7 * 86400000);
                const weekEndDate = new Date(weekStartDate.getTime() + 6 * 86400000);

                startDateStr = weekStartDate.toISOString();
                endDateStr = weekEndDate.toISOString();
                folderName = `Factures_Export_Semaine_${y}_W${wStr}`;
            }

            const response = await fetch('/api/invoices/export-local', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startDate: startDateStr,
                    endDate: endDateStr,
                    folderName
                })
            });

            const data = await response.json();

            if (response.ok) {
                setStatus('success');
                setMessage(`${data.newCount} factures exportées avec succès !`);
                setTimeout(() => {
                    setStatus('idle');
                    setIsOpen(false);
                    setMessage('');
                }, 3000);
            } else {
                throw new Error(data.error || 'Erreur lors de l\'export');
            }
        } catch (error: any) {
            setStatus('error');
            setMessage('Erreur: ' + error.message);
            setTimeout(() => setStatus('idle'), 5000);
            console.error(error);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (open) setStatus('idle');
        }}>
            <DialogTrigger asChild>
                <Button className="w-full md:w-auto font-roboto tracking-wide gap-2 bg-[#AE7D5C] hover:bg-[#AE7D5C]/90 text-white">
                    <Download className="w-4 h-4" />
                    Exporter sur mon Mac
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-md bg-[#FDFBEF]">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bebas tracking-wide text-[#1E2A33]">Options d'Exportation</DialogTitle>
                    <DialogDescription className="font-roboto font-light text-[#1E2A33]/70">
                        Téléchargez vos factures organisées par dossiers directement sur votre ordinateur.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-[#1E2A33]">Période d'exportation :</label>
                        <div className="flex gap-2 bg-[#1E2A33]/5 p-1 rounded-md">
                            <button
                                onClick={() => setFilterType('all')}
                                className={`flex-1 py-2 text-xs font-semibold rounded-sm uppercase tracking-wide transition-colors ${filterType === 'all' ? 'bg-white shadow text-[#AE7D5C]' : 'text-[#1E2A33]/60 hover:text-[#1E2A33]'}`}
                            >Tout</button>
                            <button
                                onClick={() => { setFilterType('year'); setFilterValue(currentYearDate.getFullYear().toString()); }}
                                className={`flex-1 py-2 text-xs font-semibold rounded-sm uppercase tracking-wide transition-colors ${filterType === 'year' ? 'bg-white shadow text-[#AE7D5C]' : 'text-[#1E2A33]/60 hover:text-[#1E2A33]'}`}
                            >Année</button>
                            <button
                                onClick={() => { setFilterType('month'); setFilterValue(`${currentYearDate.getFullYear()}-${(currentYearDate.getMonth() + 1).toString().padStart(2, '0')}`); }}
                                className={`flex-1 py-2 text-xs font-semibold rounded-sm uppercase tracking-wide transition-colors ${filterType === 'month' ? 'bg-white shadow text-[#AE7D5C]' : 'text-[#1E2A33]/60 hover:text-[#1E2A33]'}`}
                            >Mois</button>
                            <button
                                onClick={() => { setFilterType('week'); setFilterValue(`${currentYearDate.getFullYear()}-W01`); }}
                                className={`flex-1 py-2 text-xs font-semibold rounded-sm uppercase tracking-wide transition-colors ${filterType === 'week' ? 'bg-white shadow text-[#AE7D5C]' : 'text-[#1E2A33]/60 hover:text-[#1E2A33]'}`}
                            >Semaine</button>
                        </div>
                    </div>

                    {filterType === 'year' && (
                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                            <label className="text-sm font-medium text-[#1E2A33]">Sélectionnez l'année :</label>
                            <input type="number"
                                className="w-full rounded-md border border-[#1E2A33]/20 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]"
                                value={filterValue}
                                onChange={(e) => setFilterValue(e.target.value)}
                                min="2020" max="2100" />
                        </div>
                    )}

                    {filterType === 'month' && (
                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                            <label className="text-sm font-medium text-[#1E2A33]">Sélectionnez le mois :</label>
                            <input type="month"
                                className="w-full rounded-md border border-[#1E2A33]/20 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]"
                                value={filterValue}
                                onChange={(e) => setFilterValue(e.target.value)} />
                        </div>
                    )}

                    {filterType === 'week' && (
                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                            <label className="text-sm font-medium text-[#1E2A33]">Sélectionnez la semaine :</label>
                            <input type="week"
                                className="w-full rounded-md border border-[#1E2A33]/20 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]"
                                value={filterValue}
                                onChange={(e) => setFilterValue(e.target.value)} />
                        </div>
                    )}

                </div>

                <DialogFooter className="sm:justify-between items-center border-t border-[#1E2A33]/10 pt-4">
                    {message ? (
                        <span className={`text-sm font-medium ${status === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                            {message}
                        </span>
                    ) : <span />}

                    <Button
                        onClick={handleExport}
                        disabled={status === 'exporting'}
                        className={`font-roboto tracking-wide transition-colors ${status === 'success' ? 'bg-green-500 hover:bg-green-600' :
                                status === 'error' ? 'bg-red-500 hover:bg-red-600' :
                                    'bg-[#AE7D5C] hover:bg-[#AE7D5C]/90'
                            }`}
                    >
                        {status === 'exporting' ? 'Exportation en cours...' : 'Lancer l\'export'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
