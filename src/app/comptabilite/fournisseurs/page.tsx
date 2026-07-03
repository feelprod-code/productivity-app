"use client";

import React, { useEffect, useState } from "react";
import { 
  Key, 
  Search, 
  Plus, 
  ExternalLink, 
  Copy, 
  Eye, 
  EyeOff, 
  Edit, 
  Trash2, 
  X, 
  Check, 
  ShieldCheck, 
  CreditCard,
  Notebook,
  AlertTriangle
} from "lucide-react";

interface Supplier {
  id: string;
  name: string;
  loginUrl: string | null;
  email: string | null;
  username: string | null;
  password: string | null;
  monthlyCharge: number | null;
  currency: string;
  notes: string | null;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password visibility map
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Clipboard copy feedback map
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Partial<Supplier> | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [submitting, setSubmitting] = useState(false);

  // Load suppliers
  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to load suppliers");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  // Filter suppliers based on search query
  const filteredSuppliers = suppliers.filter((s) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      s.name.toLowerCase().includes(query) ||
      (s.email && s.email.toLowerCase().includes(query)) ||
      (s.username && s.username.toLowerCase().includes(query)) ||
      (s.notes && s.notes.toLowerCase().includes(query))
    );
  });

  // Calculate totals
  const totalMonthlyCharge = filteredSuppliers.reduce((sum, s) => {
    return sum + (s.monthlyCharge || 0);
  }, 0);

  // Toggle password visibility
  const togglePassword = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Copy to clipboard
  const handleCopy = async (text: string, id: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedStates((prev) => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (e) {
      console.error("Clipboard copy failed:", e);
    }
  };

  // Open modal for add
  const handleOpenAddModal = () => {
    setModalMode("add");
    setCurrentSupplier({
      name: "",
      loginUrl: "",
      email: "guillaume@feelprod.com",
      username: "",
      password: "",
      monthlyCharge: 0,
      currency: "EUR",
      notes: ""
    });
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEditModal = (supplier: Supplier) => {
    setModalMode("edit");
    setCurrentSupplier({ ...supplier });
    setIsModalOpen(true);
  };

  // Save / Update Supplier
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSupplier || !currentSupplier.name) return;

    try {
      setSubmitting(true);
      const url = "/api/suppliers";
      const method = modalMode === "add" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentSupplier)
      });

      if (res.ok) {
        setIsModalOpen(false);
        loadSuppliers();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to save supplier");
      }
    } catch (err: any) {
      alert(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Supplier
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le fournisseur "${name}" ?`)) return;

    try {
      const res = await fetch(`/api/suppliers?id=${id}`, {
        method: "DELETE"
      });

      if (res.ok) {
        loadSuppliers();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to delete supplier");
      }
    } catch (err: any) {
      alert(err.message || "An error occurred");
    }
  };

  return (
    <main className="min-h-screen bg-[#FDFBEF] text-[#1E2A33] p-6 font-sans relative overflow-hidden pb-16">
      {/* TDT Grid Background Effect */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 z-0 pointer-events-none"></div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 pb-6 border-b border-[#1E2A33]/10">
          <div className="flex items-center gap-4">
            <div className="h-10 w-2 bg-[#AE7D5C] rounded-full shadow-[0_0_15px_rgba(174,125,92,0.4)]"></div>
            <div>
              <h1 className="text-3xl sm:text-5xl font-bebas tracking-wide text-[#1E2A33] leading-tight">
                IDENTIFIANTS <span className="text-[#AE7D5C]">&amp; FOURNISSEURS</span>
              </h1>
              <p className="font-roboto font-light text-xs text-[#1E2A33]/60 mt-1">
                Centralisation des comptes, accès de connexion et charges financières des prestataires.
              </p>
            </div>
          </div>
          
          <button
            onClick={handleOpenAddModal}
            className="w-full md:w-auto bg-[#1E2A33] text-[#FDFBEF] hover:bg-[#AE7D5C] transition-all font-roboto font-semibold text-sm px-6 py-3 rounded-full flex items-center justify-center gap-2 shadow-md cursor-pointer duration-200"
          >
            <Plus className="w-4 h-4" />
            Nouveau Fournisseur
          </button>
        </div>

        {/* Stats Dashboard cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/40 ring-1 ring-[#1E2A33]/5 rounded-2xl p-5 backdrop-blur-sm flex items-center justify-between shadow-xs">
            <div>
              <p className="text-xs font-roboto font-bold text-[#1E2A33]/50 uppercase tracking-wider">Total Fournisseurs</p>
              <p className="font-bebas text-3xl sm:text-4xl text-[#1E2A33] mt-1">{suppliers.length}</p>
            </div>
            <div className="p-3 bg-[#1E2A33]/5 rounded-xl text-[#1E2A33]">
              <Key className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white/40 ring-1 ring-[#1E2A33]/5 rounded-2xl p-5 backdrop-blur-sm flex items-center justify-between shadow-xs">
            <div>
              <p className="text-xs font-roboto font-bold text-[#1E2A33]/50 uppercase tracking-wider">Charges Mensuelles Totales</p>
              <p className="font-bebas text-3xl sm:text-4xl text-[#AE7D5C] mt-1">
                {totalMonthlyCharge.toFixed(2)} EUR
              </p>
            </div>
            <div className="p-3 bg-[#AE7D5C]/10 rounded-xl text-[#AE7D5C]">
              <CreditCard className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white/40 ring-1 ring-[#1E2A33]/5 rounded-2xl p-5 backdrop-blur-sm flex items-center justify-between shadow-xs">
            <div>
              <p className="text-xs font-roboto font-bold text-[#1E2A33]/50 uppercase tracking-wider">Sécurité des Comptes</p>
              <p className="font-roboto font-semibold text-sm text-green-700 mt-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> Espace Chiffré Localement
              </p>
            </div>
            <div className="p-3 bg-green-50 rounded-xl text-green-700">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <span className="absolute inset-y-0 left-4 flex items-center text-[#1E2A33]/40">
            <Search className="w-5 h-5" />
          </span>
          <input
            type="text"
            placeholder="Rechercher par nom de fournisseur, email, identifiant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-[#1E2A33]/10 rounded-xl font-roboto text-sm focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]/30 focus:border-[#AE7D5C] transition-all"
          />
        </div>

        {/* Suppliers List / Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-sm text-[#1E2A33]/60 bg-white/40 border border-[#1E2A33]/10 rounded-2xl">
            <span className="loader mb-3 border-2 border-[#AE7D5C] border-t-transparent rounded-full w-6 h-6 animate-spin" />
            Chargement des fournisseurs...
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Erreur de chargement</p>
              <p className="font-light mt-1">{error}</p>
            </div>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center text-sm font-roboto text-[#1E2A33]/40 bg-white/40 border border-[#1E2A33]/10 rounded-2xl backdrop-blur-sm">
            Aucun fournisseur trouvé.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSuppliers.map((s) => {
              const hasPassword = !!s.password;
              const isPasswordVisible = visiblePasswords[s.id] || false;
              const isCopied = copiedStates[s.id] || false;

              return (
                <div 
                  key={s.id}
                  className="bg-white border border-[#1E2A33]/10 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-[#AE7D5C]/30 transition-all duration-200"
                >
                  <div className="space-y-4">
                    {/* Title and actions */}
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="font-roboto font-bold text-base text-[#1E2A33]">{s.name}</h3>
                        {s.loginUrl ? (
                          <a 
                            href={s.loginUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-xs text-[#AE7D5C] hover:underline flex items-center gap-1 mt-0.5"
                          >
                            Se connecter <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-[#1E2A33]/30 italic">Pas d'URL de connexion</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleOpenEditModal(s)}
                          className="p-1.5 text-[#1E2A33]/60 hover:text-[#AE7D5C] hover:bg-[#1E2A33]/5 rounded-md transition-colors cursor-pointer"
                          title="Modifier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id, s.name)}
                          className="p-1.5 text-[#1E2A33]/60 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Cost Badge */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-roboto font-medium px-2.5 py-1 rounded-md bg-[#AE7D5C]/10 text-[#AE7D5C] border border-[#AE7D5C]/15">
                        {s.monthlyCharge ? `${s.monthlyCharge.toFixed(2)} ${s.currency}/mois` : "Pas de charge récurrente"}
                      </span>
                    </div>

                    {/* Credentials Info block */}
                    <div className="space-y-2 pt-2 border-t border-[#1E2A33]/5">
                      {s.email && (
                        <div className="flex justify-between items-center text-xs font-roboto">
                          <span className="text-[#1E2A33]/50">Email :</span>
                          <div className="flex items-center gap-1.5 max-w-[70%]">
                            <span className="truncate text-[#1E2A33] font-medium" title={s.email}>{s.email}</span>
                            <button
                              onClick={() => handleCopy(s.email!, `email-${s.id}`)}
                              className="text-[#1E2A33]/40 hover:text-[#1E2A33] transition-colors p-0.5 cursor-pointer"
                            >
                              {copiedStates[`email-${s.id}`] ? (
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {s.username && (
                        <div className="flex justify-between items-center text-xs font-roboto">
                          <span className="text-[#1E2A33]/50">Identifiant :</span>
                          <div className="flex items-center gap-1.5 max-w-[70%]">
                            <span className="truncate text-[#1E2A33] font-medium" title={s.username}>{s.username}</span>
                            <button
                              onClick={() => handleCopy(s.username!, `user-${s.id}`)}
                              className="text-[#1E2A33]/40 hover:text-[#1E2A33] transition-colors p-0.5 cursor-pointer"
                            >
                              {copiedStates[`user-${s.id}`] ? (
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {hasPassword ? (
                        <div className="flex justify-between items-center text-xs font-roboto">
                          <span className="text-[#1E2A33]/50">Mot de passe :</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm font-semibold tracking-wider text-[#1E2A33]">
                              {isPasswordVisible ? s.password : "••••••••"}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => togglePassword(s.id)}
                                className="text-[#1E2A33]/40 hover:text-[#1E2A33] transition-colors p-0.5 cursor-pointer"
                              >
                                {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleCopy(s.password!, s.id)}
                                className="text-[#1E2A33]/40 hover:text-[#1E2A33] transition-colors p-0.5 cursor-pointer"
                              >
                                {isCopied ? (
                                  <Check className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center text-xs font-roboto text-[#1E2A33]/30 italic">
                          <span>Mot de passe :</span>
                          <span>Non renseigné</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes Area if any */}
                  {s.notes && (
                    <div className="mt-4 pt-3 border-t border-[#1E2A33]/5 flex items-start gap-1.5 text-xs text-[#1E2A33]/60 bg-[#FDFBEF]/50 p-2.5 rounded-lg font-roboto leading-relaxed">
                      <Notebook className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#AE7D5C]" />
                      <span className="line-clamp-2">{s.notes}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Modal Dialog */}
      {isModalOpen && currentSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white border border-[#1E2A33]/15 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-[#1E2A33]/10 px-6 py-4">
              <h2 className="font-bebas text-2xl tracking-wide text-[#1E2A33]">
                {modalMode === "add" ? "Ajouter un Fournisseur" : "Modifier le Fournisseur"}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-[#1E2A33]/50 hover:text-[#1E2A33] hover:bg-[#1E2A33]/5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-6 space-y-4 font-roboto text-sm">
              <div className="space-y-1">
                <label className="font-bold text-[#1E2A33]/70">Nom du Fournisseur *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: CARPIMKO, URSSAF, Supabase"
                  value={currentSupplier.name || ""}
                  onChange={(e) => setCurrentSupplier(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-2.5 border border-[#1E2A33]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]/30 focus:border-[#AE7D5C]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1E2A33]/70">URL de Connexion</label>
                <input
                  type="url"
                  placeholder="Ex: https://www.urssaf.fr"
                  value={currentSupplier.loginUrl || ""}
                  onChange={(e) => setCurrentSupplier(prev => ({ ...prev, loginUrl: e.target.value }))}
                  className="w-full p-2.5 border border-[#1E2A33]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]/30 focus:border-[#AE7D5C]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-[#1E2A33]/70">Email du Compte</label>
                  <input
                    type="email"
                    placeholder="Ex: guillaume@feelprod.com"
                    value={currentSupplier.email || ""}
                    onChange={(e) => setCurrentSupplier(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full p-2.5 border border-[#1E2A33]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]/30 focus:border-[#AE7D5C]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1E2A33]/70">Identifiant / Pseudo</label>
                  <input
                    type="text"
                    placeholder="Ex: g_philippe"
                    value={currentSupplier.username || ""}
                    onChange={(e) => setCurrentSupplier(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full p-2.5 border border-[#1E2A33]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]/30 focus:border-[#AE7D5C]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-[#1E2A33]/70">Mot de Passe</label>
                  <input
                    type="text"
                    placeholder="Ex: motdepasse123"
                    value={currentSupplier.password || ""}
                    onChange={(e) => setCurrentSupplier(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full p-2.5 border border-[#1E2A33]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]/30 focus:border-[#AE7D5C]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1E2A33]/70">Charge Mensuelle (€ / $)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 25.00"
                    value={currentSupplier.monthlyCharge || ""}
                    onChange={(e) => setCurrentSupplier(prev => ({ ...prev, monthlyCharge: e.target.value ? parseFloat(e.target.value) : 0 }))}
                    className="w-full p-2.5 border border-[#1E2A33]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]/30 focus:border-[#AE7D5C]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1E2A33]/70">Notes / Informations utiles</label>
                <textarea
                  rows={3}
                  placeholder="Notes, période d'échéance, etc."
                  value={currentSupplier.notes || ""}
                  onChange={(e) => setCurrentSupplier(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full p-2.5 border border-[#1E2A33]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#AE7D5C]/30 focus:border-[#AE7D5C] resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2A33]/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[#1E2A33]/15 hover:bg-[#1E2A33]/5 rounded-lg transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#1E2A33] hover:bg-[#AE7D5C] text-[#FDFBEF] rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
