"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ArrowLeft, 
  Trash2, 
  Send, 
  Camera, 
  Sparkles,
  FileCheck,
  Eye,
  Search
} from "lucide-react";
import Link from "next/link";

interface ExtractedData {
  supplier_name: string;
  invoice_date: string;
  amount: number;
  recipient_name: string;
  description: string;
}

interface UploadedFile {
  id: string;
  file: File;
  previewUrl: string;
  status: "idle" | "analyzing" | "ready" | "uploading" | "success" | "error";
  extractedData?: ExtractedData;
  errorMsg?: string;
  pennylaneInvoiceId?: number;
  matchedTransaction?: {
    label: string;
    date: string;
    amount: number;
  } | null;
}

const TRANSACTION_CATEGORIES = [
  { value: "LOGICIELS_IA", label: "💻 IA & Logiciels", color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  { value: "RESTAURANT", label: "🍴 Restaurant & Repas", color: "text-orange-700 bg-orange-50 border-orange-200" },
  { value: "FOURNITURES", label: "📁 Fournitures bureau", color: "text-amber-700 bg-amber-50 border-amber-200" },
  { value: "DEPLACEMENTS", label: "🚗 Déplacements & Auto", color: "text-purple-700 bg-purple-50 border-purple-200" },
  { value: "CABINET", label: "🏠 Frais Cabinet", color: "text-teal-700 bg-teal-50 border-teal-200" },
  { value: "COTISATIONS", label: "💼 Cotisations & Prévoyance", color: "text-blue-700 bg-blue-50 border-blue-200" },
  { value: "PERSO", label: "👤 Dépense Perso (108)", color: "text-rose-700 bg-rose-50 border-rose-200" }
];

export default function ImportPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "info" | "error" }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeView, setActiveView] = useState<"upload" | "history">("upload");
  const [importedInvoices, setImportedInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [showMatched, setShowMatched] = useState(false);

  const loadHistory = useCallback(() => {
    setLoadingInvoices(true);
    
    // Charger simultanément les factures et le relevé des transactions pour faire le rapprochement
    Promise.all([
      fetch("/api/invoices").then(res => res.json()),
      fetch("/api/transactions/releve").then(res => res.json())
    ]).then(([invData, txData]) => {
      if (invData.success) {
        const invoices = invData.invoices || [];
        const transactions = txData.transactions || [];
        
        // Extraire tous les IDs de factures déjà associées à des transactions
        const matchedIds = new Set<string>();
        transactions.forEach((tx: any) => {
          if (tx.matchedInvoice && tx.matchedInvoice.id) {
            matchedIds.add(String(tx.matchedInvoice.id));
          }
        });
        
        // Enrichir les factures avec leur état de rapprochement
        const enriched = invoices.map((inv: any) => ({
          ...inv,
          isMatched: matchedIds.has(String(inv.id)) || inv.status === "COMPLETED"
        }));
        
        setImportedInvoices(enriched);
      }
    })
    .catch(err => console.error("Error loading invoices history:", err))
    .finally(() => setLoadingInvoices(false));
  }, []);

  useEffect(() => {
    if (activeView === "history") {
      loadHistory();
    }
  }, [activeView, loadHistory]);

  const filteredImportedInvoices = useMemo(() => {
    return importedInvoices.filter(inv => {
      // 1. Exclure les factures déjà rapprochées, sauf si showMatched est true
      if (inv.isMatched && !showMatched) return false;

      // 2. Filtrage par mot-clé de recherche
      if (!historySearchQuery) return true;
      const query = historySearchQuery.toLowerCase();
      return (
        inv.provider.toLowerCase().includes(query) ||
        (inv.amount && String(inv.amount).includes(query)) ||
        (inv.status && inv.status.toLowerCase().includes(query))
      );
    });
  }, [importedInvoices, historySearchQuery, showMatched]);

  const showToast = (message: string, type: "success" | "info" | "error" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Clean up previews on unmount
  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, [files]);

  // Auto guess default category
  const guessDefaultCategory = (supplier: string, recipient: string): string => {
    const sLower = supplier.toLowerCase();
    const rLower = recipient.toLowerCase();

    // Check personal names
    if (rLower.includes("sabrina") || rLower.includes("kanouche") || rLower.includes("anita") || rLower.includes("kacha")) {
      return "PERSO";
    }

    if (sLower.includes("openai") || sLower.includes("chatgpt") || sLower.includes("openrouter") || sLower.includes("cloudflare") || sLower.includes("supabase") || sLower.includes("vercel") || sLower.includes("github") || sLower.includes("canva")) {
      return "LOGICIELS_IA";
    }
    if (sLower.includes("restaurant") || sLower.includes("bistro") || sLower.includes("cafe") || sLower.includes("brasserie") || sLower.includes("halles") || sLower.includes("sebastopol") || sLower.includes("starbucks") || sLower.includes("mcdonald")) {
      return "RESTAURANT";
    }
    if (sLower.includes("sapn") || sLower.includes("aprr") || sLower.includes("sanef") || sLower.includes("cofiroute") || sLower.includes("autoroute") || sLower.includes("peage") || sLower.includes("sncf") || sLower.includes("taxi") || sLower.includes("parking") || sLower.includes("indigo") || sLower.includes("total") || sLower.includes("uber")) {
      return "DEPLACEMENTS";
    }
    if (sLower.includes("doctolib") || sLower.includes("medical") || sLower.includes("pharmacie")) {
      return "CABINET";
    }
    if (sLower.includes("urssaf") || sLower.includes("carpimko") || sLower.includes("assurance pro") || sLower.includes("prevoyance")) {
      return "COTISATIONS";
    }
    return "FOURNITURES";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFilesToList(selectedFiles);
    }
  };

  const addFilesToList = (selectedFiles: File[]) => {
    const newFiles: UploadedFile[] = selectedFiles.map(file => {
      // Create Object URL for ALL files to allow PDF or image previews
      const previewUrl = URL.createObjectURL(file);
      
      return {
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl,
        status: "idle"
      };
    });

    setFiles(prev => [...prev, ...newFiles]);
    
    // Auto-select the first newly uploaded file
    if (newFiles.length > 0) {
      setSelectedFileId(newFiles[0].id);
    }

    // Auto-trigger analysis for these files
    newFiles.forEach(f => {
      showToast(`Document "${f.file.name}" ajouté. Analyse OCR en cours...`, "info");
      analyzeFile(f);
    });
  };

  const analyzeFile = async (uploadedFile: UploadedFile) => {
    setFiles(prev => prev.map(f => f.id === uploadedFile.id ? { ...f, status: "analyzing" } : f));

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile.file);

      const res = await fetch("/api/documents/analyze", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const extracted: ExtractedData = data.data;
        const defaultCategory = guessDefaultCategory(extracted.supplier_name, extracted.recipient_name);

        setFiles(prev => prev.map(f => f.id === uploadedFile.id ? { 
          ...f, 
          status: "ready",
          extractedData: extracted,
          errorMsg: defaultCategory // Use errorMsg temporarily for category state
        } : f));
        showToast(`Analyse réussie pour "${uploadedFile.file.name}" !`, "success");
      } else {
        throw new Error(data.error || "L'analyse OCR a échoué");
      }
    } catch (err: any) {
      setFiles(prev => prev.map(f => f.id === uploadedFile.id ? { 
        ...f, 
        status: "error", 
        errorMsg: err.message || "Erreur de traitement"
      } : f));
      showToast(`Échec de l'analyse pour "${uploadedFile.file.name}" : ${err.message}`, "error");
    }
  };

  const updateExtractedField = (id: string, field: keyof ExtractedData, value: any) => {
    setFiles(prev => prev.map(f => {
      if (f.id === id && f.extractedData) {
        return {
          ...f,
          extractedData: {
            ...f.extractedData,
            [field]: value
          }
        };
      }
      return f;
    }));
  };

  const updateFileCategory = (id: string, category: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, errorMsg: category } : f));
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const fileToRem = prev.find(f => f.id === id);
      if (fileToRem && fileToRem.previewUrl) {
        URL.revokeObjectURL(fileToRem.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
    if (selectedFileId === id) {
      setSelectedFileId(null);
    }
  };

  const uploadToPennylane = async (uploadedFile: UploadedFile) => {
    if (!uploadedFile.extractedData) return;

    setFiles(prev => prev.map(f => f.id === uploadedFile.id ? { ...f, status: "uploading" } : f));

    try {
      const category = uploadedFile.errorMsg || "FOURNITURES";
      const formData = new FormData();
      formData.append("file", uploadedFile.file);
      formData.append("supplier_name", uploadedFile.extractedData.supplier_name);
      formData.append("date", uploadedFile.extractedData.invoice_date);
      formData.append("amount", String(uploadedFile.extractedData.amount));
      formData.append("description", uploadedFile.extractedData.description);
      formData.append("category", category);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFiles(prev => prev.map(f => f.id === uploadedFile.id ? { 
          ...f, 
          status: "success",
          pennylaneInvoiceId: data.invoiceId,
          matchedTransaction: data.transaction
        } : f));
        const matchedText = data.transaction ? " et rapprochée avec le débit !" : " envoyée à la boîte de réception.";
        showToast(`Facture "${uploadedFile.file.name}" importée${matchedText}`, "success");
        loadHistory();
      } else {
        throw new Error(data.error || "Téléversement échoué");
      }
    } catch (err: any) {
      setFiles(prev => prev.map(f => f.id === uploadedFile.id ? { 
        ...f, 
        status: "ready",
        errorMsg: `Erreur d'envoi : ${err.message}`
      } : f));
      showToast(`Erreur d'envoi Pennylane : ${err.message}`, "error");
    }
  };

  // Find currently active file to display in split screen preview
  const activeFile = files.find(f => f.id === selectedFileId);

  // Compute helper counts for matched vs unmatched imported invoices
  const totalInvsCount = importedInvoices.length;
  const matchedInvsCount = importedInvoices.filter((inv: any) => inv.isMatched).length;
  const unmatchedInvsCount = totalInvsCount - matchedInvsCount;

  return (
    <div className="min-h-screen bg-[#FDFBEF]/50 pb-28">
      {/* En-tête épinglé (Sticky Header) de l'application */}
      <div className="sticky top-0 z-40 bg-[#FDFBEF]/95 backdrop-blur-md border-b border-[#1E2A33]/5 px-4 pt-4 pb-3 mb-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link 
            href="/comptabilite/releve" 
            className="flex items-center gap-1.5 text-xs font-bold text-[#1E2A33]/60 hover:text-[#1E2A33] transition-colors py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Comptabilité</span>
          </Link>
          
          <h1 className="text-lg font-bebas tracking-wider text-[#1E2A33] uppercase">
            Import Justificatifs
          </h1>
          
          <div className="w-8 sm:w-16" />
        </div>

        {/* Onglets de Navigation simplifiés */}
        <div className="max-w-7xl mx-auto flex gap-6 mt-3 px-1">
          <button
            onClick={() => setActiveView("upload")}
            className={`pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeView === "upload"
                ? "border-[#AE7D5C] text-[#AE7D5C]"
                : "border-transparent text-[#1E2A33]/40 hover:text-[#1E2A33]/70"
            }`}
          >
            Nouveaux
          </button>
          <button
            onClick={() => setActiveView("history")}
            className={`pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeView === "history"
                ? "border-[#AE7D5C] text-[#AE7D5C]"
                : "border-transparent text-[#1E2A33]/40 hover:text-[#1E2A33]/70"
            }`}
          >
            Importés
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8">

      {activeView === "upload" ? (
        /* Grid container for Split layout on desktop */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Upload Zone + File Selector list (Span 5 on Desktop) */}
        <div className="lg:col-span-5 space-y-6">
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            multiple 
            accept="image/*,application/pdf" 
            className="hidden" 
          />

          <div 
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                addFilesToList(Array.from(e.dataTransfer.files));
              }
            }}
            className={`relative border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all shadow-sm select-none ${
              isDragging 
                ? "border-[#AE7D5C] bg-[#FDFBEF] scale-[1.01] ring-4 ring-[#AE7D5C]/10" 
                : "bg-white border-[#AE7D5C]/40 hover:bg-[#FDFBEF] hover:border-[#AE7D5C]/80 active:scale-[0.98]"
            }`}
          >
            <div className="flex flex-col items-center gap-4 pointer-events-none">
              <div className="w-16 h-16 bg-[#AE7D5C]/10 rounded-full flex items-center justify-center text-[#AE7D5C]">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-roboto font-bold text-[#1E2A33]">
                  Glisser un fichier ou photographier
                </h3>
                <p className="text-xs text-[#1E2A33]/50 mt-1.5 leading-relaxed">
                  Supporte PDF, JPG, PNG. Ouvrez la caméra sur iPhone ou déposez vos PDF sur ordinateur.
                </p>
              </div>
            </div>
          </div>

          {/* Queue List of files */}
          <div className="space-y-3">
            {files.length > 0 && (
              <h2 className="text-xs font-roboto font-bold text-[#1E2A33]/40 uppercase tracking-widest px-1">
                Liste des documents ({files.length})
              </h2>
            )}

            {files.map((f) => {
              const isSelected = f.id === selectedFileId;

              return (
                <div 
                  key={f.id}
                  onClick={() => setSelectedFileId(f.id)}
                  className={`p-3 bg-white border rounded-xl shadow-sm flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isSelected ? "border-[#AE7D5C] ring-2 ring-[#AE7D5C]/15" : "border-[#1E2A33]/10 hover:border-[#1E2A33]/25"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-5 h-5 text-[#AE7D5C] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#1E2A33] block truncate">
                        {f.file.name}
                      </span>
                      <span className="text-[9px] text-[#1E2A33]/40 flex items-center gap-1.5 mt-0.5">
                        {(f.file.size / 1024).toFixed(0)} Ko
                        {f.status === "analyzing" && (
                          <span className="text-amber-600 font-semibold flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> OCR en cours
                          </span>
                        )}
                        {f.status === "ready" && (
                          <span className="text-green-600 font-semibold">✓ Prêt à réviser</span>
                        )}
                        {f.status === "success" && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" /> Envoyé
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setSelectedFileId(f.id)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-[#1E2A33]/50 transition-colors"
                      title="Visualiser"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {f.status !== "uploading" && f.status !== "success" && (
                      <button 
                        onClick={() => removeFile(f.id)}
                        className="p-1.5 hover:bg-rose-50 text-[#1E2A33]/30 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Document Preview + Form Review (Span 7 on Desktop) */}
        <div className="lg:col-span-7">
          {activeFile ? (
            <div className="bg-white border border-[#1E2A33]/10 rounded-3xl p-6 shadow-sm space-y-6">
              
              {/* Document Title header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#1E2A33]/5">
                <h3 className="text-sm font-bold text-[#1E2A33] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#AE7D5C]" />
                  Révision : {activeFile.file.name}
                </h3>
                {activeFile.status === "success" && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                    Déjà envoyé Pennylane
                  </span>
                )}
              </div>

              {/* PDF/Image Preview Panel (Especially premium for Desktop/Laptop view!) */}
              <div className="w-full h-[320px] sm:h-[400px] bg-slate-100 rounded-2xl overflow-hidden relative border border-[#1E2A33]/5 flex items-center justify-center">
                {activeFile.file.type.startsWith("image/") ? (
                  <img 
                    src={activeFile.previewUrl} 
                    alt="Aperçu du justificatif"
                    className="w-full h-full object-contain"
                  />
                ) : activeFile.file.type === "application/pdf" ? (
                  <iframe 
                    src={activeFile.previewUrl}
                    className="w-full h-full border-none"
                    title="PDF Invoice Preview"
                  />
                ) : (
                  <div className="text-center p-4">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <span className="text-xs text-slate-500">Format de fichier non prévisualisable en ligne.</span>
                  </div>
                )}
              </div>

              {/* Status Loader or Review Form */}
              {activeFile.status === "analyzing" && (
                <div className="flex flex-col items-center justify-center py-8 gap-3 animate-pulse bg-slate-50/50 rounded-2xl">
                  <Loader2 className="w-8 h-8 text-[#AE7D5C] animate-spin" />
                  <span className="text-xs font-semibold text-[#1E2A33]/60 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#AE7D5C]" />
                    Gemini OCR extrait les données...
                  </span>
                </div>
              )}

              {activeFile.status === "error" && (
                <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs">
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                  <div>
                    <span className="font-bold block">Échec de l'analyse :</span> {activeFile.errorMsg}
                  </div>
                </div>
              )}

              {/* Editable Fields Form once analyzed (Ready or Uploading/Success states) */}
              {activeFile.extractedData && activeFile.status !== "analyzing" && (
                <div className="space-y-4">
                  {/* Pro vs Perso classification indicator */}
                  <div className="flex items-center gap-2">
                    {activeFile.errorMsg === "PERSO" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Achat Personnel (Détecté via bénéficiaire ou catégorie)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Dépense Pro Acceptée (Destinataire conforme)
                      </span>
                    )}
                  </div>

                  {/* Form fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#1E2A33]/50 uppercase tracking-wider block">Marchand</label>
                      <input 
                        type="text" 
                        disabled={activeFile.status === "success" || activeFile.status === "uploading"}
                        value={activeFile.extractedData.supplier_name} 
                        onChange={(e) => updateExtractedField(activeFile.id, "supplier_name", e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-[#1E2A33]/15 text-[#1E2A33] bg-white outline-none focus:border-[#AE7D5C] disabled:bg-slate-50 transition-all font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#1E2A33]/50 uppercase tracking-wider block">Date Facture</label>
                      <input 
                        type="date" 
                        disabled={activeFile.status === "success" || activeFile.status === "uploading"}
                        value={activeFile.extractedData.invoice_date} 
                        onChange={(e) => updateExtractedField(activeFile.id, "invoice_date", e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-[#1E2A33]/15 text-[#1E2A33] bg-white outline-none focus:border-[#AE7D5C] disabled:bg-slate-50 transition-all font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#1E2A33]/50 uppercase tracking-wider block">Montant TTC (€)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        disabled={activeFile.status === "success" || activeFile.status === "uploading"}
                        value={activeFile.extractedData.amount} 
                        onChange={(e) => updateExtractedField(activeFile.id, "amount", parseFloat(e.target.value) || 0)}
                        className="w-full h-10 px-3 rounded-xl border border-[#1E2A33]/15 text-[#1E2A33] bg-white outline-none focus:border-[#AE7D5C] disabled:bg-slate-50 transition-all font-medium font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#1E2A33]/50 uppercase tracking-wider block">Description rapide</label>
                      <input 
                        type="text" 
                        disabled={activeFile.status === "success" || activeFile.status === "uploading"}
                        value={activeFile.extractedData.description} 
                        onChange={(e) => updateExtractedField(activeFile.id, "description", e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-[#1E2A33]/15 text-[#1E2A33] bg-white outline-none focus:border-[#AE7D5C] disabled:bg-slate-50 transition-all font-medium"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold text-[#1E2A33]/50 uppercase tracking-wider block">Catégorie Analytique</label>
                      <select 
                        disabled={activeFile.status === "success" || activeFile.status === "uploading"}
                        value={activeFile.errorMsg || "FOURNITURES"} 
                        onChange={(e) => updateFileCategory(activeFile.id, e.target.value)}
                        className={`w-full h-10 px-2 rounded-xl border outline-none font-medium transition-all cursor-pointer disabled:opacity-75 ${
                          TRANSACTION_CATEGORIES.find(c => c.value === (activeFile.errorMsg || "FOURNITURES"))?.color || 'border-gray-200 text-[#1E2A33] bg-white'
                        }`}
                      >
                        {TRANSACTION_CATEGORIES.map(cat => (
                          <option key={cat.value} value={cat.value} className="bg-white text-[#1E2A33]">
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Submission and upload states */}
                  {activeFile.status === "ready" && (
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => uploadToPennylane(activeFile)}
                        className="flex-1 h-12 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-white bg-[#1E2A33] hover:bg-[#1E2A33]/90 active:scale-[0.98] transition-all"
                      >
                        <Send className="w-4 h-4" />
                        <span>
                          {activeFile.errorMsg === "PERSO" ? "Valider & Marquer en Rejet personnel" : "Valider & Envoyer Pennylane"}
                        </span>
                      </button>
                    </div>
                  )}

                  {activeFile.status === "uploading" && (
                    <div className="flex flex-col items-center justify-center py-4 gap-2 bg-slate-50 rounded-2xl">
                      <Loader2 className="w-5 h-5 text-[#AE7D5C] animate-spin" />
                      <span className="text-[11px] font-semibold text-slate-500">
                        Traitement, renommage et push sur Pennylane...
                      </span>
                    </div>
                  )}

                  {activeFile.status === "success" && (
                    <div className="space-y-4 pt-2">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold">Facture validée et envoyée avec succès !</span>
                      </div>

                      {activeFile.matchedTransaction ? (
                        <div className="bg-[#FDFBEF]/55 border border-[#AE7D5C]/20 p-4 rounded-xl text-xs space-y-2">
                          <h4 className="font-bold text-[10px] uppercase tracking-wider text-[#AE7D5C] flex items-center gap-1">
                            <FileCheck className="w-4 h-4" />
                            Rapprochement Comptable Effectué
                          </h4>
                          <div className="text-[#1E2A33]">
                            Associée au débit bancaire : <span className="font-semibold">"{activeFile.matchedTransaction.label}"</span>
                            <br />
                            <span className="text-[10px] text-[#1E2A33]/50 block mt-0.5">
                              Date Pennylane : {new Date(activeFile.matchedTransaction.date).toLocaleDateString('fr-FR')} | Montant : {Math.abs(activeFile.matchedTransaction.amount)} €
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs text-slate-600">
                          ℹ️ La facture a été téléversée dans votre Boîte de réception Pennylane (aucun débit bancaire pro correspondant n'a été trouvé pour rapprochement automatique).
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

            </div>
          ) : (
            <div className="hidden lg:flex flex-col items-center justify-center gap-3 h-[450px] bg-white/80 backdrop-blur-md border border-[#1E2A33]/10 rounded-3xl p-12 text-center shadow-sm">
              <Upload className="w-12 h-12 text-[#AE7D5C]/40" />
              <h3 className="text-base font-bold text-[#1E2A33]">
                Sélectionnez un document
              </h3>
              <p className="text-xs text-[#1E2A33]/50 max-w-sm">
                Déposez des fichiers sur l'ordinateur à gauche ou prenez une photo depuis votre iPhone, puis sélectionnez le document pour afficher sa prévisualisation interactive et ses métadonnées extraites.
              </p>
            </div>
          )}
        </div>
      </div>
      ) : (
        <div className="bg-white border border-[#1E2A33]/10 rounded-3xl p-5 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E2A33]/5">
            {/* Titre et indicateur de justificatifs restants */}
            <div>
              <span className="text-[10px] font-bold text-[#AE7D5C] uppercase tracking-widest block">
                Factures à traiter
              </span>
              <h2 className="text-xs font-bold text-[#1E2A33] mt-0.5">
                {showMatched ? (
                  <>
                    {totalInvsCount} justificatif{totalInvsCount > 1 ? 's' : ''} au total ({unmatchedInvsCount} en attente, {matchedInvsCount} rapproché{matchedInvsCount > 1 ? 's' : ''})
                  </>
                ) : (
                  <>
                    {unmatchedInvsCount} justificatif{unmatchedInvsCount > 1 ? 's' : ''} en attente
                  </>
                )}
              </h2>
            </div>
            
            {/* Barre de recherche compacte et toggle */}
            <div className="flex flex-col items-end gap-1.5 w-full sm:max-w-xs">
              <div className="relative w-full">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#1E2A33]/40" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 rounded-xl border border-[#1E2A33]/12 text-xs text-[#1E2A33] bg-[#1E2A33]/5 sm:bg-white outline-none focus:border-[#AE7D5C] focus:bg-white transition-all font-medium placeholder-[#1E2A33]/40"
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showMatched}
                  onChange={(e) => setShowMatched(e.target.checked)}
                  className="rounded text-[#AE7D5C] border-[#1E2A33]/20 focus:ring-[#AE7D5C] w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-[10px] font-semibold text-[#1E2A33]/50">Afficher pièces rapprochées</span>
              </label>
            </div>
          </div>

          {loadingInvoices ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500 text-xs">
              <Loader2 className="w-8 h-8 text-[#AE7D5C] animate-spin" />
              <span>Chargement des justificatifs...</span>
            </div>
          ) : filteredImportedInvoices.length === 0 ? (
            <div className="p-12 text-center text-xs font-roboto text-[#1E2A33]/40 bg-slate-50/50 rounded-2xl border border-dashed border-[#1E2A33]/10">
              Aucun justificatif trouvé.
            </div>
          ) : (
            <div>
              {/* Vue Tableau pour ordinateurs (Desktop/Tablet) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FDFBEF]/50 border-b border-[#1E2A33]/10 text-[10px] font-roboto font-bold text-[#1E2A33]/50 uppercase tracking-widest">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Fournisseur</th>
                      <th className="px-4 py-3">Montant</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Fichier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2A33]/5">
                    {filteredImportedInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[#FDFBEF]/15 transition-colors">
                        <td className="px-4 py-3 font-semibold text-[#1E2A33]/70">
                          {new Date(inv.date).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="px-4 py-3 font-bold text-[#1E2A33] max-w-[200px] truncate">
                          {inv.provider.replace(/^\[.*?\]\s*/, "")}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-[#1E2A33]/80">
                          {inv.amount ? `${inv.amount.toFixed(2)} €` : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                            inv.type === "PERSO" 
                              ? "bg-rose-50 text-rose-700 border border-rose-200" 
                              : "bg-green-50 text-green-700 border border-green-200"
                          }`}>
                            {inv.type === "PERSO" ? "PERSO" : "PRO"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {inv.fileUrl ? (
                            <a
                              href={inv.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-[#AE7D5C] hover:text-[#AE7D5C]/80 font-bold transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Voir le reçu</span>
                            </a>
                          ) : (
                            <span className="text-[#1E2A33]/30">Pas de fichier</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Vue Listes de Cartes épurées pour iPhone/Mobile */}
              <div className="md:hidden space-y-3">
                {filteredImportedInvoices.map((inv) => (
                  <div 
                    key={inv.id} 
                    className="p-4 bg-slate-50/40 border border-[#1E2A33]/5 rounded-2xl flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="font-bold text-xs text-[#1E2A33] truncate">
                        {inv.provider.replace(/^\[.*?\]\s*/, "")}
                      </div>
                      <div className="text-[10px] text-[#1E2A33]/50 font-medium flex items-center gap-2">
                        <span>{new Date(inv.date).toLocaleDateString("fr-FR")}</span>
                        <span>•</span>
                        <span className={`font-bold ${inv.type === "PERSO" ? "text-rose-600" : "text-green-600"}`}>
                          {inv.type}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0 gap-1.5">
                      <span className="font-mono font-bold text-xs text-[#1E2A33]">
                        {inv.amount ? `${inv.amount.toFixed(2)} €` : "-"}
                      </span>
                      {inv.fileUrl ? (
                        <a
                          href={inv.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#AE7D5C]/10 hover:bg-[#AE7D5C]/15 text-[#AE7D5C] text-[10px] font-bold rounded-lg transition-all"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Aperçu</span>
                        </a>
                      ) : (
                        <span className="text-[10px] text-[#1E2A33]/30">Aucun fichier</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast Notifications Overlay */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none md:max-w-sm md:w-auto left-6 right-6 md:left-auto">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto flex items-center gap-3 p-4 rounded-2xl shadow-xl backdrop-blur-md border transition-all duration-300 text-xs text-white ${
              t.type === "success" 
                ? "bg-emerald-950/90 border-emerald-500/25" 
                : t.type === "error" 
                  ? "bg-rose-950/90 border-rose-500/25" 
                  : "bg-[#1E2A33]/95 border-slate-700"
            }`}
          >
            {t.type === "success" && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
            {t.type === "error" && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
            {t.type === "info" && <Loader2 className="w-5 h-5 text-[#AE7D5C] animate-spin shrink-0" />}
            <span className="font-semibold">{t.message}</span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
