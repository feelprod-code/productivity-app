'use client';

import { useState } from 'react';
import { Search, Loader2, Brain, ChevronRight, Activity, BookOpen, Stethoscope, Check, Sparkles, FileCode } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface SearchResult {
    id: string;
    score: number;
    text?: string;
    type?: string;
    source?: string;
    filepath?: string;
    createdAt?: string;
    author?: string;
    theme?: string;
}

type BrainType = 'mission' | 'gravity';

const GRAVITY_AUTHORS = [
    "Tous",
    "Gérard Montet - Ostéopathie et symbolisme",
    "Marc Damoiseaux - Embryologie biodynamique",
    "Pascal Anselin - Ostéopathie biodynamique et non résolue",
    "Michel Lidoreau - Biokinergie et harmonisation psycho-corporelle",
    "Philippe Guillaume - Technique douce tissulaire",
];

export default function CerveauSearchClient() {
    const [query, setQuery] = useState('');
    const [brain, setBrain] = useState<BrainType>('mission');
    const [authorFilter, setAuthorFilter] = useState<string>("Tous");

    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [synthesis, setSynthesis] = useState<string | null>(null);
    const [showSources, setShowSources] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsLoading(true);
        setHasSearched(false);
        setSynthesis(null);
        setShowSources(false); // On remasque les sources à chaque nouvelle recherche

        try {
            const bodyPayload: any = { query, brain };

            // Injecter le filtre d'auteur uniquement pour gravity (si pas "Tous")
            if (brain === 'gravity' && authorFilter !== "Tous") {
                bodyPayload.author = authorFilter;
            }

            const res = await fetch('/api/cerveau/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
            });

            const data = await res.json();
            if (data.success) {
                // Map Pinecone matches to our interface
                const formattedResults = data.matches.map((match: any) => ({
                    id: match.id,
                    score: match.score,
                    text: match.metadata?.text,
                    type: match.metadata?.type,
                    source: match.metadata?.source,
                    filepath: match.metadata?.filepath,
                    createdAt: match.metadata?.createdAt,
                    author: match.metadata?.author,
                    theme: match.metadata?.theme,
                }));
                setResults(formattedResults);
                setSynthesis(data.synthesis || null);
            }
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 relative font-sans">

            {/* Background gradient effect matching TDT */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-[#AE7D5C]/10 to-transparent opacity-70 pointer-events-none -z-10 rounded-full blur-3xl"></div>

            <div className="w-full">

                {/* Brain Selector */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
                    <div className="bg-[#1E2A33]/5 p-1 rounded-2xl flex items-center shadow-inner">
                        <button
                            type="button"
                            onClick={() => setBrain('mission')}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${brain === 'mission' ? 'bg-white text-[#1E2A33] shadow-sm' : 'text-[#1E2A33]/50 hover:text-[#1E2A33]'}`}
                        >
                            <BookOpen className="w-4 h-4" />
                            Mission (Compta / Perso)
                        </button>
                        <button
                            type="button"
                            onClick={() => setBrain('gravity')}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${brain === 'gravity' ? 'bg-white text-[#AE7D5C] shadow-sm' : 'text-[#1E2A33]/50 hover:text-[#AE7D5C]'}`}
                        >
                            <Stethoscope className="w-4 h-4" />
                            Gravity Claw (Ostéo)
                        </button>
                    </div>
                </div>

                {/* Conditional Filters for Gravity Claw */}
                {brain === 'gravity' && (
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
                        {GRAVITY_AUTHORS.map((author) => (
                            <button
                                key={author}
                                type="button"
                                onClick={() => setAuthorFilter(author)}
                                className={`text-xs px-4 py-2 rounded-full border transition-all duration-200 flex items-center gap-2
                                    ${authorFilter === author
                                        ? 'bg-[#AE7D5C] border-[#AE7D5C] text-white shadow-md'
                                        : 'bg-white/50 border-[#1E2A33]/10 text-[#1E2A33]/60 hover:border-[#AE7D5C]/40'}
                                `}
                            >
                                {authorFilter === author && <Check className="w-3 h-3" />}
                                {author}
                            </button>
                        ))}
                    </div>
                )}

                {/* Search Input */}
                <form onSubmit={handleSearch} className="mb-14 relative group w-full">
                    <div className={`absolute -inset-1 bg-gradient-to-r rounded-2xl blur-md opacity-30 group-hover:opacity-60 transition duration-700 ${brain === 'gravity' ? 'from-[#AE7D5C]/30' : 'from-[#1E2A33]/30'} to-transparent`}></div>
                    <div className={`relative flex items-center w-full rounded-2xl bg-white border overflow-hidden shadow-sm transition-all
                        ${brain === 'gravity' ? 'border-[#1E2A33]/10 focus-within:border-[#AE7D5C]/50 focus-within:ring-2 focus-within:ring-[#AE7D5C]/20' : 'border-[#1E2A33]/10 focus-within:border-[#1E2A33]/50 focus-within:ring-2 focus-within:ring-[#1E2A33]/20'}`}>
                        <div className="pl-4 sm:pl-6 text-[#1E2A33]/50">
                            <Search className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={brain === 'gravity' ? "Interrogez l'Ostéopathie..." : "Interrogez le backend Mission..."}
                            className="flex-1 min-w-0 bg-transparent text-[#1E2A33] px-3 sm:px-6 py-4 sm:py-5 outline-none placeholder:text-[#1E2A33]/40 font-roboto font-light text-base sm:text-lg"
                            required
                        />
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`px-4 sm:px-8 py-4 sm:py-5 text-sm tracking-widest text-white disabled:opacity-50 transition-colors font-bebas flex items-center justify-center min-w-[80px] sm:min-w-[120px]
                            ${brain === 'gravity' ? 'bg-[#AE7D5C] hover:bg-[#8D6347]' : 'bg-[#1E2A33] hover:bg-[#2A3B47]'}`}
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span><span className="inline sm:hidden">GO</span><span className="hidden sm:inline">SYNAPSE</span></span>}
                        </button>
                    </div>
                </form>

                {/* Results Area */}
                <div className="space-y-8 pb-32">
                    {isLoading ? (
                        <div className="flex flex-col justify-center items-center py-32 opacity-70">
                            <div className="relative w-16 h-16">
                                <div className={`absolute inset-0 border-4 border-[#1E2A33]/10 rounded-full animate-spin ${brain === 'gravity' ? 'border-t-[#AE7D5C]' : 'border-t-[#1E2A33]'}`}></div>
                                <div className={`absolute inset-2 border-4 rounded-full animate-[spin_2s_linear_infinite_reverse] ${brain === 'gravity' ? 'border-[#AE7D5C]/5 border-t-[#AE7D5C]' : 'border-[#1E2A33]/5 border-t-[#1E2A33]'}`}></div>
                                <Brain className={`absolute inset-0 m-auto w-6 h-6 animate-pulse ${brain === 'gravity' ? 'text-[#AE7D5C]' : 'text-[#1E2A33]'}`} />
                            </div>
                            <p className="mt-6 text-[#1E2A33]/60 font-roboto font-light uppercase tracking-widest text-xs">Structuration de la pensée...</p>
                        </div>
                    ) : hasSearched && results.length === 0 ? (
                        <div className="text-center py-20 text-[#1E2A33]/50 font-roboto font-light border border-[#1E2A33]/10 rounded-2xl bg-white/50 backdrop-blur-sm">
                            <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>Aucune résonance sémantique trouvée.</p>
                        </div>
                    ) : (
                        <>
                            {/* Synthesis Display */}
                            {synthesis && (
                                <div className={`relative bg-gradient-to-br from-white to-gray-50/50 border rounded-2xl p-6 sm:p-8 mb-8 shadow-sm
                                    ${brain === 'gravity' ? 'border-[#AE7D5C]/30' : 'border-[#1E2A33]/30'}`}>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className={`p-2.5 rounded-xl ${brain === 'gravity' ? 'bg-[#FDFBEF] text-[#AE7D5C]' : 'bg-gray-100 text-[#1E2A33]'}`}>
                                            <Sparkles className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bebas text-xl sm:text-2xl text-[#1E2A33] tracking-wide">
                                            Synthèse Cognitive
                                        </h3>
                                    </div>
                                    <div className="prose prose-sm sm:prose-base max-w-none font-roboto font-light text-[#1E2A33]/80 whitespace-pre-wrap leading-relaxed">
                                        {synthesis}
                                    </div>
                                    <div className="mt-6 pt-6 border-t border-[#1E2A33]/10 flex justify-center">
                                        <button
                                            onClick={() => setShowSources(!showSources)}
                                            className={`flex items-center gap-2 text-sm font-medium transition-colors px-4 py-2 rounded-lg ${brain === 'gravity' ? 'text-[#AE7D5C] hover:bg-[#AE7D5C]/5' : 'text-[#1E2A33]/70 hover:bg-[#1E2A33]/5'}`}
                                        >
                                            <BookOpen className="w-4 h-4" />
                                            {showSources ? "Masquer les sources brutes" : "Consulter les sources brutes utilisées"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Raw Pinecone results */}
                            {(!synthesis || showSources) && results.map((result, index) => (
                                <div
                                    key={result.id}
                                    className={`group relative bg-white border border-[#1E2A33]/10 rounded-2xl p-8 transition-all duration-300 hover:shadow-lg hover:-translate-y-1
                                ${brain === 'gravity' ? 'hover:border-[#AE7D5C]/40' : 'hover:border-[#1E2A33]/40'}`}
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    {/* Score Indicator Line */}
                                    <div className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-full bg-[#1E2A33]/10 transition-colors
                                ${brain === 'gravity' ? 'group-hover:bg-[#AE7D5C]' : 'group-hover:bg-[#1E2A33]'}`}></div>

                                    <div className="flex flex-col sm:flex-row justify-between items-start mb-4 sm:mb-6 gap-4">
                                        <div className="flex items-center gap-3 sm:gap-4">
                                            <div className={`inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full font-bebas text-lg sm:text-xl border shadow-sm shrink-0
                                            ${brain === 'gravity' ? 'bg-[#FDFBEF] text-[#AE7D5C] border-[#AE7D5C]/20' : 'bg-gray-50 text-[#1E2A33] border-[#1E2A33]/20'}`}>
                                                {(result.score * 100).toFixed(0)}%
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[10px] sm:text-xs uppercase tracking-widest text-[#1E2A33]/40 font-bebas mb-0.5 sm:mb-1 truncate">
                                                    Score de Symbiose
                                                </div>
                                                <div className="font-roboto text-[10px] sm:text-xs text-[#1E2A33]/70 font-medium truncate flex flex-wrap gap-2 items-center">
                                                    ID: <span className="font-mono text-[9px] sm:text-[10px] bg-gray-100 px-1 py-0.5 rounded text-[#1E2A33]/60">{result.id.split('-')[0]}</span>
                                                    {result.author && (
                                                        <span className="font-medium text-[#AE7D5C]">👤 {result.author}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-[#1E2A33] text-base sm:text-lg font-roboto font-light leading-relaxed mb-6 sm:mb-8 break-words">
                                        {result.text || "[Passage sémantique sans métadonnée texte]"}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs font-roboto">
                                        {result.theme && (
                                            <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full font-medium border uppercase tracking-wide truncate max-w-full
                                            ${brain === 'gravity' ? 'bg-[#FDFBEF] text-[#AE7D5C] border-[#AE7D5C]/20' : 'bg-gray-100 text-[#1E2A33] border-[#1E2A33]/20'}`}>
                                                {result.theme}
                                            </span>
                                        )}
                                        {result.type && (
                                            <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gray-100 text-[#1E2A33]/70 border border-[#1E2A33]/10 uppercase tracking-wide truncate max-w-full">
                                                {result.type}
                                            </span>
                                        )}
                                        {result.source && (
                                            <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-[#1E2A33]/5 text-[#1E2A33]/70 border border-[#1E2A33]/10 truncate max-w-full">
                                                Source: {result.source}
                                            </span>
                                        )}
                                        {result.filepath && (
                                            <a href={`vscode://file/${result.filepath}`} className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-[#1E2A33] text-white hover:bg-[#AE7D5C] transition-colors truncate max-w-full shadow-sm hover:shadow-md">
                                                <FileCode className="w-3.5 h-3.5" />
                                                Ouvrir VS Code
                                            </a>
                                        )}
                                        {result.createdAt && (
                                            <span className="text-[#1E2A33]/50 italic w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0">
                                                Capturé {formatDistanceToNow(new Date(result.createdAt), { addSuffix: true, locale: fr })}
                                            </span>
                                        )}
                                    </div>

                                    {/* Decorative Interaction */}
                                    <div className={`absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all duration-300
                                ${brain === 'gravity' ? 'text-[#AE7D5C]' : 'text-[#1E2A33]'}`}>
                                        <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
