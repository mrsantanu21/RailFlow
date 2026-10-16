import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AiChatMessage, AiTrainSummary, AiStatus } from '../../types/ai';
import { sendAiChat, getAiStatus } from '../../api/aiEndpoints';
import { searchTrains } from '../../api/endpoints';
import { type AiSearchContext, getSuggestedPrompts } from '../../utils/aiPrompts';

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onPopulateSearch?: (params: { from: string; to: string; date?: string }) => void;
  searchContext?: AiSearchContext;
}

const INITIAL_WELCOME_MESSAGE: AiChatMessage = {
  id: 'welcome',
  sender: 'assistant',
  text: "Hello! I'm your RailFlow travel assistant. I can help you find trains, compare fares, understand booking options and check available journey information. What would you like to plan?",
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

function formatInlineStyles(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((sub, j) => {
      if (sub.startsWith('`') && sub.endsWith('`')) {
        return (
          <code key={`${i}-${j}`} className="px-1 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 font-mono text-[10px]">
            {sub.slice(1, -1)}
          </code>
        );
      }
      return sub;
    });
  });
}

function renderFormattedText(content: string): React.ReactNode {
  const lines = content.split('\n');
  return (
    <div className="space-y-1 whitespace-pre-wrap break-words">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('### ')) {
          return (
            <div key={idx} className="font-bold text-xs text-slate-900 dark:text-white mt-1.5 mb-0.5">
              {formatInlineStyles(trimmed.replace('### ', ''))}
            </div>
          );
        }
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          return (
            <div key={idx} className="font-bold text-xs text-slate-900 dark:text-white mt-2 mb-1">
              {formatInlineStyles(trimmed.replace(/^#+ /, ''))}
            </div>
          );
        }
        if (trimmed === '---' || trimmed === '***') {
          return <hr key={idx} className="my-1.5 border-slate-200/80 dark:border-slate-700/80" />;
        }
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          const text = trimmed.replace(/^(\*|-|•) /, '');
          return (
            <div key={idx} className="flex items-start gap-1.5 text-xs pl-1">
              <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
              <span>{formatInlineStyles(text)}</span>
            </div>
          );
        }
        if (!trimmed) {
          return <div key={idx} className="h-0.5" />;
        }
        return <p key={idx}>{formatInlineStyles(line)}</p>;
      })}
    </div>
  );
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  isOpen,
  onClose,
  onPopulateSearch,
  searchContext,
}) => {
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState<AiChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const effectiveContext: AiSearchContext = React.useMemo(() => ({
    fromCode: searchContext?.fromCode || searchParams.get('from')?.toUpperCase() || undefined,
    fromName: searchContext?.fromName || (searchParams.get('from')?.toUpperCase() === 'NDLS' ? 'New Delhi' : undefined),
    toCode: searchContext?.toCode || searchParams.get('to')?.toUpperCase() || undefined,
    toName: searchContext?.toName || (searchParams.get('to')?.toUpperCase() === 'BSB' ? 'Varanasi' : undefined),
    date: searchContext?.date || searchParams.get('date') || undefined,
    quota: searchContext?.quota || searchParams.get('quota')?.toUpperCase() || 'GENERAL',
    passengers: searchContext?.passengers || parseInt(searchParams.get('passengers') || '1', 10) || 1,
  }), [searchContext, searchParams]);

  const suggestedPrompts = React.useMemo(
    () => getSuggestedPrompts(effectiveContext),
    [effectiveContext]
  );

  // Retain trigger reference on open for accessible focus restoration on close
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current =
        (document.activeElement as HTMLElement) ||
        document.getElementById('ai-assistant-trigger');
    }
  }, [isOpen]);

  const handleCloseAndReturnFocus = useCallback(() => {
    onClose();
    setTimeout(() => {
      const el = previousActiveElementRef.current || document.getElementById('ai-assistant-trigger');
      if (el && typeof el.focus === 'function') {
        el.focus();
      }
    }, 50);
  }, [onClose]);

  // Fetch AI status on mount
  useEffect(() => {
    if (isOpen) {
      getAiStatus()
        .then((status) => setAiStatus(status))
        .catch(() => setAiStatus(null));
      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen, isMinimized]);

  // Close AI panel on Escape key press with accessible focus return
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseAndReturnFocus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCloseAndReturnFocus]);

  const generateLocalAiFallback = async (queryText: string): Promise<AiChatMessage> => {
    const normalized = queryText.toLowerCase();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Train search intent (e.g. "Find trains between two stations" or "Find trains from New Delhi to Varanasi for tomorrow")
    if (
      normalized.includes('train') ||
      normalized.includes('station') ||
      normalized.includes('varanasi') ||
      normalized.includes('delhi') ||
      normalized.includes('bsb') ||
      normalized.includes('ndls')
    ) {
      let trainSummaries: AiTrainSummary[] = [];

      try {
        const trains = await searchTrains({
          fromStationCode: 'NDLS',
          toStationCode: 'BSB',
          date: tomorrowStr,
        });

        if (trains && trains.length > 0) {
          trainSummaries = trains.slice(0, 3).map((t) => {
            const dur = t.journey.durationMinutes ?? 480;
            return {
              trainNumber: t.train.number,
              trainName: t.train.name,
              trainType: t.train.type,
              fromStationCode: 'NDLS',
              toStationCode: 'BSB',
              journeyDate: tomorrowStr,
              departureTime: t.journey.departureTime,
              arrivalTime: t.journey.arrivalTime,
              duration: `${Math.floor(dur / 60)}h ${dur % 60}m`,
              distanceKm: t.journey.distanceKm ?? 759,
              classes: Object.fromEntries(
                Object.entries(t.classes || {}).map(([cCode, cVal]: [string, any]) => [
                  cCode,
                  { available: cVal.available ?? 10, fareRupees: cVal.fare ?? 1200 },
                ])
              ),
            };
          });
        }
      } catch {
        trainSummaries = [];
      }

      if (trainSummaries.length === 0) {
        trainSummaries = [
          {
            trainNumber: '22436',
            trainName: 'Vande Bharat Express',
            trainType: 'VANDE_BHARAT',
            fromStationCode: 'NDLS',
            toStationCode: 'BSB',
            journeyDate: tomorrowStr,
            departureTime: '06:00',
            arrivalTime: '14:00',
            duration: '8h 0m',
            distanceKm: 759,
            classes: {
              EXEC_CHAIR: { available: 12, fareRupees: 3120 },
              AC_CHAIR: { available: 45, fareRupees: 1750 },
            },
          },
          {
            trainNumber: '12560',
            trainName: 'Shiv Ganga Express',
            trainType: 'SUPERFAST',
            fromStationCode: 'NDLS',
            toStationCode: 'BSB',
            journeyDate: tomorrowStr,
            departureTime: '20:05',
            arrivalTime: '06:10',
            duration: '10h 5m',
            distanceKm: 759,
            classes: {
              AC_1: { available: 4, fareRupees: 2850 },
              AC_2: { available: 18, fareRupees: 1720 },
              AC_3: { available: 32, fareRupees: 1240 },
              SLEEPER: { available: 60, fareRupees: 480 },
            },
          },
          {
            trainNumber: '15128',
            trainName: 'Kashi Vishwanath Express',
            trainType: 'EXPRESS',
            fromStationCode: 'NDLS',
            toStationCode: 'BSB',
            journeyDate: tomorrowStr,
            departureTime: '11:35',
            arrivalTime: '04:50',
            duration: '17h 15m',
            distanceKm: 792,
            classes: {
              AC_2: { available: 8, fareRupees: 1650 },
              AC_3: { available: 22, fareRupees: 1180 },
              SLEEPER: { available: 40, fareRupees: 440 },
            },
          },
        ];
      }

      return {
        id: `fallback_${Date.now()}`,
        sender: 'assistant',
        text: `**RailFlow Journey Explorer (Local Prototype Catalogue)**\n\nThe live AI language model is currently standing by, but here are verified direct express trains for **New Delhi (NDLS) → Varanasi (BSB)** from RailFlow's prototype catalogue:\n\n* **22436 Vande Bharat Express**: Departs NDLS at 06:00, arrives BSB at 14:00 (8h 0m)\n* **12560 Shiv Ganga Express**: Departs NDLS at 20:05, arrives BSB at 06:10 (10h 5m)\n* **15128 Kashi Vishwanath Express**: Departs NDLS at 11:35, arrives BSB at 04:50 (17h 15m)\n\n*All trains use RailFlow prototype schedule data. No live tickets or real payments are processed.*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        trainResults: trainSummaries,
        isError: false,
        isFallback: true,
        actionParams: {
          from: 'NDLS',
          to: 'BSB',
          date: tomorrowStr,
          label: 'Apply NDLS → BSB to Search Form',
        },
      };
    }

    // Cheapest option intent
    if (normalized.includes('cheap') || normalized.includes('fare') || normalized.includes('price')) {
      const fromStr = effectiveContext.fromName || effectiveContext.fromCode || 'New Delhi (NDLS)';
      const toStr = effectiveContext.toName || effectiveContext.toCode || 'Varanasi (BSB)';
      const fromCd = effectiveContext.fromCode || 'NDLS';
      const toCd = effectiveContext.toCode || 'BSB';

      return {
        id: `fallback_${Date.now()}`,
        sender: 'assistant',
        text: `**RailFlow Fare Explorer (Local Catalogue Mode)**\n\nBased on RailFlow's prototype inventory for **${fromStr} → ${toStr}**:\n\n* **Most economical option**: Check Sleeper / Second Sitting classes on standard express services.\n* **Fastest corridor transit**: Check AC Chair Car or 3-Tier AC on Superfast / Vande Bharat runs.\n\nClick below to apply this route to the search page.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: false,
        isFallback: true,
        actionParams: {
          from: fromCd,
          to: toCd,
          date: effectiveContext.date || tomorrowStr,
          label: `Search ${fromCd} → ${toCd} on Portal`,
        },
      };
    }

    // Compare schedule times intent
    if (normalized.includes('compare') || normalized.includes('time') || normalized.includes('schedule')) {
      return {
        id: `fallback_${Date.now()}`,
        sender: 'assistant',
        text: `**RailFlow Timetable Comparison (Local Prototype)**\n\nHere is the schedule breakdown on the **NDLS → BSB** corridor:\n\n* **Morning**: 22436 Vande Bharat departs **06:00** → arrives **14:00** (Day journey, 8h 0m)\n* **Mid-Day**: 15128 Kashi Vishwanath departs **11:35** → arrives **04:50** (+1 day)\n* **Overnight**: 12560 Shiv Ganga departs **20:05** → arrives **06:10** (+1 day, 10h 5m)\n\nClick below to compare on the main search form.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: false,
        isFallback: true,
        actionParams: {
          from: 'NDLS',
          to: 'BSB',
          date: tomorrowStr,
          label: 'Compare on Search Form',
        },
      };
    }

    // Running status intent
    if (normalized.includes('running') || normalized.includes('track') || normalized.includes('status')) {
      return {
        id: `fallback_${Date.now()}`,
        sender: 'assistant',
        text: `**RailFlow Running Status (Local Prototype)**\n\nFor train **22436 Vande Bharat Express**:\n* Route: New Delhi (NDLS) → Kanpur Central (CNB) → Prayagraj Jn (PRYJ) → Varanasi Jn (BSB)\n* Distance: 759 km | Running Days: Tue, Wed, Fri, Sat, Sun\n\nTo view real-time station progression and platform telemetry, use the Live Tracking page.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: false,
        isFallback: true,
        actionParams: {
          from: 'NDLS',
          to: 'BSB',
          date: tomorrowStr,
          label: 'Search Train 22436 Route',
        },
      };
    }

    // General fallback
    return {
      id: `fallback_${Date.now()}`,
      sender: 'assistant',
      text: `**RailFlow Journey Assistant**\n\nThe AI conversational model is currently standing by. You can explore verified railway schedules, check berth availability, and simulate reservations directly using the portal controls.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isError: false,
      isFallback: true,
      actionParams: {
        from: 'NDLS',
        to: 'BSB',
        date: tomorrowStr,
        label: 'Go to Station Route Search',
      },
    };
  };

  const handleSend = async (textToSend?: string) => {
    if (loading) return; // Prevent duplicate submissions
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const userMsg: AiChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      // Build lightweight conversation history for backend context
      const history = messages.slice(-6).map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      }));

      const res = await sendAiChat(text, history);

      if (res && res.reply) {
        const assistantMsg: AiChatMessage = {
          id: `assistant_${Date.now()}`,
          sender: 'assistant',
          text: res.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          trainResults: res.trainResults,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        return;
      }
      throw new Error('Empty AI response');
    } catch (_err: any) {
      // Graceful local fallback when AI backend is unavailable
      const fallbackMsg = await generateLocalAiFallback(text);
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([INITIAL_WELCOME_MESSAGE]);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ease-out shadow-2xl border border-slate-200/90 dark:border-slate-800 ${
        isMinimized
          ? 'bottom-4 right-4 sm:right-6 w-72 h-14 rounded-2xl overflow-hidden bg-[#0B1528] text-white flex items-center justify-between px-4'
          : 'bottom-2 right-2 sm:bottom-6 sm:right-6 w-[calc(100vw-1rem)] sm:w-[430px] max-h-[92vh] sm:max-h-[720px] h-[640px] rounded-3xl overflow-hidden bg-white dark:bg-slate-900 flex flex-col'
      }`}
      role="dialog"
      aria-label="RailFlow AI Travel Assistant"
    >
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="bg-[#0B1528] px-4 py-3 sm:px-5 sm:py-3.5 text-white flex items-center justify-between shrink-0 select-none border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm tracking-tight text-white">
                RailFlow AI
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                Assistant
              </span>
            </div>
            {!isMinimized && (
              <span className="text-[10px] text-slate-300 font-normal leading-tight">
                Your intelligent railway journey assistant
              </span>
            )}
          </div>
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1">
          {!isMinimized && (
            <button
              type="button"
              onClick={handleClearChat}
              title="Clear conversation"
              aria-label="Clear conversation"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand assistant' : 'Minimize assistant'}
            aria-label={isMinimized ? 'Expand assistant' : 'Minimize assistant'}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isMinimized ? 'open_in_full' : 'remove'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCloseAndReturnFocus}
            title="Close assistant"
            aria-label="Close assistant"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* When minimized, hide body and footer */}
      {!isMinimized && (
        <>
          {/* ─── Scrollable Message Area ────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/80 dark:bg-slate-950/70 text-slate-800 dark:text-slate-100">
            {/* Provider Availability Notice if Unconfigured */}
            {aiStatus && !aiStatus.available && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 mt-0.5">
                  info
                </span>
                <div className="leading-snug">
                  <span className="font-bold">Gemini Key Notice:</span> Server currently running without{' '}
                  <code className="bg-amber-500/20 px-1 py-0.5 rounded text-[10px]">GEMINI_API_KEY</code>.
                  Add your free key to test live model generation.
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-start gap-2.5 max-w-[92%]">
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full bg-[#0B1528] text-amber-400 flex items-center justify-center shrink-0 shadow-xs border border-amber-400/20 mt-1">
                        <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                      </div>
                    )}

                    <div className="flex flex-col">
                      <div
                        className={`p-3.5 text-xs leading-relaxed shadow-xs ${
                          isUser
                            ? 'bg-[#0E254A] text-white rounded-2xl rounded-tr-xs'
                            : msg.isError
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900 rounded-2xl rounded-tl-xs'
                            : msg.isFallback
                            ? 'bg-amber-50/70 dark:bg-amber-950/30 text-slate-800 dark:text-slate-100 border border-amber-300/60 dark:border-amber-800/60 rounded-2xl rounded-tl-xs'
                            : 'bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl rounded-tl-xs'
                        }`}
                      >
                        {msg.isFallback && (
                          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                            <span className="material-symbols-outlined text-[14px]">database</span>
                            <span>Local Prototype Response</span>
                          </div>
                        )}
                        {isUser ? msg.text : renderFormattedText(msg.text)}

                        {/* Working Action Button to populate search form */}
                        {msg.actionParams && onPopulateSearch && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onPopulateSearch({
                                  from: msg.actionParams!.from,
                                  to: msg.actionParams!.to,
                                  date: msg.actionParams!.date,
                                });
                                onClose();
                              }}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[15px]">alt_route</span>
                              <span>{msg.actionParams.label || 'Apply to Search Form'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <span
                        className={`text-[10px] text-slate-400 mt-1 px-1 ${
                          isUser ? 'text-right' : 'text-left'
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>

                    {isUser && (
                      <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 text-xs font-bold mt-1">
                        <span className="material-symbols-outlined text-[16px]">person</span>
                      </div>
                    )}
                  </div>

                  {/* Render Rich Train Cards if Search Tool Returned Results */}
                  {msg.trainResults && msg.trainResults.length > 0 && (
                    <div className="mt-3 w-full pl-9 pr-1 space-y-2">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Available Trains ({msg.trainResults.length})
                      </div>
                      {msg.trainResults.slice(0, 3).map((train: AiTrainSummary) => {
                        const firstClassKey = Object.keys(train.classes)[0];
                        const firstClass = firstClassKey ? train.classes[firstClassKey] : null;

                        return (
                          <div
                            key={train.trainNumber}
                            onClick={() => {
                              if (onPopulateSearch) {
                                onPopulateSearch({
                                  from: train.fromStationCode || 'NDLS',
                                  to: train.toStationCode || 'BSB',
                                  date: train.journeyDate,
                                });
                                onClose();
                              }
                            }}
                            className={`bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-xs hover:border-amber-400/60 dark:hover:border-amber-400/60 transition-all flex items-center justify-between gap-3 ${
                              onPopulateSearch ? 'cursor-pointer hover:shadow-md' : ''
                            }`}
                            role={onPopulateSearch ? 'button' : undefined}
                            tabIndex={onPopulateSearch ? 0 : undefined}
                            title={onPopulateSearch ? `Search & book ${train.trainName}` : undefined}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary dark:text-primary-container flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[18px]">train</span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {train.trainNumber} {train.trainName}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {train.departureTime} → {train.arrivalTime || '--:--'} ({train.duration})
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end shrink-0">
                              {firstClass && (
                                <>
                                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                                    ₹ {firstClass.fareRupees.toLocaleString('en-IN')}
                                  </span>
                                  <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                    Available: {firstClass.available}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {onPopulateSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            const firstTrain = msg.trainResults?.[0];
                            onPopulateSearch({
                              from: firstTrain?.fromStationCode || 'NDLS',
                              to: firstTrain?.toStationCode || 'BSB',
                              date: firstTrain?.journeyDate,
                            });
                            onClose();
                          }}
                          className="w-full mt-2 py-2 px-3 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-primary dark:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>View All Trains & Book</span>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Suggested Prompt Chips (Visible only when 1 message in conversation) */}
            {messages.length === 1 && (
              <div className="pt-2">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2.5 px-1">
                  Try asking me about:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestedPrompts.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(item.prompt)}
                      disabled={loading}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-slate-800 text-left transition-all flex items-start gap-2.5 group shadow-2xs disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <span className="material-symbols-outlined text-slate-500 group-hover:text-amber-500 text-[18px] shrink-0 mt-0.5 transition-colors">
                        {item.icon}
                      </span>
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white leading-snug">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Typing / Loading indicator */}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pl-2">
                <div className="w-6 h-6 rounded-full bg-[#0B1528] text-amber-400 flex items-center justify-center animate-pulse">
                  <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                </div>
                <span className="italic">RailFlow AI is checking live schedules & fares...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ─── Footer Input Area ────────────────────────────────────────── */}
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 rounded-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 focus-within:border-amber-400 dark:focus-within:border-amber-400 transition-colors">
              <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0">
                search
              </span>
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything..."
                disabled={loading}
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-900 dark:text-white placeholder:text-slate-400 py-1"
                aria-label="Ask RailFlow AI a question"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!inputText.trim() || loading}
                aria-label="Send message"
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
                  inputText.trim() && !loading
                    ? 'bg-[#0E254A] text-white hover:bg-[#163768] shadow-xs'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">send</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
