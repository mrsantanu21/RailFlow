import React, { useState, useEffect } from 'react';
import {
  TrainTrack,
  ShieldAlert,
  Sparkles,
  X,
  CheckCircle2,
  Calendar,
  Users,
  Ticket,
  MapPin,
  ArrowRight,
  Info,
} from 'lucide-react';
import type { TrainSearchResult } from '../../types';

interface QuickSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainResult: TrainSearchResult;
  passCount: number;
  quota: string;
  distanceKm: number | null;
  ratePerKm: number;
  estimatedFare: number | null;
}

export const QuickSandboxModal: React.FC<QuickSandboxModalProps> = ({
  isOpen,
  onClose,
  trainResult,
  passCount,
  quota,
  distanceKm,
  ratePerKm,
  estimatedFare,
}) => {
  const [simulatedRef, setSimulatedRef] = useState<string | null>(null);

  // Close modal on Escape
  useEffect(() => {
    if (!isOpen) {
      setSimulatedRef(null);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSimulateBooking = () => {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    setSimulatedRef(`SANDBOX-EXP-${randomHex}`);
  };

  const isSuperfast = ratePerKm >= 2.5;
  const trainCategoryLabel = isSuperfast ? 'Rajdhani / Superfast' : 'Sleeper / Express';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sandbox-modal-title"
    >
      <div className="w-full max-w-xl bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-2xl border border-outline-variant/30 text-left my-8 relative flex flex-col">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sandbox reservation dialog"
          className="absolute right-5 top-5 p-2 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3 pb-4 border-b border-outline-variant/20 pr-8">
          <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-500 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-500 font-mono font-bold text-[11px]">
                SANDBOX SIMULATION
              </span>
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Static Catalog Entry
              </span>
            </div>
            <h2 id="sandbox-modal-title" className="text-lg font-bold text-on-surface mt-1">
              Quick Sandbox Booking
            </h2>
          </div>
        </div>

        {/* Academic Isolation Disclaimer Banner */}
        <div className="my-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-400">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-bold">Academic Prototype Isolation:</strong> This reservation runs strictly in local simulation sandbox mode. No real Indian Railways tickets are issued, no payment is processed, and it is not valid for transit.
          </div>
        </div>

        {simulatedRef ? (
          /* Confirmation Screen */
          <div className="flex flex-col items-center text-center py-4 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
              Simulation Completed
            </span>
            <h3 className="text-xl font-extrabold text-on-surface mt-1">
              Sandbox Demonstration Pass Generated
            </h3>
            <p className="text-xs text-on-surface-variant mt-1 max-w-md">
              A mock reservation token has been generated for academic review. Production booking APIs were not invoked.
            </p>

            {/* Simulated Pass Card */}
            <div className="w-full mt-5 p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-left font-mono">
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 text-xs">
                <span className="text-on-surface-variant">REFERENCE NUMBER</span>
                <span className="font-bold text-primary text-sm">{simulatedRef}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 py-3 text-xs border-b border-outline-variant/20">
                <div>
                  <span className="text-[10px] text-on-surface-variant block">TRAIN</span>
                  <span className="font-bold text-on-surface">{trainResult.train.number} {trainResult.train.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant block">CATEGORY</span>
                  <span className="font-bold text-on-surface">{trainCategoryLabel}</span>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant block">PASSENGERS</span>
                  <span className="font-bold text-on-surface">{passCount} Passenger{passCount > 1 ? 's' : ''} ({quota})</span>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant block">ESTIMATED FARE</span>
                  <span className="font-bold text-emerald-400">
                    {estimatedFare != null ? `₹${estimatedFare.toLocaleString('en-IN')}` : 'Unavailable'}
                  </span>
                </div>
              </div>
              <div className="pt-3 text-[10px] text-on-surface-variant flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Simulation Only — Not an official IRCTC PNR. Retain for academic demo only.</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-md hover:bg-primary-container transition-all cursor-pointer"
            >
              Close Sandbox Window
            </button>
          </div>
        ) : (
          /* Pre-confirmation Overview Screen */
          <div className="flex flex-col gap-4">
            {/* Train & Journey Summary */}
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrainTrack className="w-4 h-4 text-primary" />
                  <span className="font-mono font-bold text-sm text-primary">{trainResult.train.number}</span>
                  <span className="font-bold text-sm text-on-surface">{trainResult.train.name}</span>
                </div>
                <span className="text-[11px] font-semibold text-on-surface-variant capitalize">
                  {trainResult.train.type || 'Express'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-medium text-on-surface mt-2">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span>{trainResult.journey.fromStationName} ({trainResult.journey.fromStation})</span>
                <ArrowRight className="w-3.5 h-3.5 text-on-surface-variant" />
                <span>{trainResult.journey.toStationName} ({trainResult.journey.toStation})</span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant mt-2.5 pt-2 border-t border-outline-variant/15">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{trainResult.journey.runDate || 'Selected Date'}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{passCount} {passCount === 1 ? 'Passenger' : 'Passengers'}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Ticket className="w-3.5 h-3.5" />
                  <span>{quota} Quota</span>
                </span>
              </div>
            </div>

            {/* Estimated Fare Calculation Box */}
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  Estimated Sandbox Fare Breakdown
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                  Mock Calculation
                </span>
              </div>

              {distanceKm != null && distanceKm > 0 ? (
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Route Distance</span>
                    <span className="font-semibold text-on-surface">{distanceKm} km</span>
                  </div>
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Category Tariff Model</span>
                    <span className="font-semibold text-on-surface">
                      {trainCategoryLabel} (~₹{ratePerKm.toFixed(2)}/km)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Base Fare Per Passenger</span>
                    <span className="font-semibold text-on-surface">
                      ~₹{Math.round(distanceKm * ratePerKm).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 font-bold text-sm">
                    <span className="text-on-surface">Estimated Sandbox Total ({passCount} pax)</span>
                    <span className="text-emerald-400 text-base">
                      ~₹{(estimatedFare || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant/80 mt-1 italic">
                    * Estimated sandbox fare calculated based on mock rate per km. Not an official Indian Railways fare tariff.
                  </p>
                </div>
              ) : (
                <div className="mt-3 py-3 text-center text-xs text-on-surface-variant">
                  <p className="font-medium text-amber-400">Distance data unavailable for this static route.</p>
                  <p className="text-[11px] mt-1 text-on-surface-variant/80">
                    A precise sandbox fare estimate cannot be calculated without route distance data.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface hover:bg-surface-container text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSimulateBooking}
                disabled={distanceKm == null || distanceKm <= 0}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Confirm Sandbox Simulation</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
