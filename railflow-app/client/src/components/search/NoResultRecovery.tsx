import React, { useState } from 'react';
import {
  Compass,
  Calendar,
  GitFork,
  ArrowRight,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface NearbyStationOption {
  stationCode: string;
  stationName: string;
  role: 'ORIGIN' | 'DESTINATION';
  relation: string;
  directTrainsCount: number;
  searchUrl: string;
}

export interface AlternateDateOption {
  date: string;
  dayLabel: string;
  directTrainsCount: number;
  isToday: boolean;
  searchUrl: string;
}

export interface ConnectingJourneyOption {
  id: string;
  transferStation: {
    code: string;
    name: string;
  };
  totalDurationMin: number;
  layoverMin: number;
  leg1: {
    trainNumber: string;
    trainName: string;
    fromStation: string;
    toStation: string;
    departureTime: string;
    arrivalTime: string;
    durationMin: number;
  };
  leg2: {
    trainNumber: string;
    trainName: string;
    fromStation: string;
    toStation: string;
    departureTime: string;
    arrivalTime: string;
    durationMin: number;
  };
}

interface NoResultRecoveryProps {
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  dateStr: string;
  nearbyStations?: NearbyStationOption[];
  alternateDates?: AlternateDateOption[];
  connectingJourneys?: ConnectingJourneyOption[];
  onSelectStation: (role: 'ORIGIN' | 'DESTINATION', code: string) => void;
  onSelectDate: (date: string) => void;
}

export const NoResultRecovery: React.FC<NoResultRecoveryProps> = ({
  fromCode,
  fromName,
  toCode,
  toName,
  dateStr,
  nearbyStations = [],
  alternateDates = [],
  connectingJourneys = [],
  onSelectStation,
  onSelectDate,
}) => {
  const [showConnecting, setShowConnecting] = useState(true);
  const [showDemoSeeds, setShowDemoSeeds] = useState(false);

  const originNearby = nearbyStations.filter((s) => s.role === 'ORIGIN');
  const destNearby = nearbyStations.filter((s) => s.role === 'DESTINATION');

  const formatMinToHours = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  };

  return (
    <div className="flex flex-col gap-5 text-left animate-fade-in">
      {/* ─── Header Explanation Box ────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-on-surface">
              No direct trains found for {fromName || fromCode} → {toName || toCode}
            </h3>
            <p className="text-xs text-on-surface-variant mt-1 max-w-2xl leading-relaxed">
              No direct scheduled services operate on this exact station pair for{' '}
              <strong className="text-on-surface">{dateStr}</strong>. Try selecting a nearby metropolitan terminal, an alternate day of the week, or review connecting routes.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Section 1: Nearby Stations (if available) ────────────────────── */}
      {(originNearby.length > 0 || destNearby.length > 0) && (
        <div className="p-5 rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Compass className="w-4 h-4 text-primary" />
            <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface">
              Explore Nearby Metropolitan Terminals
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {originNearby.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20">
                <span className="text-[11px] font-bold text-on-surface-variant block mb-2">
                  Departing from nearby {fromName || fromCode}:
                </span>
                <div className="flex flex-wrap gap-2">
                  {originNearby.map((stn) => (
                    <button
                      key={stn.stationCode}
                      type="button"
                      onClick={() => onSelectStation('ORIGIN', stn.stationCode)}
                      className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs font-bold text-primary flex items-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer"
                    >
                      <span>{stn.stationName} ({stn.stationCode})</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-primary/10 text-primary">
                        {stn.directTrainsCount} direct
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {destNearby.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20">
                <span className="text-[11px] font-bold text-on-surface-variant block mb-2">
                  Arriving at nearby {toName || toCode}:
                </span>
                <div className="flex flex-wrap gap-2">
                  {destNearby.map((stn) => (
                    <button
                      key={stn.stationCode}
                      type="button"
                      onClick={() => onSelectStation('DESTINATION', stn.stationCode)}
                      className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs font-bold text-secondary flex items-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer"
                    >
                      <span>{stn.stationName} ({stn.stationCode})</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-secondary/10 text-secondary">
                        {stn.directTrainsCount} direct
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Section 2: Alternate Dates ───────────────────────────────────── */}
      {alternateDates.length > 0 && (
        <div className="p-5 rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-primary" />
            <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface">
              Check Alternate Journey Dates
            </h4>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {alternateDates.map((alt) => (
              <button
                key={alt.date}
                type="button"
                onClick={() => onSelectDate(alt.date)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer ${
                  alt.directTrainsCount > 0
                    ? 'bg-primary-fixed/25 hover:bg-primary-fixed/40 border-primary text-primary'
                    : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-on-surface-variant'
                }`}
              >
                <span>{alt.dayLabel}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    alt.directTrainsCount > 0
                      ? 'bg-status-confirmed/20 text-emerald-800 dark:text-emerald-300'
                      : 'bg-surface-container-highest text-on-surface-variant'
                  }`}
                >
                  {alt.directTrainsCount > 0 ? `${alt.directTrainsCount} Trains` : 'Search Date'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Section 3: Connecting 1-Transfer Journeys ─────────────────────── */}
      {connectingJourneys.length > 0 && (
        <div className="p-5 rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <GitFork className="w-4 h-4 text-primary" />
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface">
                  Connecting Journeys (1-Transfer via Major Junction)
                </h4>
                <p className="text-[11px] text-on-surface-variant">
                  Coordinated transfers with minimum 45 minutes layover buffer.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowConnecting(!showConnecting)}
              className="text-xs font-bold text-primary flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>{showConnecting ? 'Hide' : 'View'} ({connectingJourneys.length})</span>
              {showConnecting ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showConnecting && (
            <div className="flex flex-col gap-3 mt-4">
              {connectingJourneys.map((conn) => (
                <div
                  key={conn.id}
                  className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4"
                >
                  <div className="flex-1 space-y-2">
                    {/* Leg 1 */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-mono font-bold text-[10px]">
                        Leg 1: {conn.leg1.trainNumber}
                      </span>
                      <strong className="text-on-surface">{conn.leg1.trainName}</strong>
                      <span className="text-on-surface-variant">
                        {conn.leg1.fromStation} ({conn.leg1.departureTime}) → {conn.leg1.toStation} ({conn.leg1.arrivalTime})
                      </span>
                    </div>

                    {/* Layover Hub Badge */}
                    <div className="pl-4 border-l-2 border-dashed border-amber-500/50 flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 font-semibold py-0.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        Transfer at <strong>{conn.transferStation.name} ({conn.transferStation.code})</strong> •{' '}
                        {formatMinToHours(conn.layoverMin)} layover
                      </span>
                    </div>

                    {/* Leg 2 */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-secondary text-on-secondary font-mono font-bold text-[10px]">
                        Leg 2: {conn.leg2.trainNumber}
                      </span>
                      <strong className="text-on-surface">{conn.leg2.trainName}</strong>
                      <span className="text-on-surface-variant">
                        {conn.leg2.fromStation} ({conn.leg2.departureTime}) → {conn.leg2.toStation} ({conn.leg2.arrivalTime})
                      </span>
                    </div>
                  </div>

                  {/* Right Summary & Action */}
                  <div className="md:border-l md:border-outline-variant/20 md:pl-4 flex flex-col justify-between items-start md:items-end shrink-0 gap-2">
                    <div>
                      <span className="text-[10px] text-on-surface-variant block uppercase font-bold">
                        Total Duration
                      </span>
                      <span className="font-display font-black text-sm text-on-surface">
                        {formatMinToHours(conn.totalDurationMin)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectStation('ORIGIN', conn.leg1.fromStation)}
                      className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Book Leg 1 ({conn.leg1.trainNumber})</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Optional Seeded Demo Pairs Toggle ─────────────────────────────── */}
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => setShowDemoSeeds(!showDemoSeeds)}
          className="text-xs font-semibold text-outline hover:text-on-surface underline transition-colors cursor-pointer"
        >
          {showDemoSeeds ? 'Hide Demo Corridors' : 'Explore Featured Demonstration Corridors'}
        </button>

        {showDemoSeeds && (
          <div className="mt-3 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 max-w-lg mx-auto text-xs text-on-surface-variant space-y-2">
            <span className="font-bold text-on-surface block">Seeded High-Concurrency Demonstrations:</span>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelectStation('ORIGIN', 'NDLS');
                  onSelectStation('DESTINATION', 'BSB');
                }}
                className="px-3 py-1 rounded-lg bg-surface-container-highest hover:bg-primary/20 hover:text-primary font-bold transition-colors cursor-pointer"
              >
                NDLS → BSB (Vande Bharat)
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectStation('ORIGIN', 'HWH');
                  onSelectStation('DESTINATION', 'NDLS');
                }}
                className="px-3 py-1 rounded-lg bg-surface-container-highest hover:bg-primary/20 hover:text-primary font-bold transition-colors cursor-pointer"
              >
                HWH → NDLS (Rajdhani)
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectStation('ORIGIN', 'NDLS');
                  onSelectStation('DESTINATION', 'AGC');
                }}
                className="px-3 py-1 rounded-lg bg-surface-container-highest hover:bg-primary/20 hover:text-primary font-bold transition-colors cursor-pointer"
              >
                NDLS → AGC (Shatabdi)
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectStation('ORIGIN', 'NJP');
                  onSelectStation('DESTINATION', 'HWH');
                }}
                className="px-3 py-1 rounded-lg bg-surface-container-highest hover:bg-primary/20 hover:text-primary font-bold transition-colors cursor-pointer"
              >
                NJP → HWH (12 Trains)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
