import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getBookingByPNR, cancelBooking, getMyBookings } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import type { Booking } from '../types';
import { ProvenanceBadge } from '../components/common/ProvenanceBadge';

interface PNRStatusPageProps {
  onRequireAuth?: () => void;
  defaultTab?: 'pnr' | 'trips';
}

export const PNRStatusPage: React.FC<PNRStatusPageProps> = ({ onRequireAuth, defaultTab = 'pnr' }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPnr = searchParams.get('pnr') || '';
  const initialTab = (searchParams.get('tab') as 'pnr' | 'trips') || defaultTab;

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'pnr' | 'trips'>(initialTab);
  const [pnrInput, setPnrInput] = useState(initialPnr);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  // My Trips state
  const [myTrips, setMyTrips] = useState<Booking[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);

  const getScheduledArrivalTime = (departureTime?: string, offsetMin?: number | null) => {
    if (!departureTime || offsetMin == null) return 'Scheduled';
    const parts = departureTime.split(':').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 'Scheduled';
    const totalMinutes = parts[0] * 60 + parts[1] + offsetMin;
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const dayOffset = Math.floor(totalMinutes / (24 * 60));
    const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return dayOffset > 0 ? `${formatted} (+${dayOffset}d)` : formatted;
  };

  const fetchPNR = React.useCallback(async (code: string) => {
    if (!code || code.trim().length < 6) {
      setError('Please enter a valid 10-digit PNR number.');
      return;
    }
    setLoading(true);
    setError(null);
    setCancelMessage(null);
    try {
      const data = await getBookingByPNR(code.trim().toUpperCase());
      setBooking(data);
      setSearchParams({ pnr: code.trim().toUpperCase() });
      setActiveTab('pnr');
    } catch (err: any) {
      setError(err.message || 'PNR record not found. Please verify the 10-digit number.');
      setBooking(null);
    } finally {
      setLoading(false);
    }
  }, [setSearchParams]);

  const fetchMyTrips = React.useCallback(async () => {
    if (!user) return;
    setLoadingTrips(true);
    setTripsError(null);
    try {
      const res = await getMyBookings(1, 50);
      setMyTrips(res.bookings);
    } catch (err: any) {
      setTripsError(err.message || 'Failed to load your trips.');
    } finally {
      setLoadingTrips(false);
    }
  }, [user]);

  useEffect(() => {
    if (initialPnr) {
      fetchPNR(initialPnr);
    }
  }, [initialPnr, fetchPNR]);

  useEffect(() => {
    if (activeTab === 'trips' && user) {
      fetchMyTrips();
    }
  }, [activeTab, user, fetchMyTrips]);

  // Close cancel modal on Escape key press
  useEffect(() => {
    if (!cancelModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCancelModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelModalOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPNR(pnrInput);
  };

  const handleSelectTrip = (b: Booking) => {
    setBooking(b);
    setPnrInput(b.pnr);
    setActiveTab('pnr');
    setSearchParams({ pnr: b.pnr });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelBooking = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      const res = await cancelBooking(booking.id, 'Cancelled via Digital Ticket Console');
      setCancelMessage(
        `Sandbox booking cancelled successfully. Simulated refund of ₹${(
          res.cancellation.refundAmountPaise / 100
        ).toFixed(2)} (${100 - res.cancellation.deductionPercent}%) has been credited to your sandbox account (Demonstration Only).`
      );
      // Refresh booking
      const refreshed = await getBookingByPNR(booking.pnr);
      setBooking(refreshed);
      setCancelModalOpen(false);
      // Also update trips list if loaded
      if (user) fetchMyTrips();
    } catch (err: any) {
      setError(err.message || 'Cancellation failed');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 text-left">
      {/* ─── TAB NAVIGATION BAR ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6 no-print">
        <button
          type="button"
          onClick={() => setActiveTab('pnr')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'pnr'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">search</span>
          <span>PNR Search & Verification</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trips')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'trips'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">receipt_long</span>
          <span>My Trips & Reservations {myTrips.length > 0 && `(${myTrips.length})`}</span>
        </button>
      </div>

      {/* ─── PNR SEARCH BAR CONSOLE ─────────────────────────────────────────── */}
      {activeTab === 'pnr' && (
        <section className="w-full bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm border border-outline-variant/30 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-fixed/30 text-primary text-xs font-bold">
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>Verified RailFlow Sandbox Record</span>
                </div>
                <ProvenanceBadge provenance="RAILFLOW_DEMO" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-primary">
                PNR Status & Digital Boarding Pass
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
                Check chart preparation status, coach berth allocations, and digital boarding tickets for RailFlow bookings.
              </p>
              <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-on-surface-variant/80 font-medium">
                <span className="material-symbols-outlined text-outline text-[16px]">info</span>
                <span>Resolves local RailFlow reservations. External IRCTC PRS records are not connected.</span>
              </div>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <input
                type="text"
                required
                maxLength={12}
                placeholder="ENTER 10-DIGIT PNR"
                value={pnrInput}
                onChange={(e) => setPnrInput(e.target.value.toUpperCase())}
                className="px-4 py-3 h-12 rounded-2xl bg-surface-container-low border border-outline-variant/40 font-mono text-sm font-bold text-on-surface tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-56"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 h-12 rounded-2xl bg-primary text-on-primary font-bold text-sm shadow-md hover:bg-primary-container active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              >
                {loading ? (
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">search</span>
                )}
                <span>Verify</span>
              </button>
            </form>
          </div>

          {error && (
            <div className="mt-5 p-4 rounded-2xl bg-error-container/40 border border-error/30 text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {cancelMessage && (
            <div className="mt-5 p-4 rounded-2xl bg-tertiary-container/20 border border-tertiary/30 text-tertiary text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              <span>{cancelMessage}</span>
            </div>
          )}
        </section>
      )}

      {/* ─── MY TRIPS TAB VIEW ──────────────────────────────────────────────── */}
      {activeTab === 'trips' && (
        <section className="w-full mb-8">
          {!user ? (
            <div className="p-10 rounded-3xl bg-surface-container-lowest border border-outline-variant/30 text-center flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-primary-container/20 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px]">lock</span>
              </div>
              <h2 className="text-xl font-bold font-display text-on-surface">Sign In to View Your Trips</h2>
              <p className="text-xs text-on-surface-variant max-w-md">
                Sign in to your RailFlow passenger account to inspect all past and upcoming journey reservations, digital tickets, and cancellation records.
              </p>
              {onRequireAuth && (
                <button
                  type="button"
                  onClick={onRequireAuth}
                  className="mt-2 px-6 py-2.5 rounded-2xl bg-primary text-on-primary text-xs font-bold shadow-md hover:bg-primary-container transition-all"
                >
                  Sign In
                </button>
              )}
            </div>
          ) : loadingTrips ? (
            <div className="p-12 rounded-3xl bg-surface-container-low border border-outline-variant/30 text-center flex flex-col items-center justify-center gap-3">
              <span className="material-symbols-outlined text-[32px] text-primary animate-spin">
                progress_activity
              </span>
              <span className="text-xs font-bold text-on-surface">Loading your booked journeys...</span>
            </div>
          ) : tripsError ? (
            <div className="p-6 rounded-2xl bg-error-container/40 border border-error/30 text-error text-xs">
              {tripsError}
            </div>
          ) : myTrips.length === 0 ? (
            <div className="p-10 rounded-3xl bg-surface-container-lowest border border-outline-variant/30 text-center flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[36px] text-outline">confirmation_number</span>
              <h3 className="text-base font-bold text-on-surface">No bookings found yet</h3>
              <p className="text-xs text-on-surface-variant">
                You have not booked any train journeys with this account yet. Search trains to reserve your first ticket.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-xs font-bold text-on-surface-variant px-1">
                Found {myTrips.length} reservation{myTrips.length > 1 ? 's' : ''} for {user.name} ({user.email})
              </div>

              {myTrips.map((trip) => {
                const trainName = trip.trainRun?.schedule?.train?.name || 'Express Train';
                const trainNumber = trip.trainRun?.schedule?.train?.number || '—';
                const runDate = trip.trainRun?.runDate || '—';

                return (
                  <article
                    key={trip.id}
                    className="p-5 sm:p-6 rounded-3xl bg-surface-container-lowest border border-outline-variant/20 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-primary px-3 py-1 bg-primary/10 rounded-xl">
                          PNR {trip.pnr}
                        </span>
                        <span
                          className={`px-3 py-0.5 rounded-full text-[11px] font-bold ${
                            trip.status === 'CONFIRMED'
                              ? 'bg-status-confirmed/20 text-status-confirmed'
                              : trip.status === 'CANCELLED'
                              ? 'bg-status-cancelled/20 text-status-cancelled'
                              : 'bg-secondary-container/30 text-on-secondary-container'
                          }`}
                        >
                          {trip.status}
                        </span>
                        <span className="text-xs text-on-surface-variant font-medium">
                          {trip.classType.replace('_', ' ')} • {trip.passengers.length} Passenger{trip.passengers.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="text-sm font-bold text-on-surface flex items-center gap-2">
                        <span>{trainNumber} {trainName}</span>
                        <span className="text-xs text-on-surface-variant font-normal">
                          • Journey Date: {runDate}
                        </span>
                      </div>

                      <div className="text-xs text-on-surface-variant">
                        Fare Paid: <strong>₹{(trip.totalFarePaise / 100).toFixed(2)}</strong> • Payment: <span className="uppercase font-semibold">{trip.paymentStatus}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {trip.trainRun?.schedule?.train?.number && (
                        <Link
                          to={`/tracking?train=${trip.trainRun.schedule.train.number}`}
                          className="px-4 py-2.5 rounded-xl bg-surface-container-low text-primary hover:bg-surface-container text-xs font-bold border border-outline-variant/30 transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">radar</span>
                          <span>Track Live</span>
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectTrip(trip)}
                        className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs hover:bg-primary-container transition-all flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">receipt</span>
                        <span>View Boarding Pass</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ─── LIVE DIGITAL BOARDING PASS (When Booking is selected) ─────────── */}
      {booking && (
        <div className="flex flex-col gap-8 animate-fade-in">
          {/* Top Status Banner Strip */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-wrap items-center justify-between gap-4 no-print">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                Booking Status:
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                  booking.status === 'CONFIRMED'
                    ? 'bg-status-confirmed/20 text-status-confirmed'
                    : booking.status === 'CANCELLED'
                    ? 'bg-status-cancelled/20 text-status-cancelled'
                    : 'bg-secondary-container/20 text-on-secondary-container'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current"></span>
                <span>{booking.status}</span>
              </span>

              <span className="text-xs text-on-surface-variant">
                Payment: <strong className="uppercase">{booking.paymentStatus}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {booking.trainRun?.schedule?.train?.number && (
                <Link
                  to={`/tracking?train=${booking.trainRun.schedule.train.number}`}
                  className="px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold border border-primary/20 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">radar</span>
                  <span>Live Running Status</span>
                </Link>
              )}
              {booking.status === 'CONFIRMED' && (
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-error-container/40 text-error hover:bg-error-container text-xs font-bold border border-error/30 transition-colors"
                >
                  Cancel Ticket
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-surface-container-lowest text-on-surface hover:bg-surface-container text-xs font-bold border border-outline-variant/30 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                <span>Print Ticket</span>
              </button>
            </div>
          </div>

          {/* ─── SKEUOMORPHIC PERFORATED BOARDING PASS CONTAINER ──────────── */}
          <div className="relative bg-surface-container-lowest rounded-3xl shadow-xl border border-outline-variant/30 overflow-hidden text-left printable-ticket">
            {/* Academic Simulation Banner (Ensures no misrepresentation) */}
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2.5 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0">info</span>
                <span>
                  <strong>Academic Simulation Only:</strong> RailFlow project demo reservation slip. <strong>NOT</strong> an official Indian Railways / IRCTC ticket.
                </span>
              </div>
              <span className="font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 shrink-0">
                Simulated Pass
              </span>
            </div>

            {/* Cancelled Banner if applicable */}
            {booking.status === 'CANCELLED' && (
              <div className="bg-red-600 text-white px-6 py-2 text-center font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">cancel</span>
                <span>Ticket Cancelled / Void — Seat Allocation Released</span>
              </div>
            )}

            {/* Ambient Ticket Header Banner */}
            <div className="bg-primary p-6 sm:p-8 text-on-primary flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-on-primary">
                  <span className="material-symbols-outlined text-[28px]">train</span>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-primary-fixed/80">
                    RailFlow Simulated E-Reservation Slip
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold font-display leading-tight">
                    {booking.trainRun?.schedule?.train?.name || 'Express Superfast'}
                  </h2>
                  <div className="text-xs text-primary-fixed font-mono mt-0.5">
                    Train No. {booking.trainRun?.schedule?.train?.number || '—'} • Class:{' '}
                    {booking.classType.replace('_', ' ')} ({booking.quotaType})
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] uppercase font-bold tracking-widest text-primary-fixed/80">
                  Passenger Name Record
                </div>
                <div className="font-mono text-2xl sm:text-3xl font-extrabold tracking-widest text-secondary-container">
                  {booking.pnr}
                </div>
              </div>
            </div>

            {/* Ticket Journey Stepper */}
            {(() => {
              const originStation = booking.trainRun?.schedule?.route?.stations?.find(
                (s) => s.sequence === booking.fromRouteStationSeq
              ) || booking.trainRun?.schedule?.route?.stations?.[0];

              const destStation = booking.trainRun?.schedule?.route?.stations?.find(
                (s) => s.sequence === booking.toRouteStationSeq
              ) || booking.trainRun?.schedule?.route?.stations?.slice(-1)[0];

              const originDepartureTime = originStation?.departureOffsetMin != null
                ? getScheduledArrivalTime(booking.trainRun?.schedule?.departureTime, originStation.departureOffsetMin)
                : (booking.trainRun?.schedule?.departureTime || '—');

              const destArrivalTime = getScheduledArrivalTime(
                booking.trainRun?.schedule?.departureTime,
                destStation?.arrivalOffsetMin
              );

              return (
                <div className="p-6 sm:p-8 border-b border-dashed border-outline-variant/40">
                  <div className="grid grid-cols-12 items-center gap-4">
                    <div className="col-span-5 text-left">
                      <div className="text-[11px] font-bold text-outline uppercase tracking-wider">
                        Departure Station
                      </div>
                      <div className="font-display font-extrabold text-2xl sm:text-3xl text-primary mt-1">
                        {originDepartureTime}
                      </div>
                      <div className="font-bold text-sm sm:text-base text-on-surface mt-0.5">
                        {originStation?.station?.name || 'Origin Station'}
                      </div>
                      <div className="text-xs text-on-surface-variant">
                        Code: {originStation?.station?.code || '—'} • Platform TBA
                      </div>
                    </div>

                    <div className="col-span-2 flex flex-col items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-[28px]">arrow_forward</span>
                      <span className="text-[10px] font-bold text-outline uppercase tracking-wider mt-1">
                        {booking.trainRun?.runDate}
                      </span>
                    </div>

                    <div className="col-span-5 text-right">
                      <div className="text-[11px] font-bold text-outline uppercase tracking-wider">
                        Arrival Station
                      </div>
                      <div className="font-display font-extrabold text-2xl sm:text-3xl text-primary mt-1">
                        {destArrivalTime}
                      </div>
                      <div className="font-bold text-sm sm:text-base text-on-surface mt-0.5">
                        {destStation?.station?.name || 'Destination Station'}
                      </div>
                      <div className="text-xs text-on-surface-variant">
                        Code: {destStation?.station?.code || '—'} • Confirmed Destination
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Perforated Scalloped Cutout Visuals */}
            <div className="relative h-6 bg-surface-container-low flex items-center justify-between">
              <div className="w-6 h-6 rounded-full bg-surface -ml-3 border-r border-outline-variant/30"></div>
              <div className="w-full border-t-2 border-dashed border-outline-variant/40 mx-2"></div>
              <div className="w-6 h-6 rounded-full bg-surface -mr-3 border-l border-outline-variant/30"></div>
            </div>

            {/* Passenger & Seat Allocations Manifest */}
            <div className="p-6 sm:p-8">
              <div className="text-xs font-bold text-outline uppercase tracking-wider mb-4">
                Passenger Berth Allocations ({booking.passengers.length} Passenger{booking.passengers.length > 1 ? 's' : ''})
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {booking.passengers.map((p, i) => (
                  <div
                    key={p.id || i}
                    className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-1 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface truncate">
                        {p.passengerIndex}. {p.name}
                      </span>
                      <span className="text-[10px] text-on-surface-variant font-medium">
                        {p.age}y • {p.gender.charAt(0)}
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-outline uppercase block">Coach</span>
                        <span className="font-mono text-sm font-extrabold text-primary">
                          {p.allocation?.allocatedCoach || 'CNF'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-outline uppercase block">Seat / Berth</span>
                        <span className="font-mono text-sm font-extrabold text-primary">
                          #{p.allocation?.allocatedSeatNumber || 'Waitlist'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fare Breakdown & Barcode Footer */}
            <div className="p-6 sm:p-8 bg-surface-container-low/60 border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-6">
              <div>
                <div className="text-[10px] uppercase font-bold text-outline tracking-wider">
                  Total Fare Paid (All inclusive)
                </div>
                <div className="text-2xl font-extrabold font-display text-primary mt-0.5">
                  ₹{(booking.totalFarePaise / 100).toFixed(2)}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">
                  Simulated 5% GST Included • RailFlow Electronic Reservation Slip (Academic Demonstration)
                </div>
              </div>

              {/* Decorative SVG Barcode & QR Stamp */}
              <div className="flex items-center gap-4">
                {/* Simulated QR Code SVG */}
                <div className="w-16 h-16 bg-white p-1 rounded-xl shadow-xs border border-outline-variant/30 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-full h-full fill-on-surface">
                    <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm10 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2zm-2-2h2v2h-2v-2z" />
                  </svg>
                </div>

                {/* Simulated Linear Barcode */}
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <div className="flex items-center gap-0.5 h-10">
                    {[3, 1, 4, 1, 2, 5, 2, 1, 3, 2, 4, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2].map(
                      (w, idx) => (
                        <div
                          key={idx}
                          style={{ width: `${w}px` }}
                          className="h-full bg-on-surface/80 rounded-xs"
                        ></div>
                      )
                    )}
                  </div>
                  <span className="font-mono text-[9px] text-outline tracking-widest">
                    *{booking.pnr}*
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── CANCELLATION MODAL DIALOG ─────────────────────────────────────── */}
      {cancelModalOpen && booking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
        >
          <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-2xl border border-outline-variant/30 text-left relative">
            <div className="flex items-center gap-3 text-error mb-2">
              <span className="material-symbols-outlined text-[28px]">warning</span>
              <h3 id="cancel-modal-title" className="text-lg font-bold font-display text-on-surface">
                Cancel Sandbox Reservation
              </h3>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
              Are you sure you want to cancel sandbox booking for <strong>PNR {booking.pnr}</strong>? Your
              simulated seat reservations will be immediately released, and demonstration refund rules will be applied.
            </p>

            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 mb-6 text-xs flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Total Ticket Value:</span>
                <span className="font-bold text-on-surface">
                  ₹{(booking.totalFarePaise / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Cancellation Charge:</span>
                <span className="font-bold text-error">Standard Departure Tier</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-outline-variant/20">
                <span className="font-bold text-on-surface">Estimated Refund (Simulated):</span>
                <span className="font-extrabold text-status-confirmed">
                  ~₹{((booking.totalFarePaise * 0.9) / 100).toFixed(2)} (up to 90%)
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-container-highest transition-all"
              >
                Keep Ticket
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelBooking}
                className="flex-1 py-3 rounded-2xl bg-error text-on-error text-xs font-bold shadow-md hover:bg-error/90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {cancelling && (
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                )}
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
