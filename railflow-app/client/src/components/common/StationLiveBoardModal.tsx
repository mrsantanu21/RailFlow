import React, { useState, useEffect } from 'react';
import { getStationLiveBoard } from '../../api/endpoints';
import type { StationLiveBoardResponse } from '../../types';
import { ProvenanceBadge } from './ProvenanceBadge';

interface StationLiveBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStationCode?: string;
  onSelectTrain?: (trainNumber: string) => void;
}

export const StationLiveBoardModal: React.FC<StationLiveBoardModalProps> = ({
  isOpen,
  onClose,
  initialStationCode = 'NDLS',
  onSelectTrain,
}) => {
  const [stationCode, setStationCode] = useState(initialStationCode);
  const [queryCode, setQueryCode] = useState(initialStationCode);
  const [windowHours, setWindowHours] = useState(4);
  const [board, setBoard] = useState<StationLiveBoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = async (code: string, hours: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStationLiveBoard(code, hours);
      setBoard(data);
    } catch (err: any) {
      setError(err.message || `Unable to load live departure board for ${code}.`);
      setBoard(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && stationCode) {
      fetchBoard(stationCode, windowHours);
    }
  }, [isOpen, stationCode, windowHours]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryCode.trim().length >= 2) {
      setStationCode(queryCode.trim().toUpperCase());
    }
  };

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const popularStations = [
    { code: 'NDLS', name: 'New Delhi' },
    { code: 'HWH', name: 'Howrah' },
    { code: 'BSB', name: 'Varanasi' },
    { code: 'CNB', name: 'Kanpur' },
    { code: 'MMCT', name: 'Mumbai Central' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 text-left"
      role="dialog"
      aria-modal="true"
      aria-labelledby="station-board-title"
    >
      <div className="bg-surface-container-lowest rounded-3xl max-w-4xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl border border-outline-variant/30">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">departure_board</span>
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-primary">Station Live Departure Board</h2>
              <p className="text-xs text-on-surface-variant">
                Live boards come from RailRadar when configured. Static catalogs never invent platforms or delays.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Controls Bar */}
        <div className="p-4 sm:p-6 border-b border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest">
          {/* Station Input Form */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Station (e.g. NDLS)"
              value={queryCode}
              onChange={(e) => setQueryCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-32 sm:w-40 px-3.5 py-2 rounded-2xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-sm text-on-surface uppercase focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-on-primary font-bold text-xs rounded-2xl shadow-sm hover:bg-primary-container active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">search</span>
              <span>View</span>
            </button>
          </form>

          {/* Quick Station Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {popularStations.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => {
                  setQueryCode(s.code);
                  setStationCode(s.code);
                }}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all border ${
                  stationCode === s.code
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:bg-surface-container-high'
                }`}
              >
                {s.code}
              </button>
            ))}

            {/* Time Window Filter */}
            <select
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              aria-label="Time window in hours"
              className="ml-2 px-3 py-1 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-bold text-on-surface focus:outline-none"
            >
              <option value={2}>Next 2 Hours</option>
              <option value={4}>Next 4 Hours</option>
              <option value={8}>Next 8 Hours</option>
            </select>
          </div>
        </div>

        {/* Board Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex flex-col gap-3 animate-pulse py-4">
              <div className="h-4 w-48 bg-surface-container-high rounded mb-2"></div>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-surface-container-low rounded-xl flex items-center justify-between px-4 border border-outline-variant/10">
                  <div className="h-4 w-28 bg-surface-container-high rounded"></div>
                  <div className="h-4 w-36 bg-surface-container-high rounded"></div>
                  <div className="h-4 w-16 bg-surface-container-high rounded"></div>
                  <div className="h-4 w-12 bg-surface-container-high rounded"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-error-container/30 border border-error/20 text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">info</span>
              <span>{error}</span>
            </div>
          ) : board ? (
            <div className="flex flex-col gap-4">
              {/* Station Info Summary */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant/20 text-xs">
                <div>
                  <span className="font-bold text-base text-on-surface">
                    {board.station.name} ({board.station.code})
                  </span>
                  {board.station.city && (
                    <span className="text-on-surface-variant ml-2">• {board.station.city}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-on-surface-variant">
                  <span>{board.count} Movements in {board.windowHours}h window</span>
                  <ProvenanceBadge
                    source={board.meta.source}
                    label={board.meta.provenanceLabel}
                  />
                </div>
              </div>

              {board.trains.length === 0 ? (
                <div className="py-12 text-center text-xs text-on-surface-variant flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[32px] text-outline">departure_board</span>
                  <div className="font-bold text-sm text-on-surface">No train movements in the next {board.windowHours} hours</div>
                  <p className="max-w-md text-on-surface-variant/80">
                    No active express arrivals or departures were reported for {board.station.name} ({board.station.code}) in this time window.
                    Try checking a major terminal station:
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {['NDLS', 'HWH', 'BSB', 'CNB'].map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          setQueryCode(code);
                          setStationCode(code);
                        }}
                        className="px-3 py-1 rounded-xl bg-surface-container-high hover:bg-primary hover:text-on-primary text-xs font-bold font-mono transition-colors"
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-3">Train</th>
                        <th className="py-2.5 px-3">Route</th>
                        <th className="py-2.5 px-2">Scheduled</th>
                        <th className="py-2.5 px-2">Expected</th>
                        <th className="py-2.5 px-2">PF</th>
                        <th className="py-2.5 px-2">Delay</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {board.trains.map((t, idx) => (
                        <tr key={`${t.number}-${idx}`} className="hover:bg-surface-container-low transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold font-mono text-primary text-sm">{t.number}</div>
                            <div className="text-[11px] text-on-surface font-semibold truncate max-w-xs">{t.name}</div>
                          </td>
                          <td className="py-3 px-3 text-[11px] text-on-surface-variant">
                            <div>From: {t.source}</div>
                            <div>To: {t.destination}</div>
                          </td>
                          <td className="py-3 px-2 font-mono font-bold text-on-surface">
                            {t.scheduledDeparture || t.scheduledArrival || '--:--'}
                          </td>
                          <td className="py-3 px-2 font-mono font-bold text-on-surface">
                            {t.expectedDepartureTime
                              ? t.expectedDepartureTime.split('T')[1]?.slice(0, 5)
                              : t.expectedArrivalTime
                              ? t.expectedArrivalTime.split('T')[1]?.slice(0, 5)
                              : '--:--'}
                          </td>
                          <td className="py-3 px-2">
                            <span className="px-2 py-0.5 rounded-lg bg-surface-container-high font-bold font-mono text-xs">
                              {t.platform ? `PF ${t.platform}` : 'PF —'}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            {t.delayMinutes === null || t.delayMinutes === 0 ? (
                              <span className="text-status-confirmed font-bold">On Time</span>
                            ) : (
                              <span className="text-status-rac-tatkal font-bold font-mono">
                                +{t.delayMinutes}m
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {onSelectTrain && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectTrain(t.number);
                                  onClose();
                                }}
                                className="px-2.5 py-1 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-on-primary font-bold text-[11px] transition-all"
                              >
                                Track
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 bg-surface-container-low/50 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-on-surface-variant">
          <span>Official RailRadar Station Movement Feed • Respects 4-hour forecast window</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-primary font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
