"use client";

import React, { useState, useMemo } from 'react';
import { FileText, ExternalLink, ChevronDown, ChevronRight, Search, Download, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function InvoiceTable({ invoices }: { invoices: any[] }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterMonth, setFilterMonth] = useState<string>('all');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

            const invDate = new Date(invoice.date);
            const invYearStr = invDate.getFullYear().toString();
            const invMonthStr = String(invDate.getMonth() + 1).padStart(2, '0');

            let matchesYear = filterYear === 'all' || invYearStr === filterYear;
            let matchesMonth = filterMonth === 'all' || invMonthStr === filterMonth;

            return matchesSearch && matchesYear && matchesMonth;
        });
    }, [invoices, searchQuery, filterYear, filterMonth]);

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
        if (invoice.fileUrl) {
            setPreviewUrl(invoice.fileUrl);
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
            <div className="flex flex-col sm:flex-row gap-3 mb-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1E2A33]/40" />
                    <Input
                        placeholder=""
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
                <div className="flex flex-1 min-w-[200px] sm:max-w-xs gap-2">
                    <select
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        className="flex-1 bg-white border border-[#1E2A33]/10 rounded-lg focus-visible:ring-1 focus-visible:outline-none focus-visible:ring-[#AE7D5C] text-[#1E2A33]/70 font-roboto text-sm px-3 h-10"
                    >
                        <option value="all">Tous les mois</option>
                        <option value="01">Janvier</option>
                        <option value="02">Février</option>
                        <option value="03">Mars</option>
                        <option value="04">Avril</option>
                        <option value="05">Mai</option>
                        <option value="06">Juin</option>
                        <option value="07">Juillet</option>
                        <option value="08">Août</option>
                        <option value="09">Septembre</option>
                        <option value="10">Octobre</option>
                        <option value="11">Novembre</option>
                        <option value="12">Décembre</option>
                    </select>

                    <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        className="flex-1 bg-white border border-[#1E2A33]/10 rounded-lg focus-visible:ring-1 focus-visible:outline-none focus-visible:ring-[#AE7D5C] text-[#1E2A33]/70 font-roboto text-sm px-3 h-10"
                    >
                        <option value="all">Toutes les années</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                        <option value="2023">2023</option>
                    </select>
                </div>
            </div>

            <Table>
                <TableHeader>
                    <TableRow className="border-[#1E2A33]/10 hover:bg-transparent hidden sm:table-row">
                        <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest w-12"></TableHead>
                        <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest">Date</TableHead>
                        <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest">Fournisseur</TableHead>
                        <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest">Montant</TableHead>
                        <TableHead className="font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest">Statut</TableHead>
                        <TableHead className="text-right font-roboto text-[#1E2A33]/40 text-[10px] uppercase tracking-widest">Action</TableHead>
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
                                                    <span className="font-roboto text-sm font-bold tracking-wide text-[#1E2A33]/80 uppercase">{group.label}</span>
                                                    <Badge variant="secondary" className="bg-transparent text-[#1E2A33]/40 font-roboto hidden sm:inline-flex px-2 py-0 h-5 text-[10px]">
                                                        {group.invoices.length} relevé{group.invoices.length > 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                <span className="font-roboto text-sm font-light text-[#1E2A33] sm:pr-4">{group.total.toFixed(2)} €</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>

                                    {/* Invoices lines for the month */}
                                    {isExpanded && group.invoices.map((invoice: any) => (
                                        <TableRow key={invoice.id} className="border-[#1E2A33]/5 hover:bg-[#FDFBEF] transition-colors group cursor-pointer" onClick={() => (window.innerWidth < 640) ? openInvoice(invoice) : null}>
                                            <TableCell className="hidden sm:table-cell"></TableCell>
                                            <TableCell className="font-roboto font-light text-[#1E2A33]/50 text-sm hidden sm:table-cell whitespace-nowrap pl-0">{new Date(invoice.date).toLocaleDateString('fr-FR')}</TableCell>
                                            <TableCell className="font-roboto font-light text-[#1E2A33] text-sm whitespace-normal sm:whitespace-nowrap sm:pl-0 pl-4 py-4">
                                                <div className="flex flex-col">
                                                    <span>{invoice.provider}</span>
                                                    <span className="text-[10px] text-[#1E2A33]/40 sm:hidden mt-1">{new Date(invoice.date).toLocaleDateString('fr-FR')} • {invoice.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-roboto font-light text-[#1E2A33] text-sm whitespace-nowrap">
                                                {invoice.amount !== null && invoice.amount !== undefined
                                                    ? `${invoice.amount.toFixed(2)} €`
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${invoice.status === 'PENDING' ? 'bg-[#AE7D5C]' : 'bg-green-500'}`} />
                                                    <span className="text-[11px] font-roboto tracking-wide text-[#1E2A33]/70 uppercase">{invoice.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right sm:pr-4">
                                                {invoice.fileUrl && (
                                                    <div className="flex justify-end gap-1 items-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-[#1E2A33]/40 hover:text-[#1E2A33] hover:bg-[#1E2A33]/5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10 rounded-full hidden sm:inline-flex"
                                                            onClick={(e) => downloadPdf(e, invoice)}
                                                            title="Forcer le téléchargement"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 font-roboto font-medium text-[#AE7D5C] hover:text-[#AE7D5C] hover:bg-[#AE7D5C]/10 sm:opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10 px-3 rounded-full"
                                                            onClick={(e) => { e.stopPropagation(); openInvoice(invoice); }}
                                                        >
                                                            {invoice.fileUrl?.toLowerCase().includes('.html') ? (
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

            {/* PDF Preview Modal */}
            <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
                <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-[#1E2A33]/10">
                    <DialogHeader className="p-4 border-b border-[#1E2A33]/5 flex-shrink-0 flex flex-row items-center justify-between">
                        <DialogTitle className="text-xl font-bebas tracking-wide text-[#1E2A33]">
                            Aperçu de la Facture
                        </DialogTitle>
                        {previewUrl && (
                            <a
                                href={previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-roboto font-medium text-[#AE7D5C] hover:underline mr-8"
                            >
                                <ExternalLink className="w-4 h-4 inline-block mr-1" />
                                Ouvrir dans un nouvel onglet
                            </a>
                        )}
                    </DialogHeader>
                    <div className="flex-1 w-full h-full relative bg-[#1E2A33]/5 flex flex-col items-center justify-center">
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-[#1E2A33]/50 -z-10">
                            <span className="loader mb-4 border-2 border-[#AE7D5C] border-t-transparent rounded-full w-8 h-8 animate-spin" />
                            <p className="font-roboto text-sm">Chargement du document...</p>
                            <p className="font-roboto text-xs mt-2 opacity-60">Si rien ne s'affiche, utilisez le lien "Ouvrir dans un nouvel onglet" en haut à droite.</p>
                        </div>
                        {previewUrl && (
                            <iframe
                                src={`/api/invoices/preview?url=${encodeURIComponent(previewUrl)}`}
                                className="absolute inset-0 w-full h-full border-none z-10"
                                title="Aperçu PDF"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
