import { Brain, Receipt } from "lucide-react";

export default function MissionDashboard() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#FDFBEF] text-[#1E2A33] p-6 font-sans relative overflow-hidden">
            {/* TDT Grid Background Effect */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 z-0"></div>

            <div className="relative z-10 text-center space-y-6 max-w-4xl w-full">

                <div className="flex flex-col sm:flex-row items-center justify-center w-full gap-4 mb-8 pt-4 sm:pt-0">
                    <div className="hidden sm:block h-full w-2 bg-[#AE7D5C] rounded-full self-stretch shadow-[0_0_15px_rgba(174,125,92,0.4)]"></div>
                    <img src="/icon.png" alt="Mission Logo" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover" />
                    <h1 className="text-3xl sm:text-5xl font-bebas tracking-wide text-[#1E2A33] text-center">MISSION <span className="text-[#AE7D5C]">/ TDT</span></h1>
                </div>

                <p className="text-xl text-[#1E2A33]/70 font-roboto font-light max-w-2xl mx-auto leading-relaxed">
                    Le centre de commande global.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16 w-full text-left">
                    <a href="/cerveau" className="block p-8 bg-white border border-[#1E2A33]/10 xl rounded-2xl hover:border-[#AE7D5C] hover:shadow-lg transition-all duration-500 group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#1E2A33]/5 group-hover:bg-[#AE7D5C] transition-colors"></div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-[#FDFBEF] rounded-full text-[#AE7D5C] border border-[#AE7D5C]/20 group-hover:scale-110 transition-transform">
                                <Brain className="w-6 h-6" />
                            </div>
                            <h2 className="text-3xl font-bebas tracking-wide text-[#1E2A33] group-hover:text-[#AE7D5C] transition-colors">LE CERVEAU</h2>
                        </div>
                        <p className="text-[#1E2A33]/60 font-roboto font-light leading-relaxed pl-1">
                            Exploration vectorielle, gestion des connaissances et indexation pour l'écriture de livre. Navigation fluide au cœur de l'information.
                        </p>
                    </a>

                    <a href="/comptabilite" className="block p-8 bg-white border border-[#1E2A33]/10 rounded-2xl hover:border-[#AE7D5C] hover:shadow-lg transition-all duration-500 group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#1E2A33]/5 group-hover:bg-[#AE7D5C] transition-colors"></div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-[#FDFBEF] rounded-full text-[#AE7D5C] border border-[#AE7D5C]/20 group-hover:scale-110 transition-transform">
                                <Receipt className="w-6 h-6" />
                            </div>
                            <h2 className="text-3xl font-bebas tracking-wide text-[#1E2A33] group-hover:text-[#AE7D5C] transition-colors">COMPTABILITE</h2>
                        </div>
                        <p className="text-[#1E2A33]/60 font-roboto font-light leading-relaxed pl-1">
                            Factures automatisées via Zapier, stockage PDF et suivi analytique détaillé. Traitement administratif structuré et apaisé.
                        </p>
                    </a>
                </div>
            </div>
        </div>
    );
}
