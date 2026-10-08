"use client";

import React, { useState } from "react";
import { X, Stethoscope, Sparkles, CheckCircle2, Clock, FileCheck2 } from "lucide-react";
import { KineSession, KineActType, KinePaymentMethod, KinePaymentStatus } from "@/types/facturation";

interface ModalNewKineProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (session: KineSession) => void;
}

const PRESET_ACTS = [
  { label: "Thérapie Manuelle Tissulaire (HN)", price: 70, type: "hors_nomenclature" as KineActType },
  { label: "Consultation Ostéopathique & Fascias (HN)", price: 80, type: "hors_nomenclature" as KineActType },
  { label: "Bilan Postural Global & Séance (HN)", price: 75, type: "hors_nomenclature" as KineActType },
  { label: "Rééducation du rachis (AMK 9.5)", price: 20.43, type: "conventionne" as KineActType },
  { label: "Rééducation membre inférieur/supérieur (AMK 7.5)", price: 16.13, type: "conventionne" as KineActType },
];

export function ModalNewKine({ isOpen, onClose, onSave }: ModalNewKineProps) {
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [actType, setActType] = useState<KineActType>("hors_nomenclature");
  const [actLabel, setActLabel] = useState("Thérapie Manuelle Tissulaire (HN)");
  const [unitPrice, setUnitPrice] = useState<number>(70);
  const [paymentMethod, setPaymentMethod] = useState<KinePaymentMethod>("cb");
  const [paymentStatus, setPaymentStatus] = useState<KinePaymentStatus>("regle");
  const [deferredDepositDate, setDeferredDepositDate] = useState("");
  const [notes, setNotes] = useState("");

  if (!isOpen) return null;

  const handleSelectPreset = (preset: typeof PRESET_ACTS[0]) => {
    setActLabel(preset.label);
    setUnitPrice(preset.price);
    setActType(preset.type);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName) return;

    const newSession: KineSession = {
      id: `kin-${Date.now()}`,
      number: `KIN-2026-${String(Math.floor(Math.random() * 900) + 100)}`,
      date,
      patientName,
      patientPhone,
      actType,
      actLabel,
      sessionCount: 1,
      unitPrice,
      totalAmount: unitPrice,
      vatRate: 0,
      vatExemptMention: "Exonération de TVA, art. 261-4-1° du CGI",
      paymentMethod,
      paymentStatus,
      deferredDepositDate: paymentStatus === "differe" ? deferredDepositDate : undefined,
      accountingAccount: "705000",
      notes,
    };

    onSave(newSession);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#151D24] w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#064E3B] text-white p-5 flex items-center justify-between border-b border-emerald-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#34D399] text-[#064E3B]">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Pointer une Séance Cabinet
              </h3>
              <p className="text-xs text-emerald-100">
                Thérapie manuelle • Soins HN & Conventionnés • Exonéré TVA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Patient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nom & Prénom du Patient *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Jean Dupont"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#34D399]"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Téléphone (Optionnel)
              </label>
              <input
                type="tel"
                placeholder="06 12 34 56 78"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Date de la Séance
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
                Régime & TVA
              </label>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span className="font-semibold">Exonéré (0%)</span>
                <span className="text-[10px] italic">Art. 261-4-1° CGI</span>
              </div>
            </div>
          </div>

          {/* Préréglages d'actes */}
          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1.5">
              Sélection rapide de l'acte :
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ACTS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-3 py-1.5 rounded-xl text-left border transition-colors cursor-pointer ${
                    actLabel === preset.label
                      ? "bg-emerald-100 dark:bg-emerald-900/60 border-emerald-500 text-emerald-900 dark:text-white font-bold"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                  }`}
                >
                  <span className="block">{preset.label}</span>
                  <span className="text-[10px] opacity-75">{preset.price} €</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description & Tarif */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Libellé de l'acte
              </label>
              <input
                type="text"
                value={actLabel}
                onChange={(e) => setActLabel(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Tarif Séance (€)
              </label>
              <input
                type="number"
                step="any"
                value={unitPrice}
                onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right font-bold text-slate-900 dark:text-white text-sm"
              />
            </div>
          </div>

          {/* Règlement */}
          <div className="border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 space-y-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                Mode de Paiement
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(["cb", "cheque", "especes", "virement"] as KinePaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-1.5 px-2 rounded-xl border text-center font-medium capitalize transition-colors cursor-pointer ${
                      paymentMethod === m
                        ? "bg-[#064E3B] text-white border-[#064E3B] font-bold"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {m === "cb" ? "Carte Bancaire" : m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Statut de l'Encaissement
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as KinePaymentStatus)}
                  className="w-full p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="regle">Encaissé immédiatement</option>
                  <option value="differe">Chèque différé (remise différée)</option>
                  <option value="en_attente">En attente (tiers-payant / virement)</option>
                </select>
              </div>

              {paymentStatus === "differe" && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Date de Dépôt Prévue
                  </label>
                  <input
                    type="date"
                    value={deferredDepositDate}
                    onChange={(e) => setDeferredDepositDate(e.target.value)}
                    className="w-full p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Notes cliniques / Observation
            </label>
            <input
              type="text"
              placeholder="Ex: Reçu mutuelle délivré, bilan cervicalgie"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
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
              className="px-5 py-2.5 rounded-xl font-bold bg-[#064E3B] text-[#34D399] hover:bg-[#064E3B]/90 shadow-md cursor-pointer transition-transform active:scale-98"
            >
              Valider la séance ({unitPrice} €)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
