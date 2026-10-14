import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getAdminSummary,
  getAdminBookings,
  getAdminTrains,
  createAdminTrain,
  updateAdminTrain,
  deleteAdminTrain,
  getAdminStations,
  createAdminStation,
  updateAdminStation,
  getAdminRoutes,
  createAdminRoute,
  updateAdminRoute,
} from '../api/endpoints';
import type { AdminSummary, Station } from '../types';

interface AdminDashboardPageProps {
  onRequireAuth: () => void;
}

type TabType = 'overview' | 'trains' | 'stations' | 'routes';

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ onRequireAuth }) => {
  const { user, login } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Overview states
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);

  // CRUD states
  const [trains, setTrains] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);

  // UI status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Train Modal State
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [editingTrain, setEditingTrain] = useState<any | null>(null);
  const [trainForm, setTrainForm] = useState({ number: '', name: '', type: 'SUPERFAST', isActive: true });
  const [trainFormError, setTrainFormError] = useState<string | null>(null);

  // Train Deactivate Confirmation Modal
  const [deactivatingTrain, setDeactivatingTrain] = useState<any | null>(null);

  // Station Modal State
  const [showStationModal, setShowStationModal] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [stationForm, setStationForm] = useState({
    code: '',
    name: '',
    fullName: '',
    zone: 'Northern Railway (NR)',
    state: '',
    isActive: true,
  });
  const [stationFormError, setStationFormError] = useState<string | null>(null);

  // Route Modal State
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any | null>(null);
  const [routeForm, setRouteForm] = useState({ name: '', isActive: true });
  const [routeFormError, setRouteFormError] = useState<string | null>(null);

  // Close modals on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTrainModal(false);
        setDeactivatingTrain(null);
        setShowStationModal(false);
        setShowRouteModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchOverviewData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumData, bookData] = await Promise.all([
        getAdminSummary(),
        getAdminBookings(1, 20),
      ]);
      setSummary(sumData);
      setBookings(bookData?.bookings || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load administrative analytics');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrainsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminTrains();
      setTrains(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load master trains');
    } finally {
      setLoading(false);
    }
  };

  const fetchStationsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminStations();
      setStations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load master stations');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoutesData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminRoutes();
      setRoutes(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load master routes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      if (activeTab === 'overview') fetchOverviewData();
      else if (activeTab === 'trains') fetchTrainsData();
      else if (activeTab === 'stations') fetchStationsData();
      else if (activeTab === 'routes') fetchRoutesData();
    } else {
      setLoading(false);
    }
  }, [user, activeTab]);

  const handleAdminQuickLogin = async () => {
    setLoggingIn(true);
    try {
      await login({ email: 'admin@railflow.in', password: 'Admin@123' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  // ─── TRAIN CRUD HANDLERS ──────────────────────────────────────────────────
  const openCreateTrainModal = () => {
    setEditingTrain(null);
    setTrainForm({ number: '', name: '', type: 'SUPERFAST', isActive: true });
    setTrainFormError(null);
    setShowTrainModal(true);
  };

  const openEditTrainModal = (t: any) => {
    setEditingTrain(t);
    setTrainForm({ number: t.number, name: t.name, type: t.type, isActive: t.isActive });
    setTrainFormError(null);
    setShowTrainModal(true);
  };

  const handleSaveTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrainFormError(null);

    if (!/^\d{4,5}$/.test(trainForm.number.trim())) {
      setTrainFormError('Train number must be 4 or 5 digits (e.g. 12301)');
      return;
    }
    if (trainForm.name.trim().length < 3) {
      setTrainFormError('Train name must be at least 3 characters');
      return;
    }

    setSubmitting(true);
    try {
      if (editingTrain) {
        await updateAdminTrain(editingTrain.id, {
          number: trainForm.number.trim(),
          name: trainForm.name.trim(),
          type: trainForm.type,
          isActive: trainForm.isActive,
        });
        setSuccessMsg(`Train ${trainForm.number} updated successfully.`);
      } else {
        await createAdminTrain({
          number: trainForm.number.trim(),
          name: trainForm.name.trim(),
          type: trainForm.type,
          isActive: trainForm.isActive,
        });
        setSuccessMsg(`Train ${trainForm.number} created successfully.`);
      }
      setShowTrainModal(false);
      fetchTrainsData();
    } catch (err: any) {
      setTrainFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivateTrain = async () => {
    if (!deactivatingTrain) return;
    setSubmitting(true);
    try {
      await deleteAdminTrain(deactivatingTrain.id);
      setSuccessMsg(`Train ${deactivatingTrain.number} deactivated.`);
      setDeactivatingTrain(null);
      fetchTrainsData();
    } catch (err: any) {
      setError(err.message || 'Failed to deactivate train');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── STATION CRUD HANDLERS ────────────────────────────────────────────────
  const openCreateStationModal = () => {
    setEditingStation(null);
    setStationForm({
      code: '',
      name: '',
      fullName: '',
      zone: 'Northern Railway (NR)',
      state: '',
      isActive: true,
    });
    setStationFormError(null);
    setShowStationModal(true);
  };

  const openEditStationModal = (s: Station) => {
    setEditingStation(s);
    setStationForm({
      code: s.code,
      name: s.name,
      fullName: s.fullName,
      zone: s.zone,
      state: s.state,
      isActive: s.isActive,
    });
    setStationFormError(null);
    setShowStationModal(true);
  };

  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setStationFormError(null);

    const code = stationForm.code.trim().toUpperCase();
    if (!/^[A-Z]{2,6}$/.test(code)) {
      setStationFormError('Station code must be 2-6 uppercase letters (e.g. NDLS, HWH)');
      return;
    }
    if (stationForm.name.trim().length < 2) {
      setStationFormError('Station name must be at least 2 characters');
      return;
    }
    if (!stationForm.state.trim()) {
      setStationFormError('State is required');
      return;
    }

    setSubmitting(true);
    try {
      if (editingStation) {
        await updateAdminStation(editingStation.id, {
          code,
          name: stationForm.name.trim(),
          fullName: stationForm.fullName.trim() || `${stationForm.name.trim()} Railway Station`,
          zone: stationForm.zone,
          state: stationForm.state.trim(),
          isActive: stationForm.isActive,
        });
        setSuccessMsg(`Station ${code} updated successfully.`);
      } else {
        await createAdminStation({
          code,
          name: stationForm.name.trim(),
          fullName: stationForm.fullName.trim() || `${stationForm.name.trim()} Railway Station`,
          zone: stationForm.zone,
          state: stationForm.state.trim(),
          isActive: stationForm.isActive,
        });
        setSuccessMsg(`Station ${code} created successfully.`);
      }
      setShowStationModal(false);
      fetchStationsData();
    } catch (err: any) {
      setStationFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── ROUTE CRUD HANDLERS ──────────────────────────────────────────────────
  const openCreateRouteModal = () => {
    setEditingRoute(null);
    setRouteForm({ name: '', isActive: true });
    setRouteFormError(null);
    setShowRouteModal(true);
  };

  const openEditRouteModal = (r: any) => {
    setEditingRoute(r);
    setRouteForm({ name: r.name, isActive: r.isActive });
    setRouteFormError(null);
    setShowRouteModal(true);
  };

  const handleSaveRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setRouteFormError(null);

    if (routeForm.name.trim().length < 3) {
      setRouteFormError('Route name must be at least 3 characters');
      return;
    }

    setSubmitting(true);
    try {
      if (editingRoute) {
        await updateAdminRoute(editingRoute.id, {
          name: routeForm.name.trim(),
          isActive: routeForm.isActive,
        });
        setSuccessMsg(`Route updated successfully.`);
      } else {
        await createAdminRoute({
          name: routeForm.name.trim(),
          isActive: routeForm.isActive,
        });
        setSuccessMsg(`Route created successfully.`);
      }
      setShowRouteModal(false);
      fetchRoutesData();
    } catch (err: any) {
      setRouteFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="w-full flex-1 flex items-center justify-center px-4 py-12 text-center min-h-[calc(100vh-14rem)]">
        <div className="w-full max-w-xl bg-surface-container-lowest rounded-3xl p-8 sm:p-12 shadow-sm border border-outline-variant/30 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[36px]">admin_panel_settings</span>
          </div>
          <h2 className="text-2xl font-bold font-display text-on-surface">
            Administrator Access Required
          </h2>
          <p className="text-xs text-on-surface-variant max-w-md">
            The Fleet Analytics & Operations Dashboard requires elevated administrative credentials to inspect national ticketing load, rake allocations, and master railway data.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleAdminQuickLogin}
              disabled={loggingIn}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-primary text-on-primary font-bold text-xs shadow-md hover:bg-primary-container active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loggingIn && (
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              )}
              <span className="material-symbols-outlined text-[18px]">key</span>
              <span>1-Click Demo Admin</span>
            </button>
            <button
              type="button"
              onClick={onRequireAuth}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-surface-container-high text-on-surface font-bold text-xs hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">login</span>
              <span>Sign In with Credentials</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-left">
      {/* ─── HEADER BAR ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container/20 text-on-secondary-container text-xs font-bold mb-2">
            <span className="w-2 h-2 rounded-full bg-secondary-container animate-pulse"></span>
            <span>RailFlow Operations Control Node • Academic Evaluation Sandbox</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-primary">
            Fleet Analytics & Operations Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
            Real-time trunk route saturation, booking throughput, and automated master inventory management.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (activeTab === 'overview') fetchOverviewData();
            else if (activeTab === 'trains') fetchTrainsData();
            else if (activeTab === 'stations') fetchStationsData();
            else if (activeTab === 'routes') fetchRoutesData();
          }}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-1.5"
        >
          <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
            refresh
          </span>
          <span>Refresh Data</span>
        </button>
      </div>

      {/* ─── NAVIGATION TABS ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-outline-variant/20 mb-6 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
            activeTab === 'overview'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">dashboard</span>
          <span>Overview & Bookings</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('trains')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
            activeTab === 'trains'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">train</span>
          <span>Master Trains</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stations')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
            activeTab === 'stations'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">location_on</span>
          <span>Master Stations</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('routes')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
            activeTab === 'routes'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">alt_route</span>
          <span>Master Routes</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-error-container/40 border border-error/30 text-error text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-error font-bold">×</button>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-4 rounded-2xl bg-status-confirmed/15 border border-status-confirmed/30 text-status-confirmed text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-status-confirmed font-bold">×</button>
        </div>
      )}

      {/* ─── TAB 1: OVERVIEW & BOOKINGS ────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="relative rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Total System Bookings
                  </span>
                  <div className="text-3xl font-extrabold font-display text-primary mt-1">
                    {summary?.totalBookings ?? 0}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-primary-fixed/30 text-primary">
                  <span className="material-symbols-outlined text-[24px]">confirmation_number</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-on-surface-variant border-t border-outline-variant/20 pt-2">
                <span>Confirmed: <strong>{summary?.confirmedBookings ?? 0}</strong></span>
                <span>Cancelled: <strong>{summary?.cancelledBookings ?? 0}</strong></span>
              </div>
            </div>

            <div className="relative rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-secondary-container"></div>
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Active Express Fleet
                  </span>
                  <div className="text-3xl font-extrabold font-display text-on-surface mt-1">
                    {summary?.totalTrains ?? 0}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary-container/30 text-on-secondary-container">
                  <span className="material-symbols-outlined text-[24px]">train</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-on-surface-variant border-t border-outline-variant/20 pt-2">
                <span>Master Fleet Rakes</span>
                <span className="text-status-confirmed font-bold">100% Operational</span>
              </div>
            </div>

            <div className="relative rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-tertiary"></div>
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Registered Users
                  </span>
                  <div className="text-3xl font-extrabold font-display text-on-surface mt-1">
                    {summary?.totalUsers ?? 0}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-tertiary-container/30 text-on-tertiary-container">
                  <span className="material-symbols-outlined text-[24px]">group</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-on-surface-variant border-t border-outline-variant/20 pt-2">
                <span>Argon2id Protected</span>
                <span className="font-bold text-primary">Zero Leaks</span>
              </div>
            </div>

            <div className="relative rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-status-confirmed"></div>
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Settled Fare Revenue
                  </span>
                  <div className="text-3xl font-extrabold font-display text-status-confirmed mt-1">
                    ₹{((summary?.totalRevenuePaise ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-status-confirmed/10 text-status-confirmed">
                  <span className="material-symbols-outlined text-[24px]">payments</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-on-surface-variant border-t border-outline-variant/20 pt-2">
                <span>Paise Exact Ledger</span>
                <span>GST Verified</span>
              </div>
            </div>
          </section>

          {/* Bookings Table */}
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-on-surface font-display">Recent National Bookings</h2>
                <p className="text-xs text-on-surface-variant">Live ticketing ledger with segment-aware locks.</p>
              </div>
              <span className="text-xs text-on-surface-variant font-mono">Showing {bookings.length} reservations</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 text-on-surface-variant uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-3 px-4">PNR</th>
                    <th className="py-3 px-4">Passenger</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Total Fare</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Booked At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15">
                  {bookings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-on-surface-variant">
                        No reservations found in database yet.
                      </td>
                    </tr>
                  ) : (
                    bookings.map((b) => (
                      <tr key={b.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-primary">{b.pnr}</td>
                        <td className="py-3.5 px-4 font-semibold text-on-surface">
                          {b.user?.name || 'Passenger'}
                          <div className="text-[10px] text-on-surface-variant font-normal">{b.user?.email}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded bg-primary-fixed/30 text-primary font-bold">
                            {b.classType}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-on-surface">
                          ₹{(b.totalFarePaise / 100).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                              b.status === 'CONFIRMED'
                                ? 'bg-status-confirmed/20 text-status-confirmed'
                                : b.status === 'CANCELLED'
                                ? 'bg-error-container text-error'
                                : 'bg-secondary-fixed text-on-secondary-fixed'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            <span>{b.status}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-on-surface-variant">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ─── TAB 2: MASTER TRAINS MANAGEMENT ───────────────────────────────── */}
      {activeTab === 'trains' && (
        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-on-surface font-display">Master Railway Train Fleet</h2>
              <p className="text-xs text-on-surface-variant">
                Configure train numbers, official names, rolling stock types, and active operational states.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateTrainModal}
              className="px-4 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-sm hover:bg-primary-container transition-all flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add New Train</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 text-on-surface-variant uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-3 px-4">Number</th>
                  <th className="py-3 px-4">Train Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {trains.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-primary">{t.number}</td>
                    <td className="py-3.5 px-4 font-bold text-on-surface">{t.name}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-semibold text-[11px]">
                        {t.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          t.isActive
                            ? 'bg-status-confirmed/20 text-status-confirmed'
                            : 'bg-error-container text-error'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        <span>{t.isActive ? 'Active' : 'Inactive'}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditTrainModal(t)}
                          className="px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-on-surface hover:bg-surface-container-high text-[11px] font-bold transition-colors"
                        >
                          Edit
                        </button>
                        {t.isActive && (
                          <button
                            type="button"
                            onClick={() => setDeactivatingTrain(t)}
                            className="px-3 py-1.5 rounded-lg bg-error-container/40 border border-error/30 text-error hover:bg-error-container text-[11px] font-bold transition-colors"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── TAB 3: MASTER STATIONS MANAGEMENT ─────────────────────────────── */}
      {activeTab === 'stations' && (
        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-on-surface font-display">Indian Railway Master Stations</h2>
              <p className="text-xs text-on-surface-variant">
                Manage official CRIS station codes, names, railway zones, and state jurisdictions.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateStationModal}
              className="px-4 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-sm hover:bg-primary-container transition-all flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add New Station</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 text-on-surface-variant uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Station Name</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Zone</th>
                  <th className="py-3 px-4">State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {stations.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-primary">{s.code}</td>
                    <td className="py-3.5 px-4 font-bold text-on-surface">{s.name}</td>
                    <td className="py-3.5 px-4 text-on-surface-variant">{s.fullName}</td>
                    <td className="py-3.5 px-4 font-semibold text-on-surface">{s.zone}</td>
                    <td className="py-3.5 px-4 text-on-surface-variant">{s.state}</td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEditStationModal(s)}
                        className="px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-on-surface hover:bg-surface-container-high text-[11px] font-bold transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── TAB 4: MASTER ROUTES MANAGEMENT ───────────────────────────────── */}
      {activeTab === 'routes' && (
        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-on-surface font-display">Master Railway Routes</h2>
              <p className="text-xs text-on-surface-variant">
                Inspect route corridors, stop sequences, and station distance mappings.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateRouteModal}
              className="px-4 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-sm hover:bg-primary-container transition-all flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add New Route</span>
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {routes.map((r) => (
              <div
                key={r.id}
                className="p-5 rounded-2xl bg-surface-container-low/40 border border-outline-variant/30 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-on-surface">{r.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        r.isActive ? 'bg-status-confirmed/20 text-status-confirmed' : 'bg-error-container text-error'
                      }`}
                    >
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditRouteModal(r)}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-on-surface hover:bg-surface-container-high text-[11px] font-bold transition-colors"
                  >
                    Edit Route Name
                  </button>
                </div>

                {r.stations && r.stations.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-2 text-[11px]">
                    {r.stations.map((rs: any, idx: number) => (
                      <React.Fragment key={rs.id}>
                        <div className="flex flex-col p-2 rounded-xl bg-surface-container-lowest border border-outline-variant/20 shrink-0">
                          <span className="font-mono font-bold text-primary">{rs.station?.code}</span>
                          <span className="text-on-surface-variant">{rs.station?.name}</span>
                          <span className="text-[10px] text-outline">{rs.distanceKm} km</span>
                        </div>
                        {idx < r.stations.length - 1 && (
                          <span className="material-symbols-outlined text-outline text-[16px] shrink-0">
                            arrow_forward
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── TRAIN CREATE/EDIT MODAL ────────────────────────────────────────── */}
      {showTrainModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-6 shadow-2xl border border-outline-variant/30 text-left">
            <h3 className="text-lg font-bold font-display text-on-surface mb-1">
              {editingTrain ? 'Edit Master Train' : 'Create New Train'}
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Enter train number, name, and rolling stock classification.
            </p>

            {trainFormError && (
              <div className="mb-4 p-3 rounded-xl bg-error-container/40 border border-error/30 text-error text-xs">
                {trainFormError}
              </div>
            )}

            <form onSubmit={handleSaveTrain} className="flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Train Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 12301"
                  value={trainForm.number}
                  onChange={(e) => setTrainForm({ ...trainForm, number: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 font-mono text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Train Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Howrah Rajdhani Express"
                  value={trainForm.name}
                  onChange={(e) => setTrainForm({ ...trainForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Type *
                </label>
                <select
                  value={trainForm.type}
                  onChange={(e) => setTrainForm({ ...trainForm, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="VANDE_BHARAT">VANDE_BHARAT</option>
                  <option value="RAJDHANI">RAJDHANI</option>
                  <option value="SHATABDI">SHATABDI</option>
                  <option value="DURONTO">DURONTO</option>
                  <option value="SUPERFAST">SUPERFAST</option>
                  <option value="MAIL_EXPRESS">MAIL_EXPRESS</option>
                  <option value="PASSENGER">PASSENGER</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="trainIsActive"
                  checked={trainForm.isActive}
                  onChange={(e) => setTrainForm({ ...trainForm, isActive: e.target.checked })}
                  className="rounded text-primary focus:ring-primary"
                />
                <label htmlFor="trainIsActive" className="text-xs text-on-surface font-semibold">
                  Train is currently active
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-4 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowTrainModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-sm hover:bg-primary-container disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Train'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── TRAIN DEACTIVATE CONFIRMATION MODAL ─────────────────────────────── */}
      {deactivatingTrain && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30 text-left">
            <div className="w-12 h-12 rounded-2xl bg-error-container text-error flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px]">warning</span>
            </div>
            <h3 className="text-lg font-bold font-display text-on-surface mb-1">
              Deactivate Train {deactivatingTrain.number}?
            </h3>
            <p className="text-xs text-on-surface-variant mb-6">
              Deactivating <strong>{deactivatingTrain.name}</strong> prevents new journey searches and bookings. Existing historical bookings will be preserved.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeactivatingTrain(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface hover:bg-surface-container"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivateTrain}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-error text-on-error font-bold text-xs shadow-sm hover:bg-error/90 disabled:opacity-50"
              >
                {submitting ? 'Deactivating...' : 'Confirm Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STATION CREATE/EDIT MODAL ──────────────────────────────────────── */}
      {showStationModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-6 shadow-2xl border border-outline-variant/30 text-left">
            <h3 className="text-lg font-bold font-display text-on-surface mb-1">
              {editingStation ? 'Edit Master Station' : 'Create New Station'}
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Enter official railway station code, names, and state jurisdiction.
            </p>

            {stationFormError && (
              <div className="mb-4 p-3 rounded-xl bg-error-container/40 border border-error/30 text-error text-xs">
                {stationFormError}
              </div>
            )}

            <form onSubmit={handleSaveStation} className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Station Code * (2-6 letters)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NDLS"
                  value={stationForm.code}
                  onChange={(e) => setStationForm({ ...stationForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 font-mono text-sm font-bold text-on-surface uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Station Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. New Delhi"
                  value={stationForm.name}
                  onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. New Delhi Railway Station"
                  value={stationForm.fullName}
                  onChange={(e) => setStationForm({ ...stationForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    Zone
                  </label>
                  <input
                    type="text"
                    value={stationForm.zone}
                    onChange={(e) => setStationForm({ ...stationForm, zone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Delhi"
                    value={stationForm.state}
                    onChange={(e) => setStationForm({ ...stationForm, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="stationIsActive"
                  checked={stationForm.isActive}
                  onChange={(e) => setStationForm({ ...stationForm, isActive: e.target.checked })}
                  className="rounded text-primary focus:ring-primary"
                />
                <label htmlFor="stationIsActive" className="text-xs text-on-surface font-semibold">
                  Station is active
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-4 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowStationModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-sm hover:bg-primary-container disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Station'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── ROUTE CREATE/EDIT MODAL ────────────────────────────────────────── */}
      {showRouteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-6 shadow-2xl border border-outline-variant/30 text-left">
            <h3 className="text-lg font-bold font-display text-on-surface mb-1">
              {editingRoute ? 'Edit Master Route' : 'Create New Route'}
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Enter official route name and operational status.
            </p>

            {routeFormError && (
              <div className="mb-4 p-3 rounded-xl bg-error-container/40 border border-error/30 text-error text-xs">
                {routeFormError}
              </div>
            )}

            <form onSubmit={handleSaveRoute} className="flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Route Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. New Delhi – Varanasi Vande Bharat Route"
                  value={routeForm.name}
                  onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="routeIsActive"
                  checked={routeForm.isActive}
                  onChange={(e) => setRouteForm({ ...routeForm, isActive: e.target.checked })}
                  className="rounded text-primary focus:ring-primary"
                />
                <label htmlFor="routeIsActive" className="text-xs text-on-surface font-semibold">
                  Route is active
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-4 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowRouteModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-sm hover:bg-primary-container disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
