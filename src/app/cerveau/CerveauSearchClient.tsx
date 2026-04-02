'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Loader2, Brain, ChevronRight, Activity, BookOpen, Stethoscope, Check, Sparkles, FileCode, User } from 'lucide-react';
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

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: SearchResult[];
}

type BrainType = 'mission' | 'gravity';

const GRAVITY_AUTHORS = [
    { label: "Tous", value: "Tous" },
    { label: "Gérard Montet - Ostéopathie et symbolisme", value: "Gérard Montet" },
    { label: "Marc Damoiseaux - Embryologie biodynamique", value: "Marc Damoiseaux" },
    { label: "Pascal Anselin - Ostéopathie biodynamique et non résolue", value: "Pascal Anselin" },
    { label: "Michel Lidoreau - Biokinergie et harmonisation psycho-corporelle", value: "Michel Lidoreau" },
    { label: "Philippe Guillaume - Techniques douces tissulaires", value: "Philippe Guillaume" },
];

export default function CerveauSearchClient() {
    const [input, setInput] = useState('');
    const [brain, setBrain] = useState<BrainType>('mission');
    const [authorFilter, setAuthorFilter] = useState<string>("Tous");

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSourcesForMessage, setShowSourcesForMessage] = useState<Record<string, boolean>>({});

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        // Seulement scroller s'il y a des messages (pour éviter des sauts bizarres au chargement initial)
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const toggleSources = (msgId: string) => {
        setShowSourcesForMessage(prev => ({
            ...prev,
            [msgId]: !prev[msgId]
        }));
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsgId = Date.now().toString() + '-user';
        const newUserMessage: ChatMessage = {
            id: userMsgId,
            role: 'user',
            content: input.trim()
        };

        const currentMessages = [...messages, newUserMessage];
        setMessages(currentMessages);
        setInput('');
        setIsLoading(true);

        try {
            // Only send role and content to the API
            const apiMessages = currentMessages.map(m => ({ role: m.role, content: m.content }));
            const bodyPayload: any = { messages: apiMessages, brain };

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

                const assistantMsgId = Date.now().toString() + '-assistant';
                setMessages(prev => [...prev, {
                    id: assistantMsgId,
                    role: 'assistant',
                    content: data.synthesis || "Aucune information trouvée.",
                    sources: formattedResults
                }]);
            } else {
                console.error("API error:", data.error);
            }
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 relative font-sans pb-12">
            {/* Background gradient effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-[#AE7D5C]/10 to-transparent opacity-70 pointer-events-none -z-10 rounded-full blur-3xl"></div>

            <div className="pt-4 pb-6 z-10 sticky top-0 bg-white/80 backdrop-blur-md rounded-b-3xl">
                {/* Brain Selector */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
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
                    <div className="flex flex-wrap items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        {GRAVITY_AUTHORS.map((author) => (
                            <button
                                key={author.value}
                                type="button"
                                onClick={() => setAuthorFilter(author.value)}
                                className={`text-xs px-4 py-2 rounded-full border transition-all duration-200 flex items-center gap-2
                                    ${authorFilter === author.value
                                        ? 'bg-[#AE7D5C] border-[#AE7D5C] text-white shadow-md'
                                        : 'bg-white/50 border-[#1E2A33]/10 text-[#1E2A33]/60 hover:border-[#AE7D5C]/40'}
                                `}
                            >
                                {authorFilter === author.value && <Check className="w-3 h-3" />}
                                {author.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Chat Messages Area */}
            <div className="w-full pb-8 space-y-8 flex flex-col">
                {messages.length === 0 && !isLoading && (
                    <div className="text-center py-12 text-[#1E2A33]/50 font-roboto font-light border border-[#1E2A33]/10 rounded-2xl bg-white/50 backdrop-blur-sm m-auto w-full max-w-2xl">
                        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Commencez la conversation avec le cerveau {brain === 'gravity' ? 'Ostéopathique' : 'Mission'}.</p>
                    </div>
                )}

                {messages.map((message) => (
                    <div key={message.id} className={`flex w-full ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {message.role === 'user' ? (
                            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-6 py-4 shadow-sm ${brain === 'gravity' ? 'bg-[#AE7D5C] text-white' : 'bg-[#1E2A33] text-white'}`}>
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <User className="w-4 h-4" />
                                    <span className="text-xs font-medium uppercase tracking-wider">Vous</span>
                                </div>
                                <div className="font-roboto font-light text-base leading-relaxed whitespace-pre-wrap">
                                    {message.content}
                                </div>
                            </div>
                        ) : (
                            <div className={`max-w-[100%] sm:max-w-[90%] w-full relative bg-gradient-to-br from-white to-gray-50/50 border rounded-2xl p-6 sm:p-8 shadow-sm ${brain === 'gravity' ? 'border-[#AE7D5C]/30' : 'border-[#1E2A33]/30'}`}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`p-2.5 rounded-xl flex items-center justify-center ${brain === 'gravity' ? 'bg-[#FDFBEF] text-[#AE7D5C]' : 'bg-gray-100 text-[#1E2A33]'}`}>
                                        <Brain className="w-5 h-5" />
                                    </div>
                                    <h3 className="font-bebas text-xl text-[#1E2A33] tracking-wide">
                                        Cerveau {brain === 'gravity' ? 'Gravity' : 'Mission'}
                                    </h3>
                                </div>

                                <div className="prose prose-sm sm:prose-base max-w-none font-roboto font-light text-[#1E2A33]/80 whitespace-pre-wrap leading-relaxed">
                                    {message.content}
                                </div>

                                {message.sources && message.sources.length > 0 && (
                                    <div className="mt-6 pt-6 border-t border-[#1E2A33]/10">
                                        <button
                                            type="button"
                                            onClick={() => toggleSources(message.id)}
                                            className={`flex items-center gap-2 text-sm font-medium transition-colors px-4 py-2 rounded-lg ${brain === 'gravity' ? 'text-[#AE7D5C] hover:bg-[#AE7D5C]/5' : 'text-[#1E2A33]/70 hover:bg-[#1E2A33]/5'}`}
                                        >
                                            <BookOpen className="w-4 h-4" />
                                            {showSourcesForMessage[message.id] ? "Masquer les sources" : `Consulter les sources (${message.sources.length})`}
                                        </button>

                                        {showSourcesForMessage[message.id] && (
                                            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                                                {message.sources.map((result, index) => (
                                                    <div
                                                        key={`${message.id}-${result.id}-${index}`}
                                                        className={`group relative bg-white border border-[#1E2A33]/10 rounded-xl p-5 hover:shadow-md transition-all duration-300 ${brain === 'gravity' ? 'hover:border-[#AE7D5C]/40' : 'hover:border-[#1E2A33]/40'}`}
                                                    >
                                                        <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-[#1E2A33]/10 transition-colors ${brain === 'gravity' ? 'group-hover:bg-[#AE7D5C]' : 'group-hover:bg-[#1E2A33]'}`}></div>
                                                        <div className="flex justify-between items-start mb-3 gap-2">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bebas text-sm border shadow-sm shrink-0 ${brain === 'gravity' ? 'bg-[#FDFBEF] text-[#AE7D5C] border-[#AE7D5C]/20' : 'bg-gray-50 text-[#1E2A33] border-[#1E2A33]/20'}`}>
                                                                    {(result.score * 100).toFixed(0)}%
                                                                </div>
                                                                <div>
                                                                    <div className="font-roboto text-[10px] sm:text-xs text-[#1E2A33]/70 font-medium truncate flex flex-wrap gap-2 items-center">
                                                                        ID: <span className="font-mono text-[9px] bg-gray-100 px-1 rounded text-[#1E2A33]/60">{result.id.split('-')[0]}</span>
                                                                        {result.author && <span className="font-medium text-[#AE7D5C]">👤 {result.author}</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <p className="text-[#1E2A33]/90 text-sm font-roboto font-light leading-relaxed mb-4 break-words">
                                                            {result.text || "[Sans texte]"}
                                                        </p>
                                                        <div className="flex flex-wrap items-center gap-2 text-[9px] sm:text-[10px] font-roboto">
                                                            {result.theme && (
                                                                <span className={`px-2 py-1 rounded-full font-medium border uppercase tracking-wide ${brain === 'gravity' ? 'bg-[#FDFBEF] text-[#AE7D5C] border-[#AE7D5C]/20' : 'bg-gray-100 text-[#1E2A33] border-[#1E2A33]/20'}`}>
                                                                    {result.theme}
                                                                </span>
                                                            )}
                                                            {result.source && (
                                                                <span className="px-2 py-1 rounded-full bg-[#1E2A33]/5 text-[#1E2A33]/70 border border-[#1E2A33]/10 truncate max-w-full">
                                                                    {result.source}
                                                                </span>
                                                            )}
                                                            {result.filepath && (
                                                                <a href={`vscode://file/${result.filepath}`} className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#1E2A33] text-white hover:bg-[#AE7D5C] transition-colors truncate shadow-sm">
                                                                    <FileCode className="w-3 h-3" /> VS Code
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && (
                    <div className="flex w-full justify-start">
                        <div className={`max-w-[80%] relative bg-white border border-[#1E2A33]/10 rounded-2xl p-6 shadow-sm`}>
                            <div className="flex items-center gap-4">
                                <div className="relative w-8 h-8">
                                    <div className={`absolute inset-0 border-2 border-[#1E2A33]/10 rounded-full animate-spin ${brain === 'gravity' ? 'border-t-[#AE7D5C]' : 'border-t-[#1E2A33]'}`}></div>
                                    <Brain className={`absolute inset-0 m-auto w-4 h-4 animate-pulse ${brain === 'gravity' ? 'text-[#AE7D5C]' : 'text-[#1E2A33]'}`} />
                                </div>
                                <span className="text-[#1E2A33]/60 font-roboto font-light text-sm uppercase tracking-widest animate-pulse">Réflexion en cours...</span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Form Sticky at Bottom */}
            <div className="sticky bottom-6 z-20 mt-4">
                <form onSubmit={handleSearch} className="w-full relative group">
                    <div className={`absolute -inset-1 bg-gradient-to-r rounded-2xl blur-md opacity-30 group-hover:opacity-60 transition duration-700 ${brain === 'gravity' ? 'from-[#AE7D5C]/30' : 'from-[#1E2A33]/30'} to-transparent`}></div>
                    <div className={`relative flex items-center w-full rounded-2xl bg-white/90 backdrop-blur-md border overflow-hidden shadow-lg transition-all
                        ${brain === 'gravity' ? 'border-[#AE7D5C]/30 focus-within:border-[#AE7D5C]/60 focus-within:ring-4 focus-within:ring-[#AE7D5C]/20' : 'border-[#1E2A33]/20 focus-within:border-[#1E2A33]/50 focus-within:ring-4 focus-within:ring-[#1E2A33]/20'}`}>
                        <div className="pl-4 sm:pl-6 text-[#1E2A33]/50">
                            <Search className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={brain === 'gravity' ? "Discuter avec l'Ostéopathie..." : "Discuter avec le backend Mission..."}
                            className="flex-1 min-w-0 bg-transparent text-[#1E2A33] px-3 sm:px-6 py-4 sm:py-5 outline-none placeholder:text-[#1E2A33]/40 font-roboto font-light text-base sm:text-lg"
                            required
                        />
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`px-4 sm:px-8 py-4 sm:py-5 text-sm tracking-widest text-white disabled:opacity-50 transition-colors font-bebas flex items-center justify-center min-w-[80px] sm:min-w-[120px]
                            ${brain === 'gravity' ? 'bg-[#AE7D5C] hover:bg-[#8D6347]' : 'bg-[#1E2A33] hover:bg-[#2A3B47]'}`}
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>ENVOYER</span>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
