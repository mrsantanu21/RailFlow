import React from 'react';
import { ArrowRight, Calendar, Users, Ticket, TrainTrack, SlidersHorizontal } from 'lucide-react';

interface JourneyContextBarProps {
  fromCode: string;
  fromStationName: string;
  toCode: string;
  toStationName: string;
  formattedDate: string;
  quotaLabel: string;
  passCount: number;
  totalTrains: number;
  onModifySearch: () => void;
  isModifyOpen?: boolean;
}

export const JourneyContextBar: React.FC<JourneyContextBarProps> = ({
  fromCode,
  fromStationName,
  toCode,
  toStationName,
  formattedDate,
  quotaLabel,
  passCount,
  totalTrains,
  onModifySearch,
  isModifyOpen = false,
}) => {
  return (
    <section aria-label="Route summary" className="w-full bg-surface-container-low/95 backdrop-blur-md rounded-2xl border border-outline-variant/30 py-3.5 px-4 sm:px-6 shadow-sm">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3 font-sans">
        {/* Left: Origin to Destination with Corridor Indicator */}
        <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
          <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
            <TrainTrack className="w-5 h-5 text-on-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-extrabold text-base sm:text-lg text-on-surface tracking-tight truncate">
                {fromStationName || fromCode}
              </span>
              <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {fromCode}
              </span>
              <ArrowRight className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              <span className="font-display font-extrabold text-base sm:text-lg text-on-surface tracking-tight truncate">
                {toStationName || toCode}
              </span>
              <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {toCode}
              </span>
            </div>

            {/* Scannable Metadata Badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant font-medium mt-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-surface-container/80 border border-outline-variant/30 text-[11px] font-semibold text-on-surface">
                <Calendar className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span>{formattedDate}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                <Ticket className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>{quotaLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-[11px] font-semibold text-blue-900 dark:text-blue-200">
                <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>{passCount} {passCount === 1 ? 'Passenger' : 'Passengers'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Available Trains & Modify Search Action */}
        <div className="flex items-center gap-2.5 sm:gap-3 self-end md:self-center shrink-0">
          <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-status-confirmed shadow-[0_0_6px_#10b981] animate-pulse" aria-hidden="true" />
            <span className="font-bold text-emerald-900 dark:text-emerald-200">
              {totalTrains} {totalTrains === 1 ? 'Train Available' : 'Trains Available'}
            </span>
          </div>

          <button
            type="button"
            onClick={onModifySearch}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isModifyOpen
                ? 'bg-primary text-on-primary shadow-md'
                : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/40 active:scale-95'
            }`}
            aria-expanded={isModifyOpen}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isModifyOpen ? 'Hide Filters' : 'Modify Search'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
