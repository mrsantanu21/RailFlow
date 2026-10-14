import React, { useState, useEffect } from 'react';
import type { TrainSearchResult, PassengerInput, FareQuote } from '../../types';
import { getFareQuote, createBooking } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainResult: TrainSearchResult;
  selectedClass: string;
  onBookingSuccess: (pnr: string, bookingId: string) => void;
  onRequireAuth: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  trainResult,
  selectedClass,
  onBookingSuccess,
  onRequireAuth,
}) => {
  const { user } = useAuth();
  const [passengers, setPassengers] = useState<PassengerInput[]>([
    { name: '', age: 28, gender: 'MALE', berthPreference: 'LOWER' },
  ]);
  const [quotaType, setQuotaType] = useState('GENERAL');
  const [includeCatering, setIncludeCatering] = useState(false);
  const [fareQuote, setFareQuote] = useState<FareQuote | null>(null);
  const [loadingFare, setLoadingFare] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch live server fare quote whenever passenger count, class, or catering changes
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoadingFare(true);
    getFareQuote({
      scheduleId: trainResult.scheduleId,
      fromStationCode: trainResult.journey.fromStation,
      toStationCode: trainResult.journey.toStation,
      classType: selectedClass,
      passengers: passengers.length,
      includeCatering,
    })
      .then((fq) => {
        if (active) setFareQuote(fq);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingFare(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, trainResult, selectedClass, passengers.length, includeCatering]);

  const handleAddPassenger = () => {
    if (passengers.length >= 6) return;
    setPassengers([
      ...passengers,
      { name: '', age: 30, gender: 'MALE', berthPreference: 'LOWER' },
    ]);
  };

  const handleRemovePassenger = (idx: number) => {
    if (passengers.length <= 1) return;
    setPassengers(passengers.filter((_, i) => i !== idx));
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

  const handlePassengerChange = (idx: number, field: keyof PassengerInput, val: any) => {
    const updated = [...passengers];
    updated[idx] = { ...updated[idx], [field]: val };
    setPassengers(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }

    // Validate passenger names and disallow duplicates
    const seenNames = new Set<string>();
    for (const p of passengers) {
      const trimmed = p.name ? p.name.trim() : '';
      if (trimmed.length < 2) {
        setError('Please enter a valid name for each passenger (min 2 chars).');
        return;
      }
      const normalized = trimmed.toLowerCase();
      if (seenNames.has(normalized)) {
        setError(`Duplicate passenger name "${trimmed}". Each passenger must have a unique name.`);
        return;
      }
      seenNames.add(normalized);
    }

    setError(null);
    setSubmitting(true);

    try {
      const booking = await createBooking({
        trainRunId: trainResult.trainRunId,
        scheduleId: trainResult.scheduleId,
        fromStationCode: trainResult.journey.fromStation,
        toStationCode: trainResult.journey.toStation,
        classType: selectedClass,
        quotaType,
        includeCatering,
        passengers: passengers.map(p => ({ ...p, name: p.name.trim() })),
      });

      onBookingSuccess(booking.pnr, booking.id);
    } catch (err: any) {
      setError(err.message || 'Booking reservation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const isChairCar = selectedClass === 'CHAIR_CAR' || selectedClass === 'EXEC_CHAIR';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="w-full max-w-2xl bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-2xl border border-outline-variant/30 text-left my-8 relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant/20 shrink-0">
          <div>
            <div className="flex items-center gap-2" id="booking-modal-title">
              <span className="font-bold text-lg text-primary">{trainResult.train.number}</span>
              <span className="font-bold text-lg text-on-surface">{trainResult.train.name}</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {trainResult.journey.fromStationName} ({trainResult.journey.fromStation}) →{' '}
              {trainResult.journey.toStationName} ({trainResult.journey.toStation}) •{' '}
              Class: <span className="font-bold text-primary">{selectedClass}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close booking modal"
            className="p-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="overflow-y-auto py-4 flex-1 pr-1 flex flex-col gap-5">
          {/* Mandatory Demo Reservation Notice */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2.5 shadow-xs">
            <span className="material-symbols-outlined text-[20px] text-amber-600 dark:text-amber-400 shrink-0">info</span>
            <div className="leading-relaxed">
              <span className="font-bold">Demo Reservation — no official ticket is issued.</span>{' '}
              <span>Simulated booking in the RailFlow academic sandbox. No real IRCTC inventory is booked.</span>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-error-container/40 border border-error/30 text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Quota Selector */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
              Select Booking Quota
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['GENERAL', 'TATKAL', 'LADIES', 'SENIOR_CITIZEN'].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuotaType(q)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                    quotaType === q
                      ? 'bg-primary-container text-on-primary border-primary'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:bg-surface-container-high'
                  }`}
                >
                  {q.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Passenger List Form */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                Passenger Details ({passengers.length}/6)
              </label>
              {passengers.length < 6 && (
                <button
                  type="button"
                  onClick={handleAddPassenger}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  <span>Add Passenger</span>
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {passengers.map((p, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col sm:flex-row gap-3 items-start sm:items-center relative"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>

                  <div className="flex-1 w-full sm:w-auto">
                    <input
                      type="text"
                      required
                      placeholder="Passenger Full Name"
                      value={p.name}
                      onChange={(e) => handlePassengerChange(idx, 'name', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="w-20 shrink-0">
                    <input
                      type="number"
                      required
                      min={1}
                      max={120}
                      placeholder="Age"
                      value={p.age}
                      onChange={(e) => handlePassengerChange(idx, 'age', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="w-28 shrink-0">
                    <select
                      value={p.gender}
                      onChange={(e) => handlePassengerChange(idx, 'gender', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div className="w-32 shrink-0">
                    <select
                      value={p.berthPreference}
                      onChange={(e) => handlePassengerChange(idx, 'berthPreference', e.target.value)}
                      className="w-full px-2 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {isChairCar ? (
                        <>
                          <option value="WINDOW">Window</option>
                          <option value="AISLE">Aisle</option>
                        </>
                      ) : (
                        <>
                          <option value="LOWER">Lower</option>
                          <option value="MIDDLE">Middle</option>
                          <option value="UPPER">Upper</option>
                          <option value="SIDE_LOWER">Side Lower</option>
                          <option value="SIDE_UPPER">Side Upper</option>
                        </>
                      )}
                    </select>
                  </div>

                  {passengers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePassenger(idx)}
                      className="p-1 rounded text-on-surface-variant hover:text-error transition-colors"
                      title="Remove Passenger"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Optional Meal / Catering Section */}
          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">restaurant</span>
              </div>
              <div>
                <div className="text-xs font-bold text-on-surface">Standard Onboard Meals / Catering</div>
                <div className="text-[11px] text-on-surface-variant">
                  Optional hot meal & beverage service (+₹220 per passenger)
                </div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={includeCatering}
                onChange={(e) => setIncludeCatering(e.target.checked)}
                className="w-4 h-4 text-primary rounded border-outline-variant focus:ring-primary cursor-pointer"
              />
              <span className="ml-2 text-xs font-bold text-on-surface">
                {includeCatering ? 'Added (+₹220)' : 'Opt Out (₹0)'}
              </span>
            </label>
          </div>

          {/* Fare Summary Breakdown */}
          {fareQuote && (
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                Fare Breakdown (Server Recalculated)
              </div>
              <div className="flex flex-col gap-1.5 text-xs text-on-surface-variant">
                <div className="flex justify-between">
                  <span>Base Fare ({fareQuote.distanceKm} km × {passengers.length} pax)</span>
                  <span className="font-semibold text-on-surface">
                    ₹{(fareQuote.perPassenger.baseFarePaise * passengers.length / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Reservation & Superfast Surcharges</span>
                  <span className="font-semibold text-on-surface">
                    ₹{((fareQuote.perPassenger.reservationChargePaise + fareQuote.perPassenger.superfastChargePaise) * passengers.length / 100).toFixed(2)}
                  </span>
                </div>
                {fareQuote.perPassenger.cateringChargePaise > 0 && (
                  <div className="flex justify-between">
                    <span>Catering & Food Charges</span>
                    <span className="font-semibold text-on-surface">
                      ₹{(fareQuote.perPassenger.cateringChargePaise * passengers.length / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>GST (5%)</span>
                  <span className="font-semibold text-on-surface">
                    ₹{(fareQuote.total.gstPaise / 100).toFixed(2)}
                  </span>
                </div>
                <div className="border-t border-outline-variant/30 pt-2 flex justify-between font-bold text-sm text-primary">
                  <span>Total Payable Amount</span>
                  <span>₹{(fareQuote.total.totalPaise / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-outline-variant/20 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[11px] text-on-surface-variant uppercase tracking-wider">Estimated Total</div>
            <div className="font-bold text-xl text-primary">
              {loadingFare ? (
                <span className="text-sm font-normal text-on-surface-variant">Calculating...</span>
              ) : fareQuote ? (
                `₹${(fareQuote.total.totalPaise / 100).toFixed(2)}`
              ) : (
                '—'
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || loadingFare}
              className="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-md hover:bg-primary-container active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && (
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              )}
              <span>Reserve & Pay</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
