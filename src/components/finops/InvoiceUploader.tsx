"use client";

import React, { useState } from "react";
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function InvoiceUploader() {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
    const [message, setMessage] = useState("");

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const processFile = async (selectedFile: File) => {
        setFile(selectedFile);
        setStatus("uploading");
        setMessage("L'IA Gemini analyse votre facture en cours...");

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            const res = await fetch("/api/finops/parse-invoice", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setStatus("success");
                setMessage(`Facture ajoutée : ${data.data.provider} (${data.data.amount} ${data.data.currency})`);
                // Réinitialisation après 3 sec et rafraîchissement
                setTimeout(() => {
                    setStatus("idle");
                    setFile(null);
                    window.location.reload();
                }, 3000);
            } else {
                throw new Error(data.error || "Erreur de lecture.");
            }
        } catch (error: any) {
            setStatus("error");
            setMessage(error.message);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    };

    return (
        <div className="text-right mb-4">
            <input
                type="file"
                id="invoice-upload"
                className="hidden"
                accept="application/pdf,image/png,image/jpeg"
                onChange={handleFileSelect}
            />

            {status === "idle" && (
                <label
                    htmlFor="invoice-upload"
                    className="cursor-pointer inline-flex items-center justify-center space-x-2 bg-white hover:bg-[#AE7D5C]/5 text-[#1E2A33] px-4 py-2 rounded-full border border-[#AE7D5C]/30 transition-all shadow-sm"
                >
                    <UploadCloud className="w-4 h-4 text-[#AE7D5C]" />
                    <span className="font-roboto font-medium text-sm">Scanner une facture</span>
                </label>
            )}

            {status === "uploading" && (
                <div className="inline-flex items-center space-x-2 bg-white px-4 py-2 rounded-full border border-[#AE7D5C]/30 text-[#AE7D5C]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="font-medium text-sm animate-pulse">{message}</span>
                </div>
            )}

            {status === "success" && (
                <div className="inline-flex items-center space-x-2 bg-green-50 px-4 py-2 rounded-full border border-green-200 text-green-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="font-medium text-sm">{message}</span>
                </div>
            )}

            {status === "error" && (
                <div className="inline-flex items-center space-x-2 bg-red-50 px-4 py-2 rounded-full border border-red-200 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium text-sm">Échec</span>
                    <button onClick={() => setStatus("idle")} className="text-xs underline ml-2">Réessayer</button>
                </div>
            )}
        </div>
    );
}
