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
  Search,
  RotateCw,
  Sliders,
  Crop,
  Check
} from "lucide-react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  // Scanner States & Refs
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerCropBox, setScannerCropBox] = useState({ x: 5, y: 5, width: 90, height: 90 });
  const [scannerRotation, setScannerRotation] = useState(0); // 0, 90, 180, 270
  const [scannerContrast, setScannerContrast] = useState(1.5);
  const [scannerFilterEnabled, setScannerFilterEnabled] = useState(true);
  const [isScannerProcessing, setIsScannerProcessing] = useState(false);

  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const scannerDragInfo = useRef<{
    type: string | null;
    startX: number;
    startY: number;
    startBox: { x: number; y: number; width: number; height: number };
  }>({ type: null, startX: 0, startY: 0, startBox: { x: 0, y: 0, width: 0, height: 0 } });
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [showMatched, setShowMatched] = useState(false);

  const loadHistory = useCallback(() => {
    setLoadingInvoices(true);
    
    // Charger uniquement les factures pour un affichage instantané (évite le fetch très lourd du relevé entier)
    fetch("/api/invoices?t=" + Date.now())
      .then(res => res.json())
      .then((invData) => {
        if (invData.success) {
          const invoices = invData.invoices || [];
          
          // Enrichir les factures avec leur état de rapprochement direct
          const enriched = invoices.map((inv: any) => ({
            ...inv,
            isMatched: inv.status === "COMPLETED"
          }));
          
          setImportedInvoices(enriched);
        }
      })
      .catch(err => console.error("Error loading invoices history:", err))
      .finally(() => setLoadingInvoices(false));
  }, []);

  const detectReceiptContours = (imgUrl: string): Promise<{ x: number; y: number; width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = imgUrl;
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 100;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve({ x: 5, y: 5, width: 90, height: 90 });
            return;
          }
          
          ctx.drawImage(img, 0, 0, size, size);
          const imgData = ctx.getImageData(0, 0, size, size);
          const data = imgData.data;
          
          // Step 1: Calculate average brightness
          let totalBrightness = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
          }
          const avgBrightness = totalBrightness / (size * size);
          
          // Step 2: Determine dynamic threshold (average + offset)
          const threshold = Math.max(150, Math.min(220, avgBrightness + 35));
          
          // Step 3: Find bounding box of bright pixels
          let minX = size, minY = size, maxX = 0, maxY = 0;
          let count = 0;
          
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const idx = (y * size + x) * 4;
              const r = data[idx];
              const g = data[idx+1];
              const b = data[idx+2];
              const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
              
              if (brightness > threshold) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                count++;
              }
            }
          }
          
          // Step 4: Validate detected region
          const fillRatio = count / (size * size);
          if (count > 200 && fillRatio < 0.95 && maxX > minX && maxY > minY) {
            // Convert to percentages and add a small 2.5% padding
            const pad = 2.5;
            const xPercent = Math.max(0, minX - pad);
            const yPercent = Math.max(0, minY - pad);
            const wPercent = Math.min(100 - xPercent, (maxX - minX) + pad * 2);
            const hPercent = Math.min(100 - yPercent, (maxY - minY) + pad * 2);
            
            resolve({
              x: xPercent,
              y: yPercent,
              width: wPercent,
              height: hPercent
            });
          } else {
            resolve({ x: 5, y: 5, width: 90, height: 90 });
          }
        } catch (err) {
          console.error("Error detecting contours:", err);
          resolve({ x: 5, y: 5, width: 90, height: 90 });
        }
      };
      img.onerror = () => {
        resolve({ x: 5, y: 5, width: 90, height: 90 });
      };
    });
  };

  const openScanner = async () => {
    if (!activeFile) return;

    // Set defaults first
    setScannerCropBox({ x: 5, y: 5, width: 90, height: 90 });
    setScannerRotation(0);
    setScannerContrast(1.5);
    setScannerFilterEnabled(true);
    setIsScannerOpen(true);

    // Auto-detect contours asynchronously
    try {
      const detectedBox = await detectReceiptContours(activeFile.previewUrl);
      setScannerCropBox(detectedBox);
    } catch (e) {
      console.error("Failed auto-contour detection:", e);
    }
  };

  const startScannerDrag = (e: React.MouseEvent | React.TouchEvent, type: string) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    
    scannerDragInfo.current = {
      type,
      startX: clientX,
      startY: clientY,
      startBox: { ...scannerCropBox }
    };

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!scannerDragInfo.current.type || !scannerContainerRef.current) return;
      
      const currentX = "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = "touches" in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const rect = scannerContainerRef.current.getBoundingClientRect();
      const deltaPercentX = ((currentX - scannerDragInfo.current.startX) / rect.width) * 100;
      const deltaPercentY = ((currentY - scannerDragInfo.current.startY) / rect.height) * 100;
      
      const { startBox } = scannerDragInfo.current;
      
      setScannerCropBox(prev => {
        let newBox = { ...prev };
        
        if (scannerDragInfo.current.type === "box") {
          newBox.x = Math.max(0, Math.min(100 - startBox.width, startBox.x + deltaPercentX));
          newBox.y = Math.max(0, Math.min(100 - startBox.height, startBox.y + deltaPercentY));
        } else if (scannerDragInfo.current.type === "tl") {
          const newX = Math.max(0, Math.min(startBox.x + startBox.width - 5, startBox.x + deltaPercentX));
          const newY = Math.max(0, Math.min(startBox.y + startBox.height - 5, startBox.y + deltaPercentY));
          newBox.width = startBox.width + (startBox.x - newX);
          newBox.height = startBox.height + (startBox.y - newY);
          newBox.x = newX;
          newBox.y = newY;
        } else if (scannerDragInfo.current.type === "tr") {
          const newWidth = Math.max(5, Math.min(100 - startBox.x, startBox.width + deltaPercentX));
          const newY = Math.max(0, Math.min(startBox.y + startBox.height - 5, startBox.y + deltaPercentY));
          newBox.height = startBox.height + (startBox.y - newY);
          newBox.width = newWidth;
          newBox.y = newY;
        } else if (scannerDragInfo.current.type === "bl") {
          const newX = Math.max(0, Math.min(startBox.x + startBox.width - 5, startBox.x + deltaPercentX));
          const newHeight = Math.max(5, Math.min(100 - startBox.y, startBox.height + deltaPercentY));
          newBox.width = startBox.width + (startBox.x - newX);
          newBox.height = newHeight;
          newBox.x = newX;
        } else if (scannerDragInfo.current.type === "br") {
          newBox.width = Math.max(5, Math.min(100 - startBox.x, startBox.width + deltaPercentX));
          newBox.height = Math.max(5, Math.min(100 - startBox.y, startBox.height + deltaPercentY));
        }
        
        return newBox;
      });
    };

    const handleEnd = () => {
      scannerDragInfo.current.type = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
  };

  const applyScannerProcessing = async (activeFile: UploadedFile) => {
    if (isScannerProcessing) return;
    setIsScannerProcessing(true);

    try {
      const img = new Image();
      img.src = activeFile.previewUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      
      // Calculate pixel crop coordinates
      const cropX = (scannerCropBox.x * img.naturalWidth) / 100;
      const cropY = (scannerCropBox.y * img.naturalHeight) / 100;
      const cropW = (scannerCropBox.width * img.naturalWidth) / 100;
      const cropH = (scannerCropBox.height * img.naturalHeight) / 100;

      // Handle canvas size based on rotation
      const isRotated90 = scannerRotation === 90 || scannerRotation === 270;
      const canvasW = isRotated90 ? cropH : cropW;
      const canvasH = isRotated90 ? cropW : cropH;

      canvas.width = canvasW;
      canvas.height = canvasH;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      // Apply rotation transformation
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.rotate((scannerRotation * Math.PI) / 180);

      // Draw the cropped section onto the canvas
      if (isRotated90) {
        ctx.drawImage(img, cropX, cropY, cropW, cropH, -canvasH / 2, -canvasW / 2, canvasH, canvasW);
      } else {
        ctx.drawImage(img, cropX, cropY, cropW, cropH, -canvasW / 2, -canvasH / 2, canvasW, canvasH);
      }

      // Reset transformations
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Apply high-contrast grayscale filter
      if (scannerFilterEnabled) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        
        // Calculate contrast factor
        const factor = (259 * (scannerContrast * 100 + 255)) / (255 * (259 - scannerContrast * 100));

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Grayscale (BT.601 formula)
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // Apply contrast
          gray = factor * (gray - 128) + 128;
          
          // Boost whites and blacks
          if (gray > 190) {
            gray = 255;
          } else if (gray < 80) {
            gray = 0;
          } else {
            // Smooth scaling
            gray = Math.max(0, Math.min(255, gray));
          }

          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        ctx.putImageData(imgData, 0, 0);
      }

      // Convert to blob and update file state
      canvas.toBlob((blob) => {
        if (!blob) {
          showToast("Erreur lors de la génération du scan", "error");
          setIsScannerProcessing(false);
          return;
        }

        const newFile = new File([blob], activeFile.file.name.replace(/\.[^/.]+$/, "") + "_scan.jpg", { type: "image/jpeg" });
        
        // Revoke previous URL to prevent memory leaks
        URL.revokeObjectURL(activeFile.previewUrl);
        const newPreviewUrl = URL.createObjectURL(newFile);

        // Update the files array
        setFiles(prev => prev.map(f => f.id === activeFile.id ? {
          ...f,
          file: newFile,
          previewUrl: newPreviewUrl,
          status: "idle",
          extractedData: undefined,
          errorMsg: undefined
        } : f));

        // Close scanner
        setIsScannerOpen(false);
        setIsScannerProcessing(false);
        showToast("Scan appliqué ! Analyse OCR relancée...", "success");

        // Re-trigger analysis
        setTimeout(() => {
          analyzeFile({
            id: activeFile.id,
            file: newFile,
            previewUrl: newPreviewUrl,
            status: "idle"
          });
        }, 100);
      }, "image/jpeg", 0.95);

    } catch (error: any) {
      console.error("Scanner Error:", error);
      showToast("Erreur lors du traitement : " + error.message, "error");
      setIsScannerProcessing(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm("Voulez-vous supprimer définitivement ce justificatif de la base de données ?")) return;
    try {
      const res = await fetch(`/api/invoices?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Justificatif supprimé avec succès", "success");
        loadHistory();
      } else {
        showToast("Erreur lors de la suppression", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Erreur réseau lors de la suppression", "error");
    }
  };

  const toggleInvoiceType = async (id: string, currentType: string) => {
    try {
      const res = await fetch("/api/invoices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: currentType === "PRO" ? "PERSO" : "PRO" })
      });
      if (res.ok) {
        showToast("Type de justificatif mis à jour", "success");
        loadHistory();
      } else {
        showToast("Erreur lors de la mise à jour", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Erreur réseau lors de la mise à jour", "error");
    }
  };

  const forceCompleteInvoice = async (id: string) => {
    try {
      const res = await fetch("/api/invoices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "COMPLETED" })
      });
      if (res.ok) {
        showToast("Justificatif marqué comme rapproché !", "success");
        loadHistory();
      } else {
        showToast("Erreur lors de la mise à jour", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Erreur réseau", "error");
    }
  };

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
  const filesRef = useRef<UploadedFile[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);

  // Auto guess default category
  const guessDefaultCategory = (supplier: string, recipient: string): string => {
    const sLower = (supplier || "").toLowerCase();
    const rLower = (recipient || "").toLowerCase();

    // Check personal names
    if (rLower.includes("sabrina") || rLower.includes("kanouche") || rLower.includes("anita") || rLower.includes("kacha")) {
      return "PERSO";
    }

    if (sLower.includes("openai") || sLower.includes("chatgpt") || sLower.includes("openrouter") || sLower.includes("cloudflare") || sLower.includes("supabase") || sLower.includes("vercel") || sLower.includes("github") || sLower.includes("canva")) {
      return "LOGICIELS_IA";
    }
    if (sLower.includes("restaurant") || sLower.includes("bistro") || sLower.includes("cafe") || sLower.includes("brasserie") || sLower.includes("halles") || sLower.includes("sebastopol") || sLower.includes("starbucks") || sLower.includes("mcdonald") || sLower.includes("harmonie")) {
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
            Historique
          </button>
        </div>

        {/* Filtres de l'Historique épinglés (Sticky) */}
        {activeView === "history" && (
          <div className="max-w-7xl mx-auto mt-4 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#1E2A33]/5">
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
            
            <div className="flex flex-row items-center gap-3 w-full sm:max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#1E2A33]/40" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 rounded-xl border border-[#1E2A33]/12 text-xs text-[#1E2A33] bg-[#1E2A33]/5 sm:bg-white outline-none focus:border-[#AE7D5C] focus:bg-white transition-all font-medium placeholder-[#1E2A33]/40"
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={showMatched}
                  onChange={(e) => setShowMatched(e.target.checked)}
                  className="rounded text-[#AE7D5C] border-[#1E2A33]/20 focus:ring-[#AE7D5C] w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-[10px] font-semibold text-[#1E2A33]/50">Afficher rapprochées</span>
              </label>
            </div>
          </div>
        )}
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
                <h3 className="text-sm font-bold text-[#1E2A33] flex items-center gap-1.5 truncate max-w-[60%]">
                  <FileText className="w-4 h-4 text-[#AE7D5C]" />
                  Révision : {activeFile.file.name}
                </h3>
                <div className="flex items-center gap-2">
                  {activeFile.file.type.startsWith("image/") && activeFile.status !== "success" && activeFile.status !== "uploading" && (
                    <button
                      onClick={openScanner}
                      className="px-3 py-1 text-xs font-bold rounded-lg border border-[#AE7D5C]/35 text-[#AE7D5C] hover:bg-[#AE7D5C]/5 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Scanner / Recadrer</span>
                    </button>
                  )}
                  {activeFile.status === "success" && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                      Déjà envoyé Pennylane
                    </span>
                  )}
                </div>
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
                      <th className="px-4 py-3 text-right">Actions</th>
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
                        <td className="px-4 py-3 text-right space-x-1.5">
                          {inv.status === "PENDING" && (
                            <button
                              onClick={() => forceCompleteInvoice(inv.id)}
                              className="inline-flex items-center justify-center p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded border border-emerald-200 transition-all cursor-pointer"
                              title="Forcer Rapproché"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => toggleInvoiceType(inv.id, inv.type)}
                            className={`inline-flex items-center justify-center p-1 rounded border transition-all cursor-pointer ${
                              inv.type === "PRO"
                                ? "bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                            title={inv.type === "PRO" ? "Passer en Personnel" : "Passer en Professionnel"}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteInvoice(inv.id)}
                            className="inline-flex items-center justify-center p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded border border-rose-200 transition-all cursor-pointer"
                            title="Supprimer définitivement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                    className="p-4 bg-[#FDFBEF]/20 border border-[#1E2A33]/5 rounded-2xl flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between gap-4">
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

                    {/* Mobile Action buttons bar */}
                    <div className="flex justify-end gap-2 border-t border-[#1E2A33]/5 pt-2">
                      {inv.status === "PENDING" && (
                        <button
                          onClick={() => forceCompleteInvoice(inv.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[10px] font-bold rounded-lg border border-emerald-200 transition-all cursor-pointer"
                        >
                          <FileCheck className="w-3 h-3" />
                          <span>Rapprocher</span>
                        </button>
                      )}
                      <button
                        onClick={() => toggleInvoiceType(inv.id, inv.type)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                          inv.type === "PRO"
                            ? "bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{inv.type === "PRO" ? "Perso" : "Pro"}</span>
                      </button>
                      <button
                        onClick={() => deleteInvoice(inv.id)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold rounded-lg border border-rose-200 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Supprimer</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document Scanner Modal */}
      {isScannerOpen && activeFile && (
        <Dialog open={isScannerOpen} onOpenChange={(open) => !open && setIsScannerOpen(false)}>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[95vh] flex flex-col p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-[#1E2A33]/10 rounded-2xl shadow-2xl">
            <DialogHeader className="p-4 sm:p-5 border-b border-[#1E2A33]/5 flex-shrink-0 flex flex-row items-center justify-between">
              <DialogTitle className="text-base font-bold text-[#1E2A33] flex items-center gap-2">
                <Crop className="w-4 h-4 text-[#AE7D5C]" />
                <span>Scanner & Recadrer le document</span>
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 flex flex-col items-center justify-center min-h-0">
              {/* Interactive Cropper Area */}
              <div 
                ref={scannerContainerRef}
                className="relative w-full max-h-[45vh] bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center select-none"
              >
                <div 
                  className="relative transition-transform duration-200" 
                  style={{ transform: `rotate(${scannerRotation}deg)` }}
                >
                  <img
                    src={activeFile.previewUrl}
                    alt="Image à recadrer"
                    className="max-w-full max-h-[40vh] object-contain pointer-events-none"
                  />
                  {/* Premium Scanner Dimmed Mask Overlay */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                    <defs>
                      <mask id="scanner-mask">
                        {/* Whole area white (visible) */}
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {/* Crop area black (masked out / transparent) */}
                        <rect 
                          x={`${scannerCropBox.x}%`} 
                          y={`${scannerCropBox.y}%`} 
                          width={`${scannerCropBox.width}%`} 
                          height={`${scannerCropBox.height}%`} 
                          fill="black" 
                        />
                      </mask>
                    </defs>
                    {/* Dimmed backdrop covering everything except the crop box */}
                    <rect 
                      x="0" 
                      y="0" 
                      width="100%" 
                      height="100%" 
                      fill="rgba(15, 23, 42, 0.65)" 
                      mask="url(#scanner-mask)" 
                    />
                  </svg>

                  {/* Interactive Crop overlay */}
                  <div 
                    className="absolute z-20 cursor-move border border-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                    style={{
                      left: `${scannerCropBox.x}%`,
                      top: `${scannerCropBox.y}%`,
                      width: `${scannerCropBox.width}%`,
                      height: `${scannerCropBox.height}%`
                    }}
                    onMouseDown={(e) => startScannerDrag(e, "box")}
                    onTouchStart={(e) => startScannerDrag(e, "box")}
                  >
                    {/* Animated scanning laser line effect */}
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-[#10B981] opacity-75 shadow-[0_0_10px_#10B981] animate-[pulse_2s_infinite]" />

                    {/* Corner brackets for scanner look */}
                    {/* Top Left */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#10B981]" />
                    {/* Top Right */}
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#10B981]" />
                    {/* Bottom Left */}
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#10B981]" />
                    {/* Bottom Right */}
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#10B981]" />

                    {/* Draggable handle points */}
                    <div 
                      className="absolute w-7 h-7 -top-3.5 -left-3.5 bg-white border-2 border-[#10B981] rounded-full cursor-nwse-resize flex items-center justify-center shadow-lg active:scale-115 transition-transform touch-none z-30"
                      onMouseDown={(e) => { e.stopPropagation(); startScannerDrag(e, "tl"); }}
                      onTouchStart={(e) => { e.stopPropagation(); startScannerDrag(e, "tl"); }}
                    >
                      <div className="w-2.5 h-2.5 bg-[#10B981] rounded-full animate-ping absolute opacity-75" />
                      <div className="w-2 h-2 bg-[#10B981] rounded-full relative" />
                    </div>
                    <div 
                      className="absolute w-7 h-7 -top-3.5 -right-3.5 bg-white border-2 border-[#10B981] rounded-full cursor-nesw-resize flex items-center justify-center shadow-lg active:scale-115 transition-transform touch-none z-30"
                      onMouseDown={(e) => { e.stopPropagation(); startScannerDrag(e, "tr"); }}
                      onTouchStart={(e) => { e.stopPropagation(); startScannerDrag(e, "tr"); }}
                    >
                      <div className="w-2.5 h-2.5 bg-[#10B981] rounded-full animate-ping absolute opacity-75" />
                      <div className="w-2 h-2 bg-[#10B981] rounded-full relative" />
                    </div>
                    <div 
                      className="absolute w-7 h-7 -bottom-3.5 -left-3.5 bg-white border-2 border-[#10B981] rounded-full cursor-nesw-resize flex items-center justify-center shadow-lg active:scale-115 transition-transform touch-none z-30"
                      onMouseDown={(e) => { e.stopPropagation(); startScannerDrag(e, "bl"); }}
                      onTouchStart={(e) => { e.stopPropagation(); startScannerDrag(e, "bl"); }}
                    >
                      <div className="w-2.5 h-2.5 bg-[#10B981] rounded-full animate-ping absolute opacity-75" />
                      <div className="w-2 h-2 bg-[#10B981] rounded-full relative" />
                    </div>
                    <div 
                      className="absolute w-7 h-7 -bottom-3.5 -right-3.5 bg-white border-2 border-[#10B981] rounded-full cursor-nwse-resize flex items-center justify-center shadow-lg active:scale-115 transition-transform touch-none z-30"
                      onMouseDown={(e) => { e.stopPropagation(); startScannerDrag(e, "br"); }}
                      onTouchStart={(e) => { e.stopPropagation(); startScannerDrag(e, "br"); }}
                    >
                      <div className="w-2.5 h-2.5 bg-[#10B981] rounded-full animate-ping absolute opacity-75" />
                      <div className="w-2 h-2 bg-[#10B981] rounded-full relative" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Adjustments Controls */}
              <div className="w-full space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  {/* Rotation button */}
                  <button
                    onClick={() => setScannerRotation(r => (r + 90) % 360)}
                    className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4 text-[#AE7D5C]" />
                    <span>Pivoter 90°</span>
                  </button>

                  {/* Filter Toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={scannerFilterEnabled}
                      onChange={(e) => setScannerFilterEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-[#AE7D5C] border-slate-300 focus:ring-[#AE7D5C]/50 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">Filtre Scanner (N&B Contraste)</span>
                  </label>
                </div>

                {/* Contrast Threshold Slider */}
                {scannerFilterEnabled && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span className="flex items-center gap-1">
                        <Sliders className="w-3.5 h-3.5 text-[#AE7D5C]" />
                        Seuil de contraste
                      </span>
                      <span>{Math.round(scannerContrast * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="2.5"
                      step="0.1"
                      value={scannerContrast}
                      onChange={(e) => setScannerContrast(parseFloat(e.target.value))}
                      className="w-full accent-[#AE7D5C] h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => setIsScannerOpen(false)}
                className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                disabled={isScannerProcessing}
              >
                Annuler
              </button>
              <button
                onClick={() => applyScannerProcessing(activeFile)}
                className="px-5 py-2.5 bg-[#AE7D5C] hover:bg-[#966747] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                disabled={isScannerProcessing}
              >
                {isScannerProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Traitement...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Appliquer le Scan</span>
                  </>
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>
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
