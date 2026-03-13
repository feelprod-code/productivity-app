import React from "react";
import CerveauSearchClient from "./CerveauSearchClient";

export const metadata = {
    title: "Le Cerveau - Mission TDT",
    description: "Knowledge Base Vectorielle TDT",
};

export default function CerveauPage() {
    return (
        <div className="min-h-screen bg-[#FDFBEF] text-[#1E2A33] font-sans relative overflow-hidden">
            {/* TDT Minimalist Grid Background Setup - Subtly adapted for light theme */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 z-0"></div>

            <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">

                {/* Header Section */}
                <div className="mb-14 border-b border-[#1E2A33]/10 pb-8 flex flex-col items-center text-center">
                    <div className="flex items-center justify-center w-full gap-6 mb-6">
                        <div className="h-px bg-[#AE7D5C]/40 flex-1 max-w-[80px]"></div>
                        <h1 className="text-5xl tracking-wide font-bebas text-[#AE7D5C]">LE CERVEAU</h1>
                        <div className="h-px bg-[#AE7D5C]/40 flex-1 max-w-[80px]"></div>
                    </div>
                    <p className="text-[#1E2A33]/60 text-lg font-roboto font-light max-w-2xl leading-relaxed">
                        L'extension cognitive vectorielle. Naviguez à travers vos concepts, idées et retranscriptions de cours grâce à une recherche sémantique profonde.
                    </p>
                </div>

                {/* Input Component Client-Side */}
                <CerveauSearchClient />

            </div>
        </div>
    );
}
