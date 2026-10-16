import React from 'react';
import {
  Timer,
  Train,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Radar,
  Grid3X3,
} from 'lucide-react';
import type { TrainSearchResult } from '../../types';
import { ProvenanceBadge } from '../common/ProvenanceBadge';
import { formatTimeHHmm, formatArrivalTime } from '../../utils/timeFormat';

export interface StaticFareInfo {
  isAvailable: boolean;
  distanceKm: number | null;
  ratePerKm: number;
  basePerPassenger: number | null;
  totalEstimatedFare: number | null;
  isSuperfast: boolean;
  categoryLabel: string;
}

interface TrainResultCardProps {
  trainResult: TrainSearchResult;
  selectedClass: string;
  onSelectClass: (trainRunId: string, classType: string) => void;
  isRouteOpen: boolean;
  onToggleRoute: (trainRunId: string) => void;
  onOpenBooking: (train: TrainSearchResult) => void;
  onOpenSeatMatrix: (train: TrainSearchResult, classType: string) => void;
  onOpenSandboxBooking: (train: TrainSearchResult) => void;
  staticFare: StaticFareInfo;
  passCount: number;
}

export const TrainResultCard: React.FC<TrainResultCardProps> = ({
  trainResult,
  selectedClass,
  onSelectClass,
  isRouteOpen,
  onToggleRoute,
  onOpenBooking,
  onOpenSeatMatrix,
  onOpenSandboxBooking,
  staticFare,
  passCount,
}) => {
  const isBookable = trainResult.bookable !== false;
  const classesList = Object.entries(trainResult.classes || {});
  const effectiveClass = selectedClass || (classesList.length > 0 ? classesList[0][0] : '3A');

  const formattedDeparture = formatTimeHHmm(trainResult.journey.departureTime);
  const formattedArrival = formatArrivalTime(
    trainResult.journey.arrivalTime,
    trainResult.journey.departureTime,
    trainResult.journey.durationMinutes
  );

  const renderStopsText = () => {
    const stops = trainResult.route?.totalStops;
    if (stops == null || stops < 0) {
      return 'Not available';
    }
    if (stops === 0) {
      return 'Non-stop direct';
    }
    return `${stops} stop${stops === 1 ? '' : 's'}`;
  };

  const renderDistanceText = () => {
    if (staticFare.distanceKm != null && staticFare.distanceKm > 0) {
      return `${staticFare.distanceKm} km`;
    }
    if (trainResult.journey.distanceKm != null && trainResult.journey.distanceKm > 0) {
      return `${trainResult.journey.distanceKm} km`;
    }
    return 'Not available';
  };

  return (
    <article className="bg-surface-container-lowest rounded-3xl p-5 sm:p-7 shadow-xs hover:shadow-md transition-all duration-200 border border-outline-variant/30 text-left relative group">
      {/* ─── Top Flag / Identity Strip ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-outline-variant/15">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-xl bg-primary text-on-primary font-bold text-sm font-mono shadow-xs">
            {trainResult.train.number}
          </span>
          <div>
            <h3 className="font-display font-bold text-lg text-on-surface flex items-center gap-2">
              <span>{trainResult.train.name}</span>
              <CheckCircle2 className="w-4 h-4 text-primary" />
            </h3>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
              <span className="capitalize font-medium">
                {trainResult.train.type.replace('_', ' ').toLowerCase()}
              </span>
              <span>•</span>
              <span>Daily Operational Run</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
              (trainResult as any).dataStatus === 'LIVE' || isBookable
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/30'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                (trainResult as any).dataStatus === 'LIVE' || isBookable ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
            />
            <span>
              {(trainResult as any).dataStatus === 'LIVE' || isBookable ? 'Live Inventory' : 'Scheduled Timetable'}
            </span>
          </span>

          <ProvenanceBadge
            provenance={trainResult.provenance?.provenance}
            source={trainResult.provenance?.source}
            label={trainResult.provenance?.provenanceLabel}
          />
        </div>
      </div>

      {/* ─── Schedule & Timeline Matrix ───────────────────────────────────── */}
      <div className="grid grid-cols-12 items-center py-5 bg-surface-container-low/50 rounded-2xl px-4 sm:px-6 my-4 border border-outline-variant/20">
        {/* Origin */}
        <div className="col-span-4 text-left">
          <div className="font-display font-black text-2xl sm:text-3xl text-primary leading-none">
            {formattedDeparture}
          </div>
          <div className="font-display font-bold text-sm sm:text-base text-on-surface mt-1">
            {trainResult.journey.fromStation}
          </div>
          <div className="text-xs text-on-surface-variant truncate font-medium">
            {trainResult.journey.fromStationName}
          </div>
        </div>

        {/* Journey Duration & Track */}
        <div className="col-span-4 flex flex-col items-center justify-center px-2">
          <div className="flex items-center gap-1 text-xs text-on-surface-variant font-semibold">
            <Timer className="w-3.5 h-3.5 text-secondary" />
            <span>
              {trainResult.journey.durationMinutes != null
                ? `${Math.floor(trainResult.journey.durationMinutes / 60)}h ${trainResult.journey.durationMinutes % 60}m`
                : '—'}
            </span>
          </div>
          <div className="w-full relative flex items-center justify-between my-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
            <div className="flex-1 h-0.5 bg-primary/30 mx-1" />
            <Train className="w-4 h-4 text-primary -mx-1" />
            <div className="flex-1 h-0.5 bg-primary/30 mx-1" />
            <div className="w-2.5 h-2.5 rounded-full bg-secondary ring-4 ring-secondary/20" />
          </div>
          <div className="text-[11px] text-on-surface-variant font-medium">
            {renderDistanceText()} • {renderStopsText()}
          </div>
        </div>

        {/* Destination */}
        <div className="col-span-4 text-right">
          <div className="font-display font-black text-2xl sm:text-3xl text-primary leading-none flex items-baseline justify-end gap-1.5 flex-wrap">
            <span>{formattedArrival.time}</span>
            {formattedArrival.nextDayLabel && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded border border-amber-300/60 dark:border-amber-700/50">
                {formattedArrival.nextDayLabel}
              </span>
            )}
          </div>
          <div className="font-display font-bold text-sm sm:text-base text-on-surface mt-1">
            {trainResult.journey.toStation}
          </div>
          <div className="text-xs text-on-surface-variant truncate font-medium">
            {trainResult.journey.toStationName}
          </div>
        </div>
      </div>

      {/* ─── Available Travel Classes & Fares ─────────────────────────────── */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] font-bold text-outline uppercase tracking-wider">
            Available Travel Classes & Fare
          </span>
          {!isBookable ? (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Estimated Sandbox Fare</span>
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-status-confirmed" />
              <span>Live Berth Allocation</span>
            </span>
          )}
        </div>

        {!isBookable ? (
          /* Static catalog estimated mock fare */
          <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-left shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span className="font-bold text-xs text-amber-950 dark:text-amber-200">
                  Estimated Sandbox Fare ({staticFare.categoryLabel})
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 dark:bg-amber-900/50 text-amber-950 dark:text-amber-200 border border-amber-300/60 dark:border-amber-700/50">
                SCHEDULED DATA
              </span>
            </div>

            {staticFare.isAvailable ? (
              <div className="flex flex-wrap items-baseline justify-between gap-3 mt-1">
                <div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-950 dark:text-amber-100 font-display tracking-tight leading-none">
                    ~₹{staticFare.totalEstimatedFare?.toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 font-medium">
                    ~₹{staticFare.ratePerKm.toFixed(2)}/km × {staticFare.distanceKm} km • {passCount}{' '}
                    {passCount === 1 ? 'Passenger' : 'Passengers'}
                  </div>
                </div>
                <div className="text-xs text-amber-800 dark:text-amber-300 font-semibold italic flex items-center gap-1">
                  <span>Estimated sandbox fare — not an official railway fare</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-amber-900 dark:text-amber-200 font-medium mt-1">
                Distance data unavailable for this static route. A precise sandbox fare estimate cannot be calculated.
              </div>
            )}

            {classesList.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-800/40">
                <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                  Select Class:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {classesList.map(([cType]) => {
                    const isSelected = effectiveClass === cType;
                    return (
                      <button
                        key={cType}
                        type="button"
                        onClick={() => onSelectClass(trainResult.trainRunId, cType)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-surface-container-high/70 hover:bg-surface-container-highest text-on-surface border border-outline-variant/30'
                        }`}
                      >
                        {cType}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Real bookable train classes */
          <div className="flex flex-wrap gap-2.5 sm:gap-3">
            {classesList.map(([cType, cData]) => {
              const isSelected = selectedClass === cType;
              const isAvailable = cData.available > 0;
              return (
                <div
                  key={cType}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`Class ${cType}, fare ₹${(cData.fare / 100).toFixed(2)}, ${isAvailable ? `Available ${cData.available}` : 'Waitlist'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectClass(trainResult.trainRunId, cType);
                    }
                  }}
                  onClick={() => onSelectClass(trainResult.trainRunId, cType)}
                  className={`p-3 rounded-2xl cursor-pointer transition-all border flex flex-col justify-between min-w-[130px] sm:min-w-[150px] flex-1 max-w-[220px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected
                      ? 'bg-primary-fixed/25 border-primary ring-2 ring-primary shadow-xs'
                      : 'bg-surface-container-low border-outline-variant/30 hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display font-bold text-xs sm:text-sm text-primary tracking-tight leading-tight">
                      {cType}
                    </span>
                    <div className="text-right shrink-0">
                      <span className="font-black text-xs sm:text-sm text-on-surface block whitespace-nowrap">
                        ₹{(cData.fare / 100).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-on-surface-variant block whitespace-nowrap font-medium">
                        Base fare
                      </span>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isAvailable
                          ? 'bg-status-confirmed/15 text-emerald-800 dark:text-emerald-300'
                          : 'bg-status-rac-tatkal/15 text-amber-900 dark:text-amber-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isAvailable ? 'bg-status-confirmed' : 'bg-amber-500'
                        }`}
                        aria-hidden="true"
                      />
                      {isAvailable ? `AVL ${cData.available}` : 'WL'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Expandable Route & Stops Drawer ──────────────────────────────── */}
      {isRouteOpen && (
        <div className="mt-4 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 animate-fade-in">
          <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
            Detailed Route Stops ({trainResult.route?.name || 'Corridor Route'})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-outline-variant/30 text-outline">
                  <th className="pb-2 font-semibold">Seq</th>
                  <th className="pb-2 font-semibold">Station Code</th>
                  <th className="pb-2 font-semibold">Station Name</th>
                  <th className="pb-2 font-semibold">Distance</th>
                  <th className="pb-2 font-semibold">Platform</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 font-sans">
                {trainResult.route?.stops?.map((stop) => (
                  <tr key={stop.sequence} className="py-2">
                    <td className="py-2 font-mono text-on-surface-variant">{stop.sequence}</td>
                    <td className="py-2 font-bold text-primary font-display">{stop.stationCode}</td>
                    <td className="py-2 text-on-surface font-medium">{stop.stationName}</td>
                    <td className="py-2 text-on-surface-variant">
                      {stop.distanceKm != null ? `${stop.distanceKm} km` : '—'}
                    </td>
                    <td className="py-2 text-on-surface-variant">{stop.platform || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Bottom Action Footer ─────────────────────────────────────────── */}
      <div className="mt-5 pt-4 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
        {/* Left Links */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-expanded={isRouteOpen}
            onClick={() => onToggleRoute(trainResult.trainRunId)}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
          >
            {isRouteOpen ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
            <span>{isRouteOpen ? 'Hide Route Schedule' : 'View Route Schedule'}</span>
          </button>

          <a
            href={`/tracking?train=${trainResult.train.number}`}
            className="text-xs font-bold text-secondary hover:underline flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded px-1 py-0.5"
            title={`Track ${trainResult.train.number} on Live Map`}
          >
            <Radar className="w-4 h-4" aria-hidden="true" />
            <span>Live Status & Map</span>
          </a>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* View Seat Matrix action (available for all trains) */}
          <button
            type="button"
            onClick={() => onOpenSeatMatrix(trainResult, effectiveClass)}
            className="px-4 py-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-primary font-bold text-xs border border-outline-variant/30 flex items-center gap-1.5 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Open Coach Berth Matrix"
          >
            <Grid3X3 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Seat Matrix</span>
          </button>

          {!isBookable ? (
            <>
              <span className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant font-medium text-xs border border-outline-variant/30">
                Static catalog
              </span>
              <button
                type="button"
                onClick={() => onOpenSandboxBooking(trainResult)}
                className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>Quick Sandbox Book</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpenBooking(trainResult)}
              className="px-6 py-2.5 rounded-full bg-primary hover:bg-primary-container text-on-primary font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span>Book Now ({effectiveClass})</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
