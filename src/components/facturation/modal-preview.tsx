"use client";

import React, { useRef } from "react";
import { X, Printer, Download, Film, Stethoscope, CheckCircle2 } from "lucide-react";
import { FeelProdInvoice, KineSession } from "@/types/facturation";

interface ModalPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  item: FeelProdInvoice | KineSession | null;
  type: "feelprod" | "kine";
}

export function ModalPreview({ isOpen, onClose, item, type }: ModalPreviewProps) {
  if (!isOpen || !item) return null;

  const handlePrint = () => {
    window.print();
  };

  const formatEuro = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white text-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Barre d'actions */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            {type === "feelprod" ? (
              <Film className="w-5 h-5 text-[#E2B357]" />
            ) : (
              <Stethoscope className="w-5 h-5 text-[#34D399]" />
            )}
            <span className="font-bold text-sm">
              {type === "feelprod" ? "Aperçu Facture / Devis" : "Note d'Honoraires (Patient / Mutuelle)"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Printable Body */}
        <div className="p-8 overflow-y-auto flex-1 bg-[#FAF7F2] font-sans text-xs print:p-0">
          {type === "feelprod" ? (
            // Format Facture FeelProd
            (() => {
              const inv = item as FeelProdInvoice;
              return (
                <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 space-y-6">
                  {/* En-tête */}
                  <div className="flex justify-between items-start border-b border-slate-200 pb-6">
                    <div>
                      <h1 className="text-2xl font-black tracking-wider text-[#0F172A]">
                        FEELPROD
                      </h1>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Production Audiovisuelle & Création Digitale
                      </p>
                      <p className="text-slate-400 text-[10px] mt-1">
                        Siret : 480 342 901 00021 • Code NAF : 5911B<br />
                        TVA Intracommunautaire : FR 48 480342901
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="inline-block px-3 py-1 rounded-lg bg-[#0F172A] text-[#E2B357] font-bold text-sm">
                        {inv.status === "devis_envoye" || inv.status === "devis_accepte"
                          ? "DEVIS"
                          : "FACTURE"}
                      </div>
                      <p className="text-sm font-bold text-slate-800 mt-2 font-mono">
                        N° {inv.number}
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Date : {inv.date}
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Échéance : {inv.dueDate}
                      </p>
                    </div>
                  </div>

                  {/* Facturé à */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                      Destinataire / Client
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 mt-1">
                      {inv.clientName}
                    </h3>
                    {inv.clientCompany && (
                      <p className="text-slate-600 font-medium">{inv.clientCompany}</p>
                    )}
                    {inv.clientEmail && (
                      <p className="text-slate-400">{inv.clientEmail}</p>
                    )}
                    <div className="mt-2 text-slate-700 font-semibold border-t border-slate-200 pt-1.5">
                      Projet : {inv.projectTitle}
                    </div>
                  </div>

                  {/* Tableau des lignes */}
                  <table className="w-full text-left">
                    <thead className="border-b border-slate-200 text-slate-500 font-bold text-[11px]">
                      <tr>
                        <th className="py-2">Description</th>
                        <th className="py-2 text-center">Qté</th>
                        <th className="py-2 text-right">P.U. HT</th>
                        <th className="py-2 text-right">Total HT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {inv.items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2.5 font-medium">{it.description}</td>
                          <td className="py-2.5 text-center">{it.quantity} {it.unit}</td>
                          <td className="py-2.5 text-right">{it.unitPriceHT.toFixed(2)} €</td>
                          <td className="py-2.5 text-right font-bold">{it.totalHT.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totaux */}
                  <div className="border-t border-slate-200 pt-4 flex justify-end">
                    <div className="w-64 space-y-1.5 text-right">
                      <div className="flex justify-between text-slate-600">
                        <span>Total HT :</span>
                        <span className="font-semibold">{formatEuro(inv.totalHT)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>TVA (20.0%) :</span>
                        <span className="font-semibold">{formatEuro(inv.vatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-base font-black text-[#0F172A] border-t border-slate-300 pt-1.5">
                        <span>Total TTC :</span>
                        <span>{formatEuro(inv.totalTTC)}</span>
                      </div>
                      {inv.depositAmount > 0 && (
                        <div className="flex justify-between text-slate-500 pt-1">
                          <span>Acompte déduit :</span>
                          <span>- {formatEuro(inv.depositAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-amber-700 pt-1">
                        <span>Solde à régler :</span>
                        <span>{formatEuro(inv.remainingDue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Mentions légales */}
                  <div className="text-[9.5px] text-slate-400 border-t border-slate-200 pt-4 space-y-0.5">
                    <p>Conditions de règlement : Paiement à 30 jours à compter de la date de facture.</p>
                    <p>Coordonnées bancaires : LCL Compte Professionnel • IBAN FR76 3000 2000 ...</p>
                    <p>En cas de retard de paiement, indemnité forfaitaire pour frais de recouvrement : 40 € (art. D. 441-5 C. com).</p>
                  </div>
                </div>
              );
            })()
          ) : (
            // Format Note d'honoraires Cabinet Kiné / Thérapie
            (() => {
              const s = item as KineSession;
              return (
                <div className="bg-white p-6 rounded-2xl shadow-xs border border-emerald-200/80 space-y-6">
                  {/* En-tête Cabinet */}
                  <div className="flex justify-between items-start border-b border-emerald-100 pb-6">
                    <div>
                      <h1 className="text-xl font-black tracking-wide text-[#064E3B]">
                        CABINET DE MASSO-KINÉSITHÉRAPIE & THÉRAPIE MANUELLE
                      </h1>
                      <p className="text-slate-600 font-semibold text-xs mt-0.5">
                        Guillaume PHILIPPE • Masseur-Kinésithérapeute D.E.
                      </p>
                      <p className="text-slate-400 text-[10px] mt-1">
                        RPPS : 10005682603 • ADELI : 757068309 • N° Ordre (CDOMK 75) : 52508<br />
                        Cabinet : Via Sana, 28 bis boulevard Sébastopol, 75004 Paris<br />
                        Conventionné Secteur 1 • Membre d'une Association Agréée (règlement par chèque et CB acceptés)
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="inline-block px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs">
                        NOTE D'HONORAIRES
                      </div>
                      <p className="text-xs font-mono text-slate-500 mt-2">
                        Réf. {s.number}
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Date : {s.date}
                      </p>
                    </div>
                  </div>

                  {/* Patient Info */}
                  <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">
                      Reçu délivré à :
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 mt-1">
                      {s.patientName}
                    </h3>
                    {s.patientPhone && (
                      <p className="text-slate-500">{s.patientPhone}</p>
                    )}
                  </div>

                  {/* Acte Description */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center text-sm font-semibold text-slate-800">
                      <span>{s.actLabel}</span>
                      <span className="text-base font-bold text-emerald-700">
                        {formatEuro(s.totalAmount)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
                      <span>Mode de règlement : <strong className="capitalize text-slate-700">{s.paymentMethod}</strong></span>
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Règlement acquitté
                      </span>
                    </div>
                  </div>

                  {/* Mention Fiscale & Remboursement */}
                  <div className="bg-slate-50 p-3 rounded-xl text-[10.5px] text-slate-600 space-y-1">
                    <p className="font-semibold text-emerald-800">
                      Mention Légale Fiscale : Exonération de TVA, art. 261-4-1° du CGI.
                    </p>
                    <p className="text-slate-500">
                      Ce reçu est délivré pour faire valoir auprès de votre organisme de complémentaire santé (Mutuelle) dans le cadre de la prise en charge des soins de thérapie manuelle ou ostéopathique.
                    </p>
                  </div>

                  {/* Signature */}
                  <div className="pt-4 flex justify-between items-end border-t border-slate-200">
                    <div className="text-[10px] text-slate-400">
                      Fait pour servir et valoir ce que de droit.
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-slate-700">Signature du praticien :</p>
                      <div className="h-12 w-32 border-b border-dashed border-slate-400 mt-1" />
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
