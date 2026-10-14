import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-surface-container-high border-t border-outline-variant/30 mt-auto transition-colors">
      {/* Assurances */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 h-full">
          <div className="p-3 rounded-xl bg-primary-fixed text-primary shrink-0">
            <span className="material-symbols-outlined text-[28px]">price_check</span>
          </div>
          <div>
            <h4 className="font-bold text-on-surface text-base">Zero Convenience Surcharges</h4>
            <p className="text-xs text-on-surface-variant mt-1">
              Transparent, breakdown-verified fare quotes matching Indian Railways standards.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5 rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 h-full">
          <div className="p-3 rounded-xl bg-secondary-fixed text-secondary shrink-0">
            <span className="material-symbols-outlined text-[28px]">currency_rupee</span>
          </div>
          <div>
            <h4 className="font-bold text-on-surface text-base">Instant Refund Processing</h4>
            <p className="text-xs text-on-surface-variant mt-1">
              Automated rules calculate time-based deductions and instant wallet credit.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5 rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 h-full">
          <div className="p-3 rounded-xl bg-tertiary-container/15 text-tertiary shrink-0">
            <span className="material-symbols-outlined text-[28px]">radar</span>
          </div>
          <div>
            <h4 className="font-bold text-on-surface text-base">Schedule & Running Status</h4>
            <p className="text-xs text-on-surface-variant mt-1">
              Station progression engine with upstream NTES fallback. No raw GPS coordinates fabricated.
            </p>
          </div>
        </div>
      </div>

      {/* Footer Bottom Bar */}
      <div className="border-t border-outline-variant/20 py-6 px-4 text-center text-xs text-on-surface-variant">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-confirmed shrink-0"></span>
            <span className="font-medium text-on-surface">Explore railway schedules and simulate reservations in the RailFlow academic sandbox. (Not affiliated with IRCTC)</span>
          </div>
          <p className="shrink-0 text-center sm:text-right">© {new Date().getFullYear()} RailFlow Platform. B.Tech Computer Science Project.</p>
        </div>
      </div>
    </footer>
  );
};
