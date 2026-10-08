"use client";

import React, { useState } from "react";
import { X, Plus, Trash2, Film, Sparkles, Calculator } from "lucide-react";
import { FeelProdInvoice, FeelProdItem, FeelProdItemType, InvoiceStatus } from "@/types/facturation";

interface ModalNewFeelProdProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoice: FeelProdInvoice) => void;
}

export function ModalNewFeelProd({ isOpen, onClose, onSave }: ModalNewFeelProdProps) {
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState<InvoiceStatus>("facture");
  const [depositPercent, setDepositPercent] = useState<number>(30);
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<FeelProdItem[]>([
    {
      id: "item-1",
      type: "tjm_tournage",
      description: "Tournage cinéma 4K & éclairage (Journée)",
      quantity: 1,
      unit: "jour",
      unitPriceHT: 750,
      totalHT: 750,
    },
  ]);

  if (!isOpen) return null;

  const handleAddItem = (type: FeelProdItemType = "autre", label = "", price = 0, unit: 'jour' | 'demi-jour' | 'forfait' | 'km' | 'unite' = "forfait") => {
    const newItem: FeelProdItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      description: label || "Prestation audiovisuelle",
      quantity: 1,
      unit,
      unitPriceHT: price,
      totalHT: price,
    };
    setItems([...items, newItem]);
  };

  const handleItemChange = (
    index: number,
    field: keyof FeelProdItem,
    value: any
  ) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    if (field === "quantity" || field === "unitPriceHT") {
      updated[index].totalHT =
        Number(updated[index].quantity || 0) * Number(updated[index].unitPriceHT || 0);
    }
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculs totaux
  const totalHT = items.reduce((sum, it) => sum + (Number(it.totalHT) || 0), 0);
  const vatRate = 20;
  const vatAmount = totalHT * 0.2;
  const totalTTC = totalHT + vatAmount;
  const depositAmount = (totalTTC * depositPercent) / 100;
  const remainingDue = status === "paye" ? 0 : totalTTC - (status === "partiel" ? depositAmount : 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !projectTitle) return;

    const newInvoice: FeelProdInvoice = {
      id: `fp-${Date.now()}`,
      number: `FP-2026-${String(Math.floor(Math.random() * 900) + 100)}`,
      date,
      dueDate,
      clientName,
      clientCompany: clientCompany || clientName,
      clientEmail,
      projectTitle,
      items,
      totalHT,
      vatRate,
      vatAmount,
      totalTTC,
      depositAmount,
      remainingDue,
      status,
      accountingAccount: "706000",
      vatAccount: "445710",
      notes,
    };

    onSave(newInvoice);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#151D24] w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#0F172A] text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#E2B357] text-[#0F172A]">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Nouveau Dossier / Facture FeelProd
              </h3>
              <p className="text-xs text-slate-300">
                Audiovisuel • TVA 20% • TJM & Prestations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Client & Projet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nom du Client / Marque *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Galerie d'Art Contemporain"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#E2B357]"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Titre du Projet / Prestation *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Teaser Exposition & Film Présentation"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#E2B357]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Date d'Émission
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Échéance
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Statut
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="devis_envoye">Devis envoyé</option>
                <option value="devis_accepte">Devis accepté</option>
                <option value="facture">Facture émise</option>
                <option value="partiel">Acompte perçu</option>
                <option value="paye">Payé / Soldé</option>
              </select>
            </div>
          </div>

          {/* Boutons d'insertion rapide de lignes types */}
          <div>
            <span className="block text-slate-500 text-[11px] mb-1.5 font-medium">
              Ajout rapide de forfaits prédéfinis :
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleAddItem("tjm_tournage", "Tournage journée (Cadre & Son)", 750, "jour")}
                className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 cursor-pointer"
              >
                + 1j Tournage (750€)
              </button>
              <button
                type="button"
                onClick={() => handleAddItem("tjm_realisation", "Direction de production & Réalisation", 850, "jour")}
                className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 cursor-pointer"
              >
                + 1j Réalisation (850€)
              </button>
              <button
                type="button"
                onClick={() => handleAddItem("tjm_drone", "Prises de vues aériennes drone S3", 900, "jour")}
                className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50 hover:bg-sky-100 cursor-pointer"
              >
                + 1j Drone (900€)
              </button>
              <button
                type="button"
                onClick={() => handleAddItem("forfait_montage", "Montage, étalonnage 4K & mixage son", 1800, "forfait")}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 cursor-pointer"
              >
                + Forfait Montage (1800€)
              </button>
              <button
                type="button"
                onClick={() => handleAddItem("deplacement_km", "Frais kilométriques déplacement", 0.4, "km")}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                + Frais km (0.40€/km)
              </button>
            </div>
          </div>

          {/* Lignes de prestations */}
          <div className="space-y-2 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Lignes de Prestations (Compte 706000)
              </span>
              <button
                type="button"
                onClick={() => handleAddItem()}
                className="text-xs font-semibold text-[#E2B357] flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
              </button>
            </div>

            {items.map((it, idx) => (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-center bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="col-span-12 sm:col-span-5">
                  <input
                    type="text"
                    placeholder="Description de la prestation"
                    value={it.description}
                    onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                    className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    placeholder="Qté"
                    value={it.quantity}
                    onChange={(e) => handleItemChange(idx, "quantity", parseFloat(e.target.value) || 0)}
                    className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Prix HT"
                    value={it.unitPriceHT}
                    onChange={(e) => handleItemChange(idx, "unitPriceHT", parseFloat(e.target.value) || 0)}
                    className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-right"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2 text-right font-bold text-slate-800 dark:text-slate-100">
                  {it.totalHT.toFixed(2)} €
                </div>
                <div className="col-span-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totaux & Calculs automatiques */}
          <div className="bg-slate-100 dark:bg-slate-800/70 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-slate-600 dark:text-slate-300 font-medium">
                Acompte demandé (%) :
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={depositPercent}
                onChange={(e) => setDepositPercent(Number(e.target.value))}
                className="w-16 p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-center font-bold"
              />
            </div>

            <div className="space-y-1 text-right w-full sm:w-auto">
              <div className="text-slate-600 dark:text-slate-400">
                Total HT : <span className="font-semibold">{totalHT.toFixed(2)} €</span>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                TVA (20%) : <span className="font-semibold">{vatAmount.toFixed(2)} €</span>
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                Total TTC : <span>{totalTTC.toFixed(2)} €</span>
              </div>
              <div className="text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                Acompte {depositPercent}% : {depositAmount.toFixed(2)} € | Solde : {remainingDue.toFixed(2)} €
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl font-bold bg-[#0F172A] text-[#E2B357] hover:bg-slate-900 shadow-md cursor-pointer transition-transform active:scale-98"
            >
              Enregistrer le dossier FeelProd
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
