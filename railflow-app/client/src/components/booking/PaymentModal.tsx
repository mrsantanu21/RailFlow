import React, { useState, useEffect } from 'react';
import { createPayment, simulatePaymentResult, getBookingById } from '../../api/endpoints';
import type { Booking } from '../../types';
import { ProvenanceBadge } from '../common/ProvenanceBadge';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  pnr: string;
  onPaymentSuccess: (pnr: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  bookingId,
  pnr,
  onPaymentSuccess,
}) => {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [method, setMethod] = useState<'UPI' | 'NET_BANKING' | 'CREDIT_CARD'>('UPI');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !bookingId) return;
    getBookingById(bookingId)
      .then((b) => setBooking(b))
      .catch((err) => setError(err.message));
  }, [isOpen, bookingId]);

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

  const handleSimulatePayment = async (outcome: 'SUCCESS' | 'FAILED') => {
    setError(null);
    setProcessing(true);
    try {
      // Step 1: Create transaction intent
      const tx = await createPayment({ bookingId, method });

      // Step 2: Simulate payment gateway callback
      await simulatePaymentResult(tx.id, outcome);

      if (outcome === 'SUCCESS') {
        onPaymentSuccess(pnr);
      } else {
        setError('Simulated payment was failed by bank gateway. Seats have been unlocked.');
      }
    } catch (err: any) {
      setError(err.message || 'Payment processing error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <div className="w-full max-w-lg bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-2xl border border-outline-variant/30 text-left relative">
        <button
          onClick={onClose}
          aria-label="Close payment modal"
          className="absolute top-5 right-5 p-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">payments</span>
          </div>
          <div>
            <h3 id="payment-modal-title" className="text-lg font-bold font-display text-on-surface">
              Simulated Payment Gateway
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Academic Sandbox Environment
              </span>
              <ProvenanceBadge provenance="RAILFLOW_DEMO" />
            </div>
          </div>
        </div>

        {/* Mandatory Explicit Simulation Notice */}
        <div className="my-3 p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-sky-900 dark:text-sky-200 text-xs flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-sky-600 dark:text-sky-400 shrink-0">check_circle</span>
          <div className="leading-relaxed">
            <span className="font-bold">Simulated Payment — ₹0 charged.</span>{' '}
            <span>This transaction is purely educational; no real payment gateway is contacted and no monetary charge occurs.</span>
          </div>
        </div>

        {/* PNR & Fare Banner */}
        <div className="my-4 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wider block">PNR Number</span>
            <span className="font-mono font-bold text-lg text-primary">{pnr}</span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wider block">Total Payable</span>
            <span className="font-bold text-xl text-primary">
              {booking ? `₹${(booking.totalFarePaise / 100).toFixed(2)}` : '...'}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-error-container/40 border border-error/30 text-error text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Payment Method Selector */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
            Choose Payment Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'UPI', label: 'UPI / QR', icon: 'qr_code_2' },
              { id: 'NET_BANKING', label: 'NetBanking', icon: 'account_balance' },
              { id: 'CREDIT_CARD', label: 'Card / Debit', icon: 'credit_card' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id as any)}
                className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all ${
                  method === m.id
                    ? 'bg-primary-container text-on-primary border-primary shadow-sm'
                    : 'bg-surface-container-low text-on-surface border-outline-variant/30 hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">{m.icon}</span>
                <span className="text-xs font-bold">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Simulation Actions */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => handleSimulatePayment('SUCCESS')}
            disabled={processing}
            className="w-full py-3.5 rounded-xl bg-status-confirmed text-white font-bold text-sm shadow-md hover:brightness-105 active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {processing && (
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            )}
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span>Simulate Successful Payment</span>
          </button>

          <button
            type="button"
            onClick={() => handleSimulatePayment('FAILED')}
            disabled={processing}
            className="w-full py-2.5 rounded-xl bg-surface-container-high text-error font-semibold text-xs hover:bg-error-container hover:text-on-error-container transition-all"
          >
            Simulate Payment Failure (Verify Seat Release)
          </button>
        </div>
      </div>
    </div>
  );
};
