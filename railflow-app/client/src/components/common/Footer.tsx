import React from 'react';
import { SocialConnectBanner } from './SocialConnectBanner';
import { socialLinks } from '../../constants/socialLinks';

export { socialLinks };

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-surface-container-high border-t border-outline-variant/30 mt-auto transition-colors">
      {/* Shared Content Container: Assurances & Social Connect Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10 space-y-8">
        {/* Assurances */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-4 p-5 sm:p-6 rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 hover:border-outline-variant/50 transition-all h-full">
            <div className="w-12 h-12 rounded-xl bg-primary-fixed text-primary flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[26px]">price_check</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-on-surface text-base tracking-tight">Zero Convenience Surcharges</h4>
              <p className="text-xs sm:text-[13px] text-on-surface-variant mt-1.5 leading-relaxed">
                Transparent, breakdown-verified fare quotes matching Indian Railways standards.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-5 sm:p-6 rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 hover:border-outline-variant/50 transition-all h-full">
            <div className="w-12 h-12 rounded-xl bg-secondary-fixed text-secondary flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[26px]">currency_rupee</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-on-surface text-base tracking-tight">Instant Refund Processing</h4>
              <p className="text-xs sm:text-[13px] text-on-surface-variant mt-1.5 leading-relaxed">
                Automated rules calculate time-based deductions and instant wallet credit.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-5 sm:p-6 rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 hover:border-outline-variant/50 transition-all h-full">
            <div className="w-12 h-12 rounded-xl bg-tertiary-container/20 text-tertiary flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[26px]">radar</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-on-surface text-base tracking-tight">Schedule & Running Status</h4>
              <p className="text-xs sm:text-[13px] text-on-surface-variant mt-1.5 leading-relaxed">
                Station progression engine with upstream NTES fallback. No raw GPS coordinates fabricated.
              </p>
            </div>
          </div>
        </div>

        {/* Social Media Connection Banner */}
        <SocialConnectBanner />
      </div>

      {/* Footer Bottom Bar */}
      <div className="border-t border-outline-variant/20 py-6 px-4 text-center text-xs text-on-surface-variant">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-status-confirmed shrink-0 animate-pulse" aria-hidden="true"></span>
            <span className="font-medium text-on-surface text-xs sm:text-[13px] leading-normal">
              Railway Reservation System
            </span>
          </div>
          <p className="shrink-0 text-center sm:text-right text-xs text-on-surface-variant/90 font-medium">
            © {new Date().getFullYear()} RailFlow Platform. B.Tech Computer Science Project.
          </p>
        </div>
      </div>
    </footer>
  );
};
