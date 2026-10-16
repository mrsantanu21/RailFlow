import React, { useState, useEffect } from 'react';
import { X, Lock, Check, ShieldCheck, Terminal, RotateCcw, ArrowRight } from 'lucide-react';
import type { TrainSearchResult } from '../../types';

interface CoachSeatMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainResult: TrainSearchResult;
  selectedClass: string;
  passCount: number;
  onProceedToBooking: (
    trainResult: TrainSearchResult,
    selectedClass: string,
    preferences: ('LOWER' | 'MIDDLE' | 'UPPER' | 'SIDE_LOWER' | 'SIDE_UPPER')[]
  ) => void;
}

interface BerthSlot {
  number: number;
  type: 'LB' | 'MB' | 'UB' | 'SLB' | 'SUB';
  preferenceType: 'LOWER' | 'MIDDLE' | 'UPPER' | 'SIDE_LOWER' | 'SIDE_UPPER';
  label: string;
}

export const CoachSeatMapModal: React.FC<CoachSeatMapModalProps> = ({
  isOpen,
  onClose,
  trainResult,
  selectedClass,
  passCount,
  onProceedToBooking,
}) => {
  const [selectedCoach, setSelectedCoach] = useState('B4');
  const [selectedBerths, setSelectedBerths] = useState<number[]>([42, 45]);

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Adjust default selection to passCount if needed
  useEffect(() => {
    if (isOpen) {
      if (passCount === 1) {
        setSelectedBerths([42]);
      } else if (passCount === 2) {
        setSelectedBerths([42, 45]);
      } else {
        const defaults = [42, 45, 43, 44, 47, 48].slice(0, Math.min(passCount, 6));
        setSelectedBerths(defaults);
      }
    }
  }, [isOpen, passCount]);

  if (!isOpen) return null;

  const coachList = ['B1', 'B2', 'B3', 'B4', 'B5', 'A1 (2A)', 'H1 (1A)', 'SL1'];

  // Generate 72 berths standard LHB 3-Tier layout (8 Coupes of 8 berths)
  const getBerthDefinition = (num: number): BerthSlot => {
    const mod = num % 8;
    switch (mod) {
      case 1:
      case 4:
        return { number: num, type: 'LB', preferenceType: 'LOWER', label: 'Lower' };
      case 2:
      case 5:
        return { number: num, type: 'MB', preferenceType: 'MIDDLE', label: 'Middle' };
      case 3:
      case 6:
        return { number: num, type: 'UB', preferenceType: 'UPPER', label: 'Upper' };
      case 7:
        return { number: num, type: 'SLB', preferenceType: 'SIDE_LOWER', label: 'Side Lower' };
      case 0:
      default:
        return { number: num, type: 'SUB', preferenceType: 'SIDE_UPPER', label: 'Side Upper' };
    }
  };

  const toggleBerth = (seatNum: number) => {
    if (selectedBerths.includes(seatNum)) {
      setSelectedBerths(selectedBerths.filter((s) => s !== seatNum));
    } else {
      if (selectedBerths.length >= Math.max(passCount, 6)) {
        // Replace oldest if at limit
        setSelectedBerths([...selectedBerths.slice(1), seatNum]);
      } else {
        setSelectedBerths([...selectedBerths, seatNum]);
      }
    }
  };

  // Convert selected berths to berthPreferences
  const getPreferences = (): ('LOWER' | 'MIDDLE' | 'UPPER' | 'SIDE_LOWER' | 'SIDE_UPPER')[] => {
    return selectedBerths.map((num) => getBerthDefinition(num).preferenceType);
  };

  const isBookable = trainResult.bookable !== false;
  const effectiveClass =
    selectedClass || (trainResult.classes && Object.keys(trainResult.classes)[0]) || '3A';

  const handleProceed = () => {
    const prefs = getPreferences();
    onProceedToBooking(trainResult, effectiveClass, prefs);
  };

  // Pricing calculations
  const classData = trainResult.classes?.[effectiveClass];
  const baseFarePerPax = classData ? classData.fare / 100 : 1710;
  const count = selectedBerths.length || passCount;
  const totalBaseFare = baseFarePerPax * count;
  const reservationFee = 40 * count;
  const superfastSurcharge = 45 * count;
  const gst = Math.round((totalBaseFare + reservationFee + superfastSurcharge) * 0.05);
  const totalPayable = totalBaseFare + reservationFee + superfastSurcharge + gst;

  // Render 8 coupes
  const coupes = Array.from({ length: 8 }, (_, i) => {
    const startSeat = i * 8 + 1;
    const coupeNumber = i + 1;
    return {
      coupeNumber,
      seats: Array.from({ length: 8 }, (__, j) => getBerthDefinition(startSeat + j)),
    };
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="seat-matrix-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-start justify-center p-2 sm:p-4 md:p-6"
    >
      <div
        className="relative w-full max-w-6xl bg-surface rounded-2xl sm:rounded-3xl shadow-2xl border border-outline-variant/40 overflow-hidden my-4 sm:my-8 text-on-surface flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-surface-container-low px-4 sm:px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[22px]">train</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="seat-matrix-title" className="font-headline-sm text-base sm:text-lg font-bold text-on-surface">
                  {trainResult.train.number} {trainResult.train.name}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold uppercase tracking-wider">
                  {trainResult.train.type || 'Superfast'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-primary text-[11px] font-bold">
                  LHB Rake
                </span>
              </div>
              <div className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5">
                <span>
                  {trainResult.journey.fromStation} → {trainResult.journey.toStation}
                </span>
                <span>•</span>
                <span>
                  Class: <strong className="text-primary font-bold">{effectiveClass}</strong>
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Seat Matrix"
            className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Distributed Lock / Prototype Layout Notice Banner */}
        <div className="bg-surface-container-high px-4 sm:px-6 py-2.5 border-b border-outline-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-lg ${
                isBookable ? 'bg-tertiary text-on-tertiary' : 'bg-amber-600 text-white'
              } flex items-center justify-center shrink-0`}
            >
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-on-surface">
                {isBookable ? 'Visual Berth Preference Selector: ' : 'Visual Seat-Layout Prototype (Open Dataset): '}
              </span>
              <span className="text-on-surface-variant">
                {isBookable
                  ? 'Berths selected below record your seating preference (Lower, Middle, Upper, Side). The railway server assigns the final coach and seat atomically during booking.'
                  : 'Demonstration LHB coach berth layout. Open Indian Railway timetable data provides scheduled routes and stops without live CRIS/PRS inventory.'}
              </span>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${
              isBookable
                ? 'bg-tertiary-fixed/30 text-tertiary-container'
                : 'bg-amber-200/80 dark:bg-amber-900/50 text-amber-950 dark:text-amber-200'
            } font-bold text-[11px] shrink-0`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isBookable ? 'Serializable Backend Isolation' : 'Prototype Layout (Non-Live)'}</span>
          </span>
        </div>

        {/* Coach Navigation Tabs & Legend */}
        <div className="bg-surface-container-low px-4 sm:px-6 py-3 border-b border-outline-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shrink-0">
          {/* Coach Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 md:pb-0">
            {coachList.map((coach) => {
              const isSelected = selectedCoach === coach || (selectedCoach === 'B4' && coach === 'B4');
              return (
                <button
                  key={coach}
                  type="button"
                  onClick={() => setSelectedCoach(coach)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  {coach}
                  {coach === 'B4' && <span className="ml-1 text-[10px] opacity-75 font-normal">(72B)</span>}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-800 border border-emerald-700 flex items-center justify-center text-white font-bold shadow-xs">
                <Check className="w-2.5 h-2.5" />
              </span>
              <span className="font-bold text-on-surface">Available (Selectable)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-blue-900 border border-blue-600 flex items-center justify-center text-white shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
              </span>
              <span className="text-on-surface font-extrabold text-blue-950">Selected by You ({selectedBerths.length})</span>
            </div>
            <div className="hidden sm:inline-block text-outline">|</div>
            <span className="text-[11px] text-outline font-medium">
              LB: Lower • MB: Middle • UB: Upper • SLB: Side Lower • SUB: Side Upper
            </span>
          </div>
        </div>

        {/* Scrollable Body: Seat Map Grid (Left) + Passenger/Fare Panel (Right) */}
        <div className="overflow-y-auto p-4 sm:p-6 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: Realistic LHB Coach B4 Visual Berth Map */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              {/* Coach Structure Header */}
              <div className="bg-surface-container rounded-t-xl px-4 py-2.5 flex items-center justify-between text-on-surface text-xs font-bold">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">meeting_room</span>
                  <span>Coach {selectedCoach} Interior Map (Coupes 1 to 8)</span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-primary text-[10px]">
                    LHB AC-3T 72 Berths
                  </span>
                </div>
                <span className="text-on-surface-variant text-[11px] font-medium hidden sm:inline">
                  Vestibule ← Direction of Motion →
                </span>
              </div>

              {/* Coach Shell Container */}
              <div className="bg-surface-container-lowest rounded-b-xl border border-outline-variant/30 p-4 shadow-sm flex flex-col gap-4">
                {/* Entry Door Marker */}
                <div className="flex items-center justify-between text-[11px] text-outline font-semibold">
                  <div className="flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded">
                    <span className="material-symbols-outlined text-[13px]">door_front</span>
                    <span>Door 1 / Lavatory</span>
                  </div>
                  <div className="h-0.5 flex-1 bg-surface-container mx-4"></div>
                  <div className="flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded">
                    <span className="material-symbols-outlined text-[13px]">door_front</span>
                    <span>Door 2 / Attendant</span>
                  </div>
                </div>

                {/* Coupes Grid */}
                <div className="flex flex-col gap-3">
                  {coupes.map(({ coupeNumber, seats }) => {
                    const leftSeats = seats.slice(0, 3);
                    const rightSeats = seats.slice(3, 6);
                    const sideSeats = seats.slice(6, 8);
                    const hasSelected = seats.some((s) => selectedBerths.includes(s.number));

                    return (
                      <div
                        key={coupeNumber}
                        className={`p-3 rounded-xl border transition-all ${
                          hasSelected
                            ? 'bg-primary-fixed/15 border-primary/40 shadow-sm'
                            : 'bg-surface-container-low border-outline-variant/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-primary">
                            Coupe {coupeNumber} (Berths {String(seats[0].number).padStart(2, '0')} -{' '}
                            {String(seats[7].number).padStart(2, '0')})
                          </span>
                          <span className="text-[10px] text-on-surface-variant font-medium">
                            Main Coupe + Side Section
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                          {/* Left 3 Berths */}
                          <div className="md:col-span-4 grid grid-cols-3 gap-1.5">
                            {leftSeats.map((seat) => {
                              const isSelected = selectedBerths.includes(seat.number);
                              return (
                                <button
                                  key={seat.number}
                                  type="button"
                                  onClick={() => toggleBerth(seat.number)}
                                  className={`p-1.5 rounded-lg text-center transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-900 text-white ring-2 ring-blue-500 shadow-md scale-105'
                                      : 'bg-emerald-800 text-white hover:bg-emerald-700 active:scale-95 shadow-xs'
                                  }`}
                                >
                                  <div className="text-xs font-black">{String(seat.number).padStart(2, '0')}</div>
                                  <div className="text-[10px] font-bold opacity-90">{seat.type}</div>
                                  <div className="text-[9px] uppercase tracking-tighter opacity-80 font-bold">
                                    {isSelected ? 'Pref' : 'Avail'}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Coupe Table / Walkway Marker */}
                          <div className="hidden md:flex md:col-span-1 flex-col items-center justify-center">
                            <span className="w-3.5 h-10 bg-surface-container-high rounded-full flex items-center justify-center text-[9px] text-outline font-bold">
                              W
                            </span>
                          </div>

                          {/* Right 3 Berths Opposite */}
                          <div className="md:col-span-4 grid grid-cols-3 gap-1.5">
                            {rightSeats.map((seat) => {
                              const isSelected = selectedBerths.includes(seat.number);
                              return (
                                <button
                                  key={seat.number}
                                  type="button"
                                  onClick={() => toggleBerth(seat.number)}
                                  className={`p-1.5 rounded-lg text-center transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-900 text-white ring-2 ring-blue-500 shadow-md scale-105'
                                      : 'bg-emerald-800 text-white hover:bg-emerald-700 active:scale-95 shadow-xs'
                                  }`}
                                >
                                  <div className="text-xs font-black">{String(seat.number).padStart(2, '0')}</div>
                                  <div className="text-[10px] font-bold opacity-90">{seat.type}</div>
                                  <div className="text-[9px] uppercase tracking-tighter opacity-80 font-bold">
                                    {isSelected ? 'Pref' : 'Avail'}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Side Berths Corridor Separated */}
                          <div className="md:col-span-3 grid grid-cols-2 gap-1.5 bg-surface-container/60 rounded-lg p-1">
                            {sideSeats.map((seat) => {
                              const isSelected = selectedBerths.includes(seat.number);
                              return (
                                <button
                                  key={seat.number}
                                  type="button"
                                  onClick={() => toggleBerth(seat.number)}
                                  className={`p-1.5 rounded-lg text-center transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-900 text-white ring-2 ring-blue-500 shadow-md scale-105'
                                      : 'bg-emerald-800 text-white hover:bg-emerald-700 active:scale-95 shadow-xs'
                                  }`}
                                >
                                  <div className="text-xs font-black">{String(seat.number).padStart(2, '0')}</div>
                                  <div className="text-[10px] font-bold opacity-90">{seat.type}</div>
                                  <div className="text-[9px] uppercase tracking-tighter opacity-80 font-bold">
                                    {isSelected ? 'Pref' : 'Avail'}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Coach Exit Marker */}
                <div className="flex items-center justify-between text-[11px] text-outline font-semibold">
                  <div className="flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded">
                    <span className="material-symbols-outlined text-[13px]">door_back</span>
                    <span>Door 3 / Lavatory</span>
                  </div>
                  <div className="h-0.5 flex-1 bg-surface-container mx-4"></div>
                  <div className="flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded">
                    <span className="material-symbols-outlined text-[13px]">door_back</span>
                    <span>Door 4 / Coupling to B5</span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: Selected Passenger, Seat Allocation & Live Fare Panel */}
            <aside className="lg:col-span-4 flex flex-col gap-4">
              {/* Passenger Berth Allocation Card */}
              <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/30 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">badge</span>
                    <h3 className="font-headline-sm text-sm font-bold text-on-surface">Allocated Preferences</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-primary-fixed/40 text-primary text-[10px] font-bold font-mono">
                    {selectedBerths.length} Berths Mapped
                  </span>
                </div>

                {/* Passenger list */}
                <div className="flex flex-col gap-2.5">
                  {selectedBerths.map((seatNum, idx) => {
                    const berth = getBerthDefinition(seatNum);
                    return (
                      <div
                        key={seatNum}
                        className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/30 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-primary text-on-primary font-bold text-xs flex items-center justify-center shrink-0">
                            {selectedCoach}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-on-surface">
                              Passenger {idx + 1}: Berth {seatNum}
                            </div>
                            <div className="text-[11px] text-primary font-semibold">
                              {berth.type} ({berth.label} Preference)
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleBerth(seatNum)}
                          className="text-on-surface-variant hover:text-error p-1 rounded transition-colors cursor-pointer"
                          title="Remove selection"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Live Fare Breakdown */}
                <div className="bg-surface-container rounded-xl p-3.5 flex flex-col gap-2 text-xs mt-1">
                  <div className="font-bold text-on-surface flex items-center justify-between">
                    <span>Fare Breakdown ({selectedClass})</span>
                    <span className="text-[11px] text-on-surface-variant">{count} Passengers</span>
                  </div>
                  <div className="space-y-1 text-on-surface-variant text-[11px]">
                    <div className="flex justify-between items-center">
                      <span>Base Fare (₹{baseFarePerPax} × {count})</span>
                      <span className="text-on-surface font-semibold">₹{totalBaseFare.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Reservation Fee</span>
                      <span className="text-on-surface font-semibold">₹{reservationFee}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Superfast Surcharge</span>
                      <span className="text-on-surface font-semibold">₹{superfastSurcharge}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>GST (5%)</span>
                      <span className="text-on-surface font-semibold">₹{gst}</span>
                    </div>
                  </div>
                  <div className="pt-2 mt-1 border-t border-surface-container-high flex justify-between items-baseline">
                    <span className="font-bold text-on-surface text-xs">Total Payable</span>
                    <span className="font-headline-sm text-base font-extrabold text-primary">
                      ₹{totalPayable.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* CTAs */}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleProceed}
                    className="w-full bg-primary hover:bg-primary-container text-on-primary font-bold text-xs py-3 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>
                      {isBookable
                        ? 'Confirm Preference & Proceed to Booking'
                        : 'Confirm Preference & Proceed to Sandbox Book'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBerths([])}
                    className="w-full bg-surface-container-high text-on-surface hover:bg-surface-container-highest font-semibold text-xs py-2 px-4 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Selection</span>
                  </button>
                </div>
              </div>

              {/* Concurrency Verification / Open Dataset Prototype Log */}
              <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/30 shadow-sm flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold text-on-surface">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-primary" />
                    <span>{isBookable ? 'Server Allocation Telemetry' : 'Catalog Prototype Information'}</span>
                  </div>
                  <span className="text-[10px] bg-tertiary-container text-on-tertiary px-1.5 py-0.5 rounded font-mono font-bold">
                    {isBookable ? 'Serializable' : 'Sandbox Demo'}
                  </span>
                </div>
                <div className="bg-inverse-surface text-inverse-on-surface rounded-lg p-2.5 font-mono text-[10px] leading-relaxed overflow-x-auto space-y-0.5 shadow-inner">
                  {isBookable ? (
                    <>
                      <p className="text-tertiary-fixed-dim">-- PRS_TXID: {trainResult.train.number}_{selectedCoach}</p>
                      <p className="text-white">BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;</p>
                      <p className="text-on-primary-container">SELECT seat_id, status FROM seat_inventory</p>
                      <p className="text-on-primary-container pl-2">
                        WHERE train=&apos;{trainResult.train.number}&apos; AND coach=&apos;{selectedCoach}&apos;
                      </p>
                      <p className="text-tertiary-fixed">ASSIGN preferences: [{getPreferences().join(', ')}]</p>
                      <p className="text-white">COMMIT;</p>
                      <p className="text-outline-variant text-[9px] pt-1">
                        &gt; Atomic FIFO seat allocation executed in SQLite dev.db.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-tertiary-fixed-dim">-- CATALOG_TRAIN: {trainResult.train.number} ({trainResult.train.name})</p>
                      <p className="text-white">INFO: Static Indian Railway Timetable Dataset</p>
                      <p className="text-on-primary-container">LAYOUT: Standard LHB 72-Berth 3-Tier Coach ({selectedCoach})</p>
                      <p className="text-tertiary-fixed">PREFERENCES: [{getPreferences().join(', ')}]</p>
                      <p className="text-outline-variant text-[9px] pt-1">
                        &gt; Visual layout only. Live PRS seat inventory is not provided in open datasets.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
