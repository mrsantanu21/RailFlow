import React, { useState, useEffect } from 'react';
import {
  getTrainRunningStatus,
  getActiveTrackableTrains,
  getTrackingAudit,
  getTrainRouteGeometry,
} from '../api/endpoints';
import type {
  NormalizedRunningStatus,
  TrackableTrain,
  TrackingAudit,
  RailRadarRouteGeometry,
} from '../types';
import { RouteMap } from '../components/common/RouteMap';
import { StationLiveBoardModal } from '../components/common/StationLiveBoardModal';
import { ProvenanceBadge } from '../components/common/ProvenanceBadge';

export const LiveTrackingPage: React.FC = () => {
  const [activeTrains, setActiveTrains] = useState<TrackableTrain[]>([]);
  const [selectedTrainNumber, setSelectedTrainNumber] = useState<string>('22436');
  const [searchQuery, setSearchQuery] = useState<string>('22436');
  const [status, setStatus] = useState<NormalizedRunningStatus | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<RailRadarRouteGeometry | null>(null);
  const [routeLoading, setRouteLoading] = useState<boolean>(false);
  const [showMap, setShowMap] = useState<boolean>(true);
  const [audit, setAudit] = useState<TrackingAudit | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState<boolean>(false);
  const [liveBoardModalOpen, setLiveBoardModalOpen] = useState<boolean>(false);
  const [selectedStationForBoard, setSelectedStationForBoard] = useState<string>('NDLS');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchValidation, setSearchValidation] = useState<string | null>(null);

  // 1. Fetch available trackable trains & audit info on mount
  useEffect(() => {
    getActiveTrackableTrains()
      .then((trains) => {
        setActiveTrains(trains);
        if (trains.length > 0) {
          setSelectedTrainNumber((current) =>
            trains.some((t) => t.number === current) ? current : trains[0].number
          );
          setSearchQuery((current) =>
            trains.some((t) => t.number === current) ? current : trains[0].number
          );
        }
      })
      .catch((err) => console.warn('Failed to load active trains:', err));

    getTrackingAudit()
      .then(setAudit)
      .catch((err) => console.warn('Failed to load tracking audit:', err));
  }, []);

  // 2. Fetch running status & route geometry when selected train changes
  const fetchStatus = React.useCallback(async (trainNum: string) => {
    setLoading(true);
    setError(null);
    setSearchValidation(null);
    try {
      const data = await getTrainRunningStatus(trainNum);
      setStatus(data);
    } catch (err: any) {
      setError(err.message || `Unable to load running status for train ${trainNum}.`);
      setStatus(null);
    } finally {
      setLoading(false);
    }

    setRouteLoading(true);
    try {
      const geom = await getTrainRouteGeometry(trainNum);
      setRouteGeometry(geom);
    } catch (err) {
      console.warn('Failed to load route geometry:', err);
      setRouteGeometry(null);
    } finally {
      setRouteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTrainNumber) {
      fetchStatus(selectedTrainNumber);
    }
  }, [selectedTrainNumber, fetchStatus]);

  // Close audit modal on Escape
  useEffect(() => {
    if (!auditModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAuditModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [auditModalOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = searchQuery.trim();
    if (/^\d{4,5}$/.test(cleanNum)) {
      setSearchValidation(null);
      setSelectedTrainNumber(cleanNum);
    } else {
      setSearchValidation('Please enter a valid 4 or 5 digit Indian Railways train number (e.g. 12301, 22436).');
    }
  };

  return (
    <div className="flex flex-col w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-left">
      {/* ─── DATA INTEGRITY NOTICE BANNER ─────────────────────────────────── */}
      <div className="mb-6 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start sm:items-center gap-2.5">
          <span className="material-symbols-outlined text-primary text-[20px] shrink-0">verified</span>
          <div>
            <span className="font-bold text-on-surface">Genuine Railway Data Architecture:</span>{' '}
            <span className="text-on-surface-variant">
              RailFlow strictly reports verified CRIS timetable scheduled progression and live station block clearance.
              Coordinates and dynamic delays are never simulated or fabricated.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSelectedStationForBoard(status?.lastReportedStation?.code || 'NDLS');
              setLiveBoardModalOpen(true);
            }}
            className="px-3.5 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] transition-colors shrink-0 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[15px]">departure_board</span>
            <span>Station Live Board</span>
          </button>
          <button
            type="button"
            onClick={() => setAuditModalOpen(true)}
            className="px-3.5 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-primary font-bold text-[11px] transition-colors shrink-0 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[15px]">policy</span>
            <span>Data Source Audit</span>
          </button>
        </div>
      </div>

      {/* ─── HEADER & TRAIN SELECTOR ───────────────────────────────────────── */}
      <section className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm border border-outline-variant/30 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-fixed/40 text-on-primary-fixed text-xs font-bold mb-2">
              <span className="w-2 h-2 rounded-full bg-status-confirmed animate-ping"></span>
              <span>Official Schedule & Route Progression</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-primary">
              Live Train Progression
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Select or search an Indian Railways express train to inspect scheduled block progression, station offsets, and platform stops.
            </p>
          </div>

          {/* Search by Train Number */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-48">
              <input
                type="text"
                placeholder="e.g. 22436, 12301"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                maxLength={5}
                className="w-full px-4 py-2.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 font-bold text-sm text-on-surface focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-primary text-on-primary font-bold text-xs rounded-2xl shadow-sm hover:bg-primary-container active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">search</span>
              <span>Track</span>
            </button>
          </form>
        </div>

        {/* Validation Warning */}
        {searchValidation && (
          <div className="mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0">warning</span>
            <span>{searchValidation}</span>
          </div>
        )}

        {/* Quick Select Train Pills */}
        <div className="flex flex-wrap gap-2 mt-6">
          {activeTrains.map((t) => (
            <button
              key={t.number}
              type="button"
              onClick={() => {
                setSelectedTrainNumber(t.number);
                setSearchQuery(t.number);
              }}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border flex items-center gap-2 ${
                selectedTrainNumber === t.number
                  ? 'bg-primary text-on-primary border-primary shadow-sm'
                  : 'bg-surface-container-low text-on-surface border-outline-variant/30 hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">train</span>
              <span>{t.number} {t.name}</span>
            </button>
          ))}
        </div>

        {/* ─── LIVE METRICS OVERVIEW & SKELETON LOADER ────────────────────────── */}
        {loading ? (
          <div className="mt-8 flex flex-col gap-6 animate-pulse">
            <div className="flex items-center gap-4 pb-4 border-b border-outline-variant/20">
              <div className="w-12 h-12 rounded-2xl bg-surface-container-high"></div>
              <div className="flex-1 space-y-2">
                <div className="h-6 w-64 bg-surface-container-high rounded-lg"></div>
                <div className="h-3.5 w-48 bg-surface-container-high/60 rounded"></div>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/20 space-y-2">
                  <div className="h-3 w-20 bg-surface-container-high rounded"></div>
                  <div className="h-5 w-32 bg-surface-container-high rounded"></div>
                  <div className="h-2.5 w-24 bg-surface-container-high/60 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="mt-6 p-6 rounded-3xl bg-surface-container-low border border-outline-variant/30 text-left">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-error-container/40 text-error shrink-0">
                <span className="material-symbols-outlined text-[24px]">
                  {error.toLowerCase().includes('rate limit') ? 'speed' : 'error'}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base text-on-surface">
                  {error.toLowerCase().includes('rate limit')
                    ? 'Tracking Rate-Limit Advisory'
                    : error.toLowerCase().includes('not found')
                    ? 'Train Not Found'
                    : 'Unable to Load Live Running Status'}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  {error.toLowerCase().includes('rate limit')
                    ? 'The railway tracking provider enforces a ₹0 free-tier burst limit of 10 requests/minute. RailFlow automatically triggers a 60-second in-memory cooldown to avoid account suspensions.'
                    : error}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchStatus(selectedTrainNumber)}
                    className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-sm hover:bg-primary-container active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                    <span>Retry Query</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStationForBoard('NDLS');
                      setLiveBoardModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-primary text-xs font-bold border border-outline-variant/30 transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">departure_board</span>
                    <span>Check Station Live Board</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : status ? (
          <>
            {/* Active Train Summary & Refresh Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-8 pb-4 border-b border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold font-display text-lg">
                  {status.trainNumber.slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-bold font-display text-on-surface">
                      {status.trainNumber} {status.trainName}
                    </h2>
                    {status.meta.source === 'RAILRADAR_HYBRID_LIVE' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>RailRadar Live Radar</span>
                      </span>
                    )}
                    {status.meta.source === 'UNOFFICIAL_CHUKCHUK_NTES' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 font-bold text-[11px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        <span>Unofficial NTES Feed (ChukChuk API)</span>
                      </span>
                    )}
                    {status.meta.source === 'RAPIDAPI_INDIAN_RAIL_LIVE' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold text-[11px]">
                        RapidAPI Live
                      </span>
                    )}
                    {status.meta.source === 'OFFICIAL_CRIS_TIMETABLE_MASTER' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                        CRIS Scheduled Timetable
                      </span>
                    )}
                    <ProvenanceBadge
                      source={status.meta.source}
                      freshnessSeconds={status.meta.freshnessSeconds}
                    />
                    {status.meta.quotaRemainingMonth !== undefined && (
                      <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface-variant font-mono text-[11px] font-semibold" title="Free Tier: 1,000 req/mo, 10 req/min">
                        ₹0 Quota: {status.meta.quotaRemainingMonth}/1000
                      </span>
                    )}
                    {status.meta.freshnessSeconds > 300 && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 font-bold text-[11px] flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">history</span>
                        <span>Cached ({Math.round(status.meta.freshnessSeconds / 60)}m ago)</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {status.meta.message || 'Displaying railway train progress.'}
                  </p>
                </div>
              </div>

              {/* Manual Refresh Button */}
              <button
                type="button"
                onClick={() => fetchStatus(status.trainNumber)}
                disabled={loading}
                className="px-4 py-2 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest text-primary font-bold text-xs transition-all flex items-center gap-2 self-start sm:self-center shrink-0 border border-outline-variant/30 active:scale-95"
              >
                <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
                  refresh
                </span>
                <span>Refresh Live Status</span>
              </button>
            </div>

            {/* Stale Data Warning when cached data > 5 minutes */}
            {status.meta.freshnessSeconds > 300 && (
              <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2.5 shadow-xs">
                <span className="material-symbols-outlined text-[20px] text-amber-600 dark:text-amber-400 shrink-0">history</span>
                <div>
                  <span className="font-bold">Stale Data Warning:</span>{' '}
                  <span>This status observation was recorded {Math.round(status.meta.freshnessSeconds / 60)} minutes ago. Upstream block occupancy may have progressed. Use the refresh button for an updated check.</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
            {/* 1. Operational Status */}
            <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/20">
              <div className="flex items-center justify-between text-on-surface-variant text-[11px] font-bold uppercase tracking-wider mb-1">
                <span>Operation Status</span>
                <span className="material-symbols-outlined text-primary text-[18px]">commute</span>
              </div>
              <div className="text-base sm:text-lg font-bold text-on-surface">
                {status.status === 'RUNNING' && <span className="text-status-confirmed">In Transit (Active Run)</span>}
                {status.status === 'NOT_STARTED' && <span className="text-on-surface-variant">Scheduled / Not Departed</span>}
                {status.status === 'COMPLETED' && <span className="text-primary">Terminus Arrived (Completed)</span>}
                {status.status === 'CANCELLED' && <span className="text-error">Cancelled</span>}
              </div>
              <div className="text-xs text-on-surface-variant mt-0.5 font-mono">
                Date: {status.operatingDate}
              </div>
            </div>

            {/* 2. Delay Telemetry */}
            <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/20">
              <div className="flex items-center justify-between text-on-surface-variant text-[11px] font-bold uppercase tracking-wider mb-1">
                <span>Delay Telemetry</span>
                <span className="material-symbols-outlined text-secondary text-[18px]">timer</span>
              </div>
              <div className="text-base sm:text-lg font-bold text-on-surface">
                {status.delayMinutes !== null ? (
                  status.delayMinutes === 0 ? (
                    <span className="text-status-confirmed">Right Time (0 min)</span>
                  ) : (
                    <span className="text-status-rac-tatkal">+{status.delayMinutes} mins delay</span>
                  )
                ) : (
                  <span className="text-on-surface-variant text-sm font-semibold">Not Reported (Live Feed Req.)</span>
                )}
                {status.meta.speedKmph != null && status.meta.speedKmph > 0 && (
                  <span className="text-xs font-mono font-bold text-primary ml-2">
                    • {Math.round(status.meta.speedKmph)} km/h
                  </span>
                )}
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">
                {status.delayMinutes !== null ? 'Reported by live gateway' : 'Operating on timetable clock'}
              </div>
            </div>

            {/* 3. Approaching / Next Station */}
            <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/20">
              <div className="flex items-center justify-between text-on-surface-variant text-[11px] font-bold uppercase tracking-wider mb-1">
                <span>Approaching Station</span>
                <span className="material-symbols-outlined text-primary text-[18px]">near_me</span>
              </div>
              <div className="text-base sm:text-lg font-bold text-primary truncate">
                {status.nextStation ? `${status.nextStation.name} (${status.nextStation.code})` : 'Terminus Reached'}
              </div>
              <div className="text-xs text-on-surface-variant mt-0.5">
                {status.nextStation ? (
                  <>
                    ETA {status.nextStation.scheduledArrival || 'Scheduled'}
                    {status.nextStation.platform ? ` • PF ${status.nextStation.platform}` : ''}
                  </>
                ) : (
                  'Journey Completed'
                )}
              </div>
            </div>

            {/* 4. Data Source Verification */}
            <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/20">
              <div className="flex items-center justify-between text-on-surface-variant text-[11px] font-bold uppercase tracking-wider mb-1">
                <span>Data Feed</span>
                <span className="material-symbols-outlined text-status-confirmed text-[18px]">verified</span>
              </div>
              <div className="text-sm font-bold text-on-surface truncate">
                {status.meta.providerName}
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">
                Freshness: {status.meta.freshnessSeconds}s ago
              </div>
            </div>
          </div>
          </>
        ) : null}
      </section>

      {/* ─── DUAL COLUMN: ROUTE STEPPER & GPS TELEMETRY STATUS ──────────────── */}
      {status && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Station Timetable & Route Progress (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Interactive Leaflet Route Map */}
            <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">map</span>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold font-display text-primary">
                      Track Route Geometry & Station Alignment
                    </h3>
                    <p className="text-[11px] text-on-surface-variant">
                      Real-world IR railway corridor track coordinates via Leaflet & OpenStreetMap
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-bold text-xs hover:text-primary flex items-center gap-1 transition-colors"
                >
                  <span>{showMap ? 'Collapse Map' : 'Expand Map'}</span>
                  <span className="material-symbols-outlined text-[16px]">
                    {showMap ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </div>

              {showMap && (
                <RouteMap
                  geometry={routeGeometry}
                  currentStationCode={status.lastReportedStation?.code || status.stops.find((s) => s.status === 'CURRENT')?.stationCode}
                  currentStationName={status.lastReportedStation?.name || status.stops.find((s) => s.status === 'CURRENT')?.stationName}
                  segmentProgress={status.meta.segmentProgress}
                  speedKmph={status.meta.speedKmph}
                  loading={routeLoading}
                />
              )}
            </div>

            <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm border border-outline-variant/30 flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                    Sequential Route Progression
                  </span>
                  <h3 className="text-xl font-bold font-display text-primary">
                    {status.trainNumber} — {status.trainName}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1 rounded-full text-xs font-semibold text-on-surface-variant">
                  <span className="w-2 h-2 rounded-full bg-status-confirmed"></span>
                  <span>{status.stops.length} Sequence Stops</span>
                </div>
              </div>

              {/* Sequential Stops Timeline */}
              <div className="flex flex-col gap-3">
                {status.stops.map((stop, index) => {
                  const isOrigin = index === 0;
                  const isTerminus = index === status.stops.length - 1;

                  return (
                    <div
                      key={stop.stationCode}
                      className={`p-4 rounded-2xl border transition-all ${
                        stop.status === 'CURRENT'
                          ? 'bg-primary-fixed/20 border-primary ring-1 ring-primary'
                          : stop.status === 'PASSED'
                          ? 'bg-surface-container-lowest border-outline-variant/20 opacity-80'
                          : 'bg-surface-container-low border-outline-variant/20'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {/* Sequence circle indicator */}
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              stop.status === 'PASSED'
                                ? 'bg-primary text-on-primary'
                                : stop.status === 'CURRENT'
                                ? 'bg-secondary-container text-on-secondary-container ring-4 ring-secondary-container/20'
                                : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {stop.status === 'PASSED' ? (
                              <span className="material-symbols-outlined text-[16px]">check</span>
                            ) : (
                              stop.sequence
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-on-surface">{stop.stationName}</span>
                              <span className="px-2 py-0.5 rounded bg-surface-container-high font-mono text-xs font-bold text-primary">
                                {stop.stationCode}
                              </span>
                              {isOrigin && (
                                <span className="px-2 py-0.5 rounded bg-primary-fixed text-[10px] font-bold text-on-primary-fixed">
                                  Origin
                                </span>
                              )}
                              {isTerminus && (
                                <span className="px-2 py-0.5 rounded bg-secondary-fixed text-[10px] font-bold text-on-secondary-fixed">
                                  Terminus
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-on-surface-variant mt-0.5">
                              Distance: {stop.distanceKm} km from origin
                            </div>
                          </div>
                        </div>

                        {/* Timing and Platform & Station Board Action */}
                        <div className="flex items-center gap-3 text-xs font-medium self-end sm:self-center">
                          <div className="flex flex-col text-right">
                            <span className="text-on-surface-variant text-[10px] uppercase font-bold">Scheduled</span>
                            <span className="text-on-surface font-mono font-bold">
                              {stop.scheduledArrival ? `Arr ${stop.scheduledArrival}` : 'Departs Origin'}
                              {stop.scheduledDeparture && !isTerminus ? ` • Dep ${stop.scheduledDeparture}` : ''}
                            </span>
                          </div>

                          <div className="px-2.5 py-1 rounded-xl bg-surface-container-high text-on-surface font-bold text-xs shrink-0">
                            {stop.platform ? `PF ${stop.platform}` : 'PF —'}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStationForBoard(stop.stationCode);
                              setLiveBoardModalOpen(true);
                            }}
                            className="p-1 rounded-xl bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface-variant transition-colors flex items-center justify-center shrink-0"
                            title={`Inspect live departure board for ${stop.stationName} (${stop.stationCode})`}
                          >
                            <span className="material-symbols-outlined text-[16px]">departure_board</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: GPS & Telemetry Integrity Card (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            {/* GPS Telemetry Integrity Card */}
            <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold font-display text-primary">GPS & Hardware Telemetry</h3>
                <span className="material-symbols-outlined text-outline text-[20px]">satellite_alt</span>
              </div>

              {/* Coordinates status */}
              {status.coordinates !== null ? (
                <div className="p-4 rounded-2xl bg-surface-container-low border border-primary/20">
                  <div className="text-xs font-bold text-status-confirmed flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-status-confirmed"></span>
                    <span>Live Hardware Coordinates Verified</span>
                  </div>
                  <div className="mt-2 font-mono text-sm font-bold text-on-surface">
                    {status.coordinates.latitude.toFixed(4)}° N, {status.coordinates.longitude.toFixed(4)}° E
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30">
                  <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                    <span className="material-symbols-outlined text-secondary text-[18px]">location_disabled</span>
                    <span>No Public Raw GPS Stream</span>
                  </div>
                  <p className="mt-2 text-xs text-on-surface-variant leading-relaxed">
                    Indian Railways locomotive transponders (ISRO RTIS) report directly to the private Control Office Application (COA).
                    Raw latitude/longitude coordinates are not exposed to public or student API gateways. Station block clearances are reported instead.
                  </p>
                </div>
              )}

              {/* Limitations & Verification Notes */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-outline block mb-2">
                  System Transparency Disclosures
                </span>
                <ul className="space-y-2">
                  {status.meta.limitations.map((lim, i) => (
                    <li key={i} className="text-xs text-on-surface-variant flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">
                        check_circle
                      </span>
                      <span>{lim}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Last Verified Timestamp */}
              <div className="mt-2 pt-4 border-t border-outline-variant/20 flex items-center justify-between text-xs text-on-surface-variant font-medium">
                <span>Last Verified:</span>
                <span className="font-mono text-on-surface font-semibold">
                  {new Date(status.meta.observationTimestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* Quick Station Jump Card */}
            {status.lastReportedStation && (
              <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 shadow-sm border border-outline-variant/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary block mb-1">
                  Last Cleared Station Block
                </span>
                <div className="text-xl font-extrabold text-on-surface font-display">
                  {status.lastReportedStation.name} ({status.lastReportedStation.code})
                </div>
                <div className="text-xs text-on-surface-variant mt-1">
                  {status.lastReportedStation.platform
                    ? `Cleared Platform ${status.lastReportedStation.platform} • Departure logged`
                    : 'Station block cleared • Departure logged'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── DATA SOURCE AUDIT MODAL ────────────────────────────────────────── */}
      {auditModalOpen && audit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest rounded-3xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 shadow-2xl border border-outline-variant/30 text-left">
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant/20">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-[24px]">policy</span>
                <h2 className="text-xl font-bold font-display text-primary">
                  Indian Railways Data Source & Legal Feasibility Audit
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAuditModalOpen(false)}
                className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              {audit.disclaimer} Below is the technical and legal feasibility breakdown of candidate data sources.
            </p>

            <div className="space-y-4 mt-6">
              {audit.candidates.map((cand) => (
                <div
                  key={cand.id}
                  className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-sm text-on-surface">{cand.name}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        cand.statusInRailFlow === 'ACTIVE_TIMETABLE_ENGINE'
                          ? 'bg-status-confirmed/20 text-status-confirmed'
                          : cand.statusInRailFlow === 'ADAPTER_CONFIGURED_CHUKCHUK'
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold'
                          : cand.statusInRailFlow === 'ADAPTER_CONFIGURED_KEY_REQUIRED'
                          ? 'bg-secondary-fixed text-on-secondary-fixed'
                          : 'bg-outline-variant/30 text-on-surface-variant'
                      }`}
                    >
                      {cand.statusInRailFlow.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-on-surface-variant mt-1">
                    <div>
                      <strong>Official:</strong> {cand.isOfficial ? 'Yes (Govt/CRIS)' : 'Third-Party'}
                    </div>
                    <div>
                      <strong>Raw GPS:</strong> {cand.providesRawGpsCoordinates ? 'Yes' : 'Station-Block Only'}
                    </div>
                    <div>
                      <strong>Student Sandbox:</strong> {cand.studentSandboxAvailable ? 'Yes' : 'No'}
                    </div>
                    <div>
                      <strong>Lawful for College:</strong>{' '}
                      <span className={cand.lawfulUseForCollegeProject ? 'text-status-confirmed font-bold' : 'text-error font-bold'}>
                        {cand.lawfulUseForCollegeProject ? 'Yes' : 'Restricted'}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-on-surface-variant/90 leading-relaxed mt-1">
                    {cand.analysisNotes}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-outline-variant/20 flex justify-end">
              <button
                type="button"
                onClick={() => setAuditModalOpen(false)}
                className="px-6 py-2 rounded-full bg-primary text-on-primary font-bold text-xs"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STATION LIVE DEPARTURE BOARD MODAL ───────────────────────── */}
      <StationLiveBoardModal
        isOpen={liveBoardModalOpen}
        onClose={() => setLiveBoardModalOpen(false)}
        initialStationCode={selectedStationForBoard}
        onSelectTrain={(trainNo) => {
          setSelectedTrainNumber(trainNo);
          setSearchQuery(trainNo);
        }}
      />
    </div>
  );
};
