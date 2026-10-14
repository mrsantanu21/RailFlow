import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

interface NavbarProps {
  onOpenAuth?: () => void;
  onOpenAiAssistant?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, onOpenAiAssistant }) => {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Book Ticket', path: '/' },
    { name: 'Live Tracking', path: '/tracking' },
    { name: 'PNR & Trips', path: '/pnr' },
    { name: 'Admin Dashboard', path: '/admin' },
  ];

  const isHome = location.pathname === '/';

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors ${
        isHome
          ? 'bg-slate-950/40 backdrop-blur-md border-b border-white/10 text-white'
          : 'bg-surface-container-lowest/90 backdrop-blur-xl border-b border-outline-variant/20 shadow-xs'
      }`}
    >
      <div className="h-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand logo & title */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-md group-hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-[22px]">train</span>
          </div>
          <div className="flex flex-col">
            <span
              className={`font-display font-bold text-xl tracking-tight leading-none ${
                isHome ? 'text-white' : 'text-primary'
              }`}
            >
              RailFlow
            </span>
            <span
              className={`text-[9px] uppercase font-bold tracking-widest mt-0.5 ${
                isHome ? 'text-slate-300' : 'text-on-surface-variant/70'
              }`}
            >
              RAILWAY EXPLORER PLATFORM
            </span>
          </div>
        </Link>

        {/* Center Pill Navigation */}
        <nav
          className={`hidden lg:flex items-center gap-1 ${
            isHome
              ? ''
              : 'bg-surface-container-low border border-outline-variant/30 p-1 rounded-full'
          }`}
        >
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : isHome
                    ? 'text-white/80 hover:text-white hover:bg-white/10'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Right Action Cluster */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* AI Assistant Button (Gold/Amber accent matching mockup) */}
          <button
            type="button"
            onClick={onOpenAiAssistant}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 text-xs font-bold rounded-full shadow-[0_2px_10px_rgba(251,191,36,0.3)] active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            title="Open RailFlow AI Journey Assistant"
            aria-label="Open RailFlow AI Journey Assistant"
          >
            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
            <span>AI Assistant</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className={`p-2 rounded-full transition-colors ${
              isHome
                ? 'text-white/80 hover:text-white hover:bg-white/10'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* User profile / Login button */}
          {user ? (
            <div className="flex items-center gap-2 pl-1">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center text-xs ring-2 ring-blue-500/30">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span
                  className={`text-xs font-bold leading-tight truncate max-w-[100px] ${
                    isHome ? 'text-white' : 'text-on-surface'
                  }`}
                >
                  {user.name}
                </span>
                <span
                  className={`text-[10px] uppercase font-semibold ${
                    isHome ? 'text-slate-300' : 'text-on-surface-variant'
                  }`}
                >
                  {user.role}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Logout"
                className={`p-1 rounded transition-colors ${
                  isHome ? 'text-slate-300 hover:text-error' : 'text-on-surface-variant hover:text-error'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-full shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">person</span>
              <span>Sign In</span>
            </button>
          )}

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`lg:hidden p-2 rounded-lg ${
              isHome
                ? 'text-slate-200 hover:bg-white/10'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className={`lg:hidden px-4 pt-2 pb-4 border-b flex flex-col gap-2 ${
            isHome
              ? 'bg-slate-950/95 border-white/10 text-white'
              : 'bg-surface-container-lowest border-outline-variant/30'
          }`}
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                location.pathname === link.path
                  ? 'bg-primary text-on-primary'
                  : isHome
                  ? 'text-slate-200 hover:bg-white/10'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              {link.name}
            </Link>
          ))}

          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenAiAssistant?.();
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 mt-1 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            <span>RailFlow AI Assistant</span>
          </button>
        </div>
      )}
    </header>
  );
};
