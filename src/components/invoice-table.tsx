"use client";

import React, { useState, useMemo } from 'react';
import { FileText, ExternalLink, ChevronDown, ChevronRight, Search, Download, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function InvoiceTable({ invoices }: { invoices: any[] }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Set auto-open behavior for the most recent month initially
    const [initialized, setInitialized] = useState(false);
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

    const toggleMonth = (monthKey: string) => {
        setExpandedMonths(prev => {
            const next = new Set(prev);
            if (next.has(monthKey)) {
                next.delete(monthKey);
            } else {
                next.add(monthKey);
            }
            return next;
        });
    };

    // Filter invoices based on search query and dates
    const filteredInvoices = useMemo(() => {
        return invoices.filter(invoice => {
            const matchesSearch = invoice.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (invoice.subject && invoice.subject.toLowerCase().includes(searchQuery.toLowerCase()));

            let matchesDate = true;
            const invDate = new Date(invoice.date);
            if (startDate) {
                matchesDate = matchesDate && invDate >= new Date(startDate);
            }
            if (endDate) {
                matchesDate = matchesDate && invDate <= new Date(endDate);
            }

            return matchesSearch && matchesDate;
        });
    }, [invoices, searchQuery, startDate, endDate]);

    // Group the filtered invoices
    const groupedInvoices = useMemo(() => {
        return filteredInvoices.reduce((acc, invoice) => {
            const date = new Date(invoice.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!acc[monthKey]) {
                acc[monthKey] = {
                    label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^\w/, (c) => c.toUpperCase()),
                    invoices: [],
                    total: 0
                };
            }

            acc[monthKey].invoices.push(invoice);
            acc[monthKey].total += (invoice.amount || 0);
            return acc;
        }, {} as Record<string, { label: string, invoices: any[], total: number }>);
    }, [filteredInvoices]);

    const sortedMonths = useMemo(() => {
        const sorted = Object.keys(groupedInvoices).sort((a, b) => b.localeCompare(a));
        sorted.forEach(monthKey => {
            groupedInvoices[monthKey].invoices.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });

        // Auto-open logic (only on first render)
        if (!initialized && sorted.length > 0) {
            // Open ALL months
            const initialExpanded = new Set<string>(sorted);

            setExpandedMonths(initialExpanded);
            setInitialized(true);
        }

        return sorted;
    }, [groupedInvoices, initialized]);

    const openInvoice = (invoice: any) => {
        if (invoice.provider === 'Bouygues Telecom') {
            window.open('https://www.bouyguestelecom.fr/mon-compte', '_blank', 'noopener,noreferrer');
        } else if (invoice.fileUrl) {
            window.open(invoice.fileUrl, '_blank', 'noopener,noreferrer');
        }
    };

    // Download specific behavior for when preview fails or user wants hard download
    const downloadPdf = (e: React.MouseEvent, invoice: any) => {
        e.stopPropagation();
        if (invoice.fileUrl) {
            const link = document.createElement('a');
            link.href = invoice.fileUrl;
            // Best effort name
            link.download = `Facture_${invoice.provider}_${new Date(invoice.date).toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`;
            // In cases of cross-origin, standard download attribute might be ignored and behave like a new tab.
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    if (invoices.length === 0) {
        return (
            <div className="text-center py-16 text-[#1E2A33]/50 bg-[#FDFBEF]/50 rounded-xl border border-[#1E2A33]/5">
                <p className="font-roboto font-medium">Aucune facture pour l'instant.</p>
                <p className="text-sm mt-2 font-light">Connectez votre base de données et activez Zapier pour commencer !</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Toolbar for filters */}
            <div className="flex flex-col sm:flex-row gap-3 bg-[#FDFBEF]/50 p-4 rounded-xl border border-[#1E2A33]/10">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1E2A33]/40" />
                    <Input
                        placeholder="Chercher un nom de prélèvement, SumUp, Apple..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-10 bg-white border-[#1E2A33]/10 focus-visible:ring-[#AE7D5C] rounded-lg [&::-webkit-search-cancel-button]:appearance-none"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1E2A33]/40 hover:text-[#1E2A33]/70 focus:outline-none"
                            aria-label="Effacer la recherche"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="flex gap-2 min-w-[280px]">
                    <div className="flex-1 relative">
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-white border-[#1E2A33]/10 focus-visible:ring-[#AE7D5C] text-[#1E2A33]/70 font-roboto text-sm w-full"
                        />
                    </div>
                    <div className="flex-1 relative">
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-white border-[#1E2A33]/10 focus-visible:ring-[#AE7D5C] text-[#1E2A33]/70 font-roboto text-sm w-full"
                        />
                    </div>
                </div>
            </div>

            <Table>
                <TableHeader>
                    <TableRow className="border-[#1E2A33]/10 hover:bg-transparent hidden sm:table-row">
                        <TableHead className="font-bebas text-[#1E2A33]/50 uppercase tracking-widest w-12"></TableHead>
                        <TableHead className="font-bebas text-[#1E2A33]/50 uppercase tracking-widest">Date</TableHead>
                        <TableHead className="font-bebas text-[#1E2A33]/50 uppercase tracking-widest">Fournisseur</TableHead>
                        <TableHead className="font-bebas text-[#1E2A33]/50 uppercase tracking-widest">Montant</TableHead>
                        <TableHead className="font-bebas text-[#1E2A33]/50 uppercase tracking-widest">Statut</TableHead>
                        <TableHead className="text-right font-bebas text-[#1E2A33]/50 uppercase tracking-widest">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedMonths.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-[#1E2A33]/50 font-roboto font-light bg-[#FDFBEF]/30 rounded-xl border border-[#1E2A33]/5">
                                Aucun résultat pour cette recherche ou ces dates.
                            </TableCell>
                        </TableRow>
                    ) : (
                        sortedMonths.map(monthKey => {
                            const group = groupedInvoices[monthKey];
                            const isExpanded = expandedMonths.has(monthKey);

                            return (
                                <React.Fragment key={monthKey}>
                                    {/* Month Header (Collapsible trigger) */}
                                    <TableRow
                                        className={`bg-[#1E2A33]/[0.02] hover:bg-[#1E2A33]/5 cursor-pointer transition-colors ${isExpanded ? 'border-b border-[#1E2A33]/5' : ''}`}
                                        onClick={() => toggleMonth(monthKey)}
                                    >
                                        <TableCell className="w-12 text-[#1E2A33]/50 sm:pl-4 pl-2">
                                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                        </TableCell>
                                        <TableCell colSpan={5} className="py-4">
                                            <div className="flex justify-between w-full items-center">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-bebas text-xl tracking-wider text-[#1E2A33] capitalize">{group.label}</span>
                                                    <Badge variant="secondary" className="bg-white text-[#1E2A33]/60 font-roboto border border-[#1E2A33]/10 hidden sm:inline-flex shadow-sm">
                                                        {group.invoices.length} relevé{group.invoices.length > 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                <span className="font-roboto font-semibold text-[#AE7D5C] sm:pr-4">{group.total.toFixed(2)} €</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>

                                    {/* Invoices lines for the month */}
                                    {isExpanded && group.invoices.map((invoice: any) => (
                                        <TableRow key={invoice.id} className="border-[#1E2A33]/5 hover:bg-[#FDFBEF] transition-colors group cursor-pointer" onClick={() => (window.innerWidth < 640) ? openInvoice(invoice) : null}>
                                            <TableCell className="hidden sm:table-cell"></TableCell>
                                            <TableCell className="font-roboto font-light text-[#1E2A33]/70 hidden sm:table-cell whitespace-nowrap pl-0">{new Date(invoice.date).toLocaleDateString('fr-FR')}</TableCell>
                                            <TableCell className="font-roboto font-medium text-[#1E2A33] whitespace-normal sm:whitespace-nowrap sm:pl-0 pl-4 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-[15px]">{invoice.provider}</span>
                                                    <span className="text-xs text-[#1E2A33]/50 sm:hidden mt-1">{new Date(invoice.date).toLocaleDateString('fr-FR')} • {invoice.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-roboto text-[#1E2A33] whitespace-nowrap text-[15px]">
                                                {invoice.amount !== null && invoice.amount !== undefined
                                                    ? `${invoice.amount.toFixed(2)} €`
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                                <Badge variant="outline" className={`font-roboto tracking-wide bg-transparent ${invoice.status === 'PENDING' ? 'text-[#AE7D5C] border-[#AE7D5C]/30' : 'text-[#1E2A33]/60 border-[#1E2A33]/20'}`}>
                                                    {invoice.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right sm:pr-4">
                                                {(invoice.fileUrl || invoice.provider === 'Bouygues Telecom') && (
                                                    <div className="flex justify-end gap-1 items-center">
                                                        {invoice.provider !== 'Bouygues Telecom' && invoice.fileUrl && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-[#1E2A33]/40 hover:text-[#1E2A33] hover:bg-[#1E2A33]/5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10 rounded-full hidden sm:inline-flex"
                                                                onClick={(e) => downloadPdf(e, invoice)}
                                                                title="Forcer le téléchargement"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 font-roboto font-medium text-[#AE7D5C] hover:text-[#AE7D5C] hover:bg-[#AE7D5C]/10 sm:opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10 px-3 rounded-full"
                                                            onClick={(e) => { e.stopPropagation(); openInvoice(invoice); }}
                                                        >
                                                            {invoice.provider === 'Bouygues Telecom' ? (
                                                                <>
                                                                    <ExternalLink className="w-4 h-4 sm:mr-2" />
                                                                    <span className="hidden sm:inline">Espace Client</span>
                                                                </>
                                                            ) : invoice.fileUrl?.toLowerCase().includes('.html') ? (
                                                                <>
                                                                    <FileText className="w-4 h-4 sm:mr-2" />
                                                                    <span className="hidden sm:inline">Voir le Reçu</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <FileText className="w-4 h-4 sm:mr-2" />
                                                                    <span className="hidden sm:inline">Ouvrir PDF</span>
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </React.Fragment>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
