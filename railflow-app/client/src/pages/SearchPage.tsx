import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import type { Station, TrainSearchResult } from '../types';
import { searchStations, searchTrains, lookupTrains } from '../api/endpoints';
import { BookingModal } from '../components/booking/BookingModal';
import { PaymentModal } from '../components/booking/PaymentModal';
import { ProvenanceBadge } from '../components/common/ProvenanceBadge';
import { DatePickerPopup } from '../components/booking/DatePickerPopup';

interface SearchPageProps {
  onRequireAuth: () => void;
  onNavigateToPNR: (pnr: string) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onRequireAuth, onNavigateToPNR }) => {
  // Search Form State
  const [searchMode, setSearchMode] = useState<'ROUTE' | 'TRAIN_NUMBER'>('ROUTE');
  const [trainQuery, setTrainQuery] = useState('');
  const [trainSuggestions, setTrainSuggestions] = useState<any[]>([]);
  const [showTrainDropdown, setShowTrainDropdown] = useState(false);

  const [fromCode, setFromCode] = useState('NDLS');
  const [toCode, setToCode] = useState('BSB');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [quota, setQuota] = useState('GENERAL');
  const [passCount, setPassCount] = useState(1);

  // Autocomplete suggestions
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromSuggestions, setFromSuggestions] = useState<Station[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Station[]>([]);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);

  // Selected Stations details
  const [fromStation, setFromStation] = useState<Station | null>(null);
  const [toStation, setToStation] = useState<Station | null>(null);

  // Train Results
  const [results, setResults] = useState<TrainSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Sorting & Filtering State
  const [sortBy, setSortBy] = useState<'DEPARTURE_ASC' | 'DEPARTURE_DESC' | 'DURATION_ASC' | 'FARE_ASC'>('DEPARTURE_ASC');
  const [filterTrainType, setFilterTrainType] = useState<string>('ALL');
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterTimeOfDay, setFilterTimeOfDay] = useState<string>('ALL');

  // Class selection per train: trainRunId -> selected class code
  const [selectedClasses, setSelectedClasses] = useState<Record<string, string>>({});
  // Expand route drawer per train: trainRunId -> boolean
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>({});

  // Modals state
  const [bookingModalTrain, setBookingModalTrain] = useState<TrainSearchResult | null>(null);
  const [bookingModalClass, setBookingModalClass] = useState<string>('');
  const [activePNR, setActivePNR] = useState<string | null>(null);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Click outside listener for station and train dropdowns
  const fromRef = React.useRef<HTMLDivElement>(null);
  const toRef = React.useRef<HTMLDivElement>(null);
  const trainRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fromRef.current && !fromRef.current.contains(e.target as Node)) {
        setShowFromDropdown(false);
      }
      if (toRef.current && !toRef.current.contains(e.target as Node)) {
        setShowToDropdown(false);
      }
      if (trainRef.current && !trainRef.current.contains(e.target as Node)) {
        setShowTrainDropdown(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFromDropdown(false);
        setShowToDropdown(false);
        setShowTrainDropdown(false);
        setShowDatePicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Initial station load
  useEffect(() => {
    searchStations('').then((stations) => {
      const ndls = stations.find((s) => s.code === 'NDLS') || stations[0];
      const bsb = stations.find((s) => s.code === 'BSB') || stations[1];
      if (ndls) {
        setFromStation(ndls);
        setFromCode(ndls.code);
      }
      if (bsb) {
        setToStation(bsb);
        setToCode(bsb.code);
      }
    });
  }, []);

  // Run search when from, to, date are set
  const executeSearch = React.useCallback(
    async (fCode = fromCode, tCode = toCode, d = date) => {
      if (!fCode || !tCode) return;
      if (fCode.trim().toUpperCase() === tCode.trim().toUpperCase()) {
        setError('Source and destination cannot be the same. Please choose two distinct railway stations.');
        setErrorCode('SAME_STATION');
        setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      setErrorCode(null);
      try {
        const trains = await searchTrains({
          fromStationCode: fCode.trim().toUpperCase(),
          toStationCode: tCode.trim().toUpperCase(),
          date: d,
          quota,
          passCount,
        });
        setResults(trains);

        // Default selected class for each train (first available class)
        const initialSelections: Record<string, string> = {};
        trains.forEach((t) => {
          const availableClasses = Object.keys(t.classes);
          if (availableClasses.length > 0) {
            initialSelections[t.trainRunId] = availableClasses[0];
          }
        });
        setSelectedClasses(initialSelections);
      } catch (err: any) {
        setError(err.message || 'Train search failed');
        setErrorCode(err.code || (err.status === 429 ? 'RATE_LIMIT' : null));
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [fromCode, toCode, date, quota, passCount]
  );

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const pFrom = searchParams.get('from');
    const pTo = searchParams.get('to');
    const pDate = searchParams.get('date');
    if (pFrom && pTo) {
      setFromCode(pFrom.toUpperCase());
      setToCode(pTo.toUpperCase());
      if (pDate) setDate(pDate);
      executeSearch(pFrom.toUpperCase(), pTo.toUpperCase(), pDate || date);
    }
  }, [searchParams, executeSearch, date]);

  useEffect(() => {
    if (fromCode && toCode) {
      executeSearch(fromCode, toCode, date);
    }
  }, [fromCode, toCode, date, executeSearch]);

  // Handle station typing with live API query
  const handleFromType = async (val: string) => {
    setFromQuery(val);
    setShowFromDropdown(true);
    const stations = await searchStations(val);
    setFromSuggestions(stations);
  };

  const handleToType = async (val: string) => {
    setToQuery(val);
    setShowToDropdown(true);
    const stations = await searchStations(val);
    setToSuggestions(stations);
  };

  const handleTrainType = async (val: string) => {
    setTrainQuery(val);
    if (val.trim().length >= 2) {
      setShowTrainDropdown(true);
      const trains = await lookupTrains(val.trim());
      setTrainSuggestions(trains);
    } else {
      setShowTrainDropdown(false);
      setTrainSuggestions([]);
    }
  };

  const handleSelectTrain = (train: any) => {
    const route = train.schedules?.[0]?.route;
    if (route && route.stations?.length >= 2) {
      const origin = route.stations[0].station;
      const terminus = route.stations[route.stations.length - 1].station;
      setFromStation(origin);
      setFromCode(origin.code);
      setToStation(terminus);
      setToCode(terminus.code);
      setSearchMode('ROUTE');
      setShowTrainDropdown(false);
      setTrainQuery('');
      executeSearch(origin.code, terminus.code, date);
    }
  };

  const handleSwapStations = () => {
    const tempCode = fromCode;
    const tempStation = fromStation;
    const tempQuery = fromQuery;
    setFromCode(toCode);
    setFromStation(toStation);
    setFromQuery(toQuery);
    setToCode(tempCode);
    setToStation(tempStation);
    setToQuery(tempQuery);
  };

  const handleQuickDate = (daysFromToday: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    const dateStr = d.toISOString().split('T')[0];
    setError(null);
    setDate(dateStr);
  };

  const handleSelectDate = (newDateStr: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (newDateStr < todayStr) {
      setError('Journey date cannot be in the past.');
      return;
    }
    setError(null);
    setDate(newDateStr);
  };

  const formatDateDisplayLong = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  const handleOpenBooking = (train: TrainSearchResult) => {
    if (train.bookable === false) return;
    const cls = selectedClasses[train.trainRunId] || Object.keys(train.classes)[0];
    if (!cls) return;
    setBookingModalTrain(train);
    setBookingModalClass(cls);
  };

  const handleBookingSuccess = (pnr: string, bookingId: string) => {
    setBookingModalTrain(null);
    setActivePNR(pnr);
    setActiveBookingId(bookingId);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = (pnr: string) => {
    setShowPaymentModal(false);
    onNavigateToPNR(pnr);
  };

  const getDaysDifference = (targetDateStr: string) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(targetDateStr);
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      return Math.round(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return -1;
    }
  };

  const daysDiff = getDaysDifference(date);

  const quotaLabels: Record<string, string> = {
    GENERAL: 'General Quota',
    TATKAL: 'Tatkal Quota',
    LADIES: 'Ladies Quota',
    SENIOR_CITIZEN: 'Senior Citizen',
  };

  const availableTrainTypes = React.useMemo(() => {
    const types = new Set<string>();
    results.forEach((t) => {
      if (t.train?.type) types.add(t.train.type);
    });
    return Array.from(types);
  }, [results]);

  const availableClasses = React.useMemo(() => {
    const classes = new Set<string>();
    results.forEach((t) => {
      if (t.classes) {
        Object.keys(t.classes).forEach((c) => classes.add(c));
      }
    });
    return Array.from(classes);
  }, [results]);

  const displayedTrains = React.useMemo(() => {
    let list = [...results];

    // Filter by train type
    if (filterTrainType !== 'ALL') {
      list = list.filter((t) => t.train.type === filterTrainType);
    }

    // Filter by class
    if (filterClass !== 'ALL') {
      list = list.filter((t) => Boolean(t.classes && t.classes[filterClass]));
    }

    // Filter by time of day
    if (filterTimeOfDay !== 'ALL') {
      list = list.filter((t) => {
        const timeStr = t.journey?.departureTime || '';
        const hour = parseInt(timeStr.split(':')[0], 10) || 0;
        if (filterTimeOfDay === 'EARLY') return hour >= 0 && hour < 6;
        if (filterTimeOfDay === 'MORNING') return hour >= 6 && hour < 12;
        if (filterTimeOfDay === 'AFTERNOON') return hour >= 12 && hour < 18;
        if (filterTimeOfDay === 'NIGHT') return hour >= 18 && hour < 24;
        return true;
      });
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'DEPARTURE_ASC') {
        return (a.journey?.departureTime || '').localeCompare(b.journey?.departureTime || '');
      }
      if (sortBy === 'DEPARTURE_DESC') {
        return (b.journey?.departureTime || '').localeCompare(a.journey?.departureTime || '');
      }
      if (sortBy === 'DURATION_ASC') {
        return (a.journey?.durationMinutes || 0) - (b.journey?.durationMinutes || 0);
      }
      if (sortBy === 'FARE_ASC') {
        const minFareA = Math.min(...Object.values(a.classes || {}).map((c) => c.fare || 99999999));
        const minFareB = Math.min(...Object.values(b.classes || {}).map((c) => c.fare || 99999999));
        return minFareA - minFareB;
      }
      return 0;
    });

    return list;
  }, [results, sortBy, filterTrainType, filterClass, filterTimeOfDay]);

  const hasActiveFilters =
    filterTrainType !== 'ALL' ||
    filterClass !== 'ALL' ||
    filterTimeOfDay !== 'ALL' ||
    sortBy !== 'DEPARTURE_ASC';

  const resetFilters = () => {
    setFilterTrainType('ALL');
    setFilterClass('ALL');
    setFilterTimeOfDay('ALL');
    setSortBy('DEPARTURE_ASC');
  };

  return (
    <div className="flex flex-col w-full pb-16 overflow-x-clip">
      {/* ─── HERO SEARCH MODULE ────────────────────────────────────────────── */}
      <section className="relative w-full overflow-visible pt-28 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        {/* Dedicated background layer with overflow-hidden to keep photograph and gradient overlays clipped */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0 bg-cover bg-no-repeat bg-[position:center_25%]"
            style={{ backgroundImage: `url('/images/hero-bg.jpg')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/65 via-slate-950/35 to-slate-950/85" />
        </div>

        <div className="relative max-w-6xl mx-auto flex flex-col items-center text-center">
          {/* Hero Heading */}
          <h1 className="font-display font-extrabold text-4xl sm:text-6xl lg:text-[72px] text-white tracking-tight leading-[1.08] max-w-4xl text-center text-balance drop-shadow-md">
            Where will your next <br />
            <span className="text-[#38bdf8] drop-shadow-[0_0_24px_rgba(56,189,248,0.45)]">journey</span> take you?
          </h1>

          {/* Mode Selector Tabs */}
          <div className="flex items-center justify-center gap-3 mt-7 sm:mt-9 mb-4 self-center">
            <button
              type="button"
              onClick={() => setSearchMode('ROUTE')}
              className={`px-5 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                searchMode === 'ROUTE'
                  ? 'bg-white text-blue-700 shadow-xl'
                  : 'bg-slate-900/60 hover:bg-slate-900/80 text-white backdrop-blur-md border border-white/15'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">alt_route</span>
              <span>Search by Station Route</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('TRAIN_NUMBER')}
              className={`px-5 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                searchMode === 'TRAIN_NUMBER'
                  ? 'bg-white text-blue-700 shadow-xl font-bold'
                  : 'bg-slate-900/60 hover:bg-slate-900/80 text-white backdrop-blur-md border border-white/15'
              }`}
            >
              <span className="text-sm font-mono font-bold">#</span>
              <span>Search by Train # / Name</span>
            </button>
          </div>

          {/* Translucent Frosted Glass Train Search Panel */}
          <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 rounded-[28px] sm:rounded-[36px] bg-slate-900/40 backdrop-blur-xl border border-white/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] relative z-20">
            <div className="flex flex-col gap-3">
              {searchMode === 'TRAIN_NUMBER' && (
                <div ref={trainRef} className="relative bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left mb-2">
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Direct Train Number / Name Lookup</span>
                    <span className="material-symbols-outlined text-slate-400 text-[18px]">train</span>
                  </div>
                  <div className="flex items-center gap-2.5 mt-2">
                    <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        placeholder="Type 5-digit number or name (e.g. 22436, Vande Bharat, Rajdhani)..."
                        value={trainQuery}
                        onChange={(e) => handleTrainType(e.target.value)}
                        className="w-full font-bold text-base sm:text-lg text-slate-900 bg-transparent focus:outline-none"
                      />
                    </div>
                  </div>
                  {showTrainDropdown && trainSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 max-h-60 overflow-y-auto">
                      {trainSuggestions.map((t) => {
                        const route = t.schedules?.[0]?.route;
                        const origin = route?.stations?.[0]?.station;
                        const dest = route?.stations?.slice(-1)[0]?.station;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleSelectTrain(t)}
                            className="w-full p-2.5 rounded-xl text-left hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                          >
                            <div>
                              <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                <span className="font-mono text-blue-600 font-extrabold">{t.number}</span>
                                <span>{t.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {origin ? `${origin.name} (${origin.code})` : ''} → {dest ? `${dest.name} (${dest.code})` : ''}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-[10px] font-bold text-emerald-700">
                              Select & Search
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Top Row: Station & Journey Selector Cards */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 sm:gap-3">
                {/* From Station Field */}
                <div
                  ref={fromRef}
                  className={`flex-1 w-full relative group bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left hover:border-slate-300 transition-all ${
                    showFromDropdown ? 'z-30' : 'z-10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">FROM STATION</span>
                    <span className="text-blue-600 font-bold font-mono text-xs">
                      {fromCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="material-symbols-outlined text-blue-600 text-[26px] shrink-0">location_on</span>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        placeholder="Search origin..."
                        value={fromQuery}
                        onChange={(e) => handleFromType(e.target.value)}
                        onFocus={() => {
                          setShowFromDropdown(true);
                          setShowToDropdown(false);
                          setShowDatePicker(false);
                          if (fromStation && !fromQuery) {
                            setFromQuery(fromStation.name);
                          }
                          searchStations(fromQuery || fromStation?.name || '').then(setFromSuggestions);
                        }}
                        className="w-full font-bold text-base sm:text-lg text-slate-900 bg-transparent placeholder:text-slate-400 focus:outline-none"
                      />
                      <div className="text-xs text-slate-500 truncate mt-0.5 font-medium">
                        {fromStation ? `${fromStation.zone || 'Northern Railway'} • ${fromStation.state || 'Delhi'}` : 'Northern Railway • Delhi'}
                      </div>
                    </div>
                  </div>

                  {/* From Dropdown */}
                  {showFromDropdown && fromSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 max-h-56 overflow-y-auto">
                      {fromSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setFromStation(s);
                            setFromCode(s.code);
                            setShowFromDropdown(false);
                            setFromQuery(s.name);
                          }}
                          className="w-full p-2.5 rounded-xl text-left hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900">{s.name}</div>
                            <div className="text-[10px] text-slate-500">{s.fullName}</div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-xs font-mono font-bold text-blue-700">
                            {s.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Circular Swap Button */}
                <div className="flex justify-center -my-2 lg:my-0 lg:-mx-2 z-20 shrink-0">
                  <button
                    type="button"
                    onClick={handleSwapStations}
                    aria-label="Swap origin and destination"
                    className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 group shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[22px] transition-transform duration-500 group-hover:rotate-180">
                      swap_horiz
                    </span>
                  </button>
                </div>

                {/* To Station Field */}
                <div
                  ref={toRef}
                  className={`flex-1 w-full relative group bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left hover:border-slate-300 transition-all ${
                    showToDropdown ? 'z-30' : 'z-10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TO STATION</span>
                    <span className="text-blue-600 font-bold font-mono text-xs">
                      {toCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="material-symbols-outlined text-amber-500 text-[26px] shrink-0">location_on</span>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        placeholder="Search destination..."
                        value={toQuery}
                        onChange={(e) => handleToType(e.target.value)}
                        onFocus={() => {
                          setShowToDropdown(true);
                          setShowFromDropdown(false);
                          setShowDatePicker(false);
                          if (toStation && !toQuery) {
                            setToQuery(toStation.name);
                          }
                          searchStations(toQuery || toStation?.name || '').then(setToSuggestions);
                        }}
                        className="w-full font-bold text-base sm:text-lg text-slate-900 bg-transparent placeholder:text-slate-400 focus:outline-none"
                      />
                      <div className="text-xs text-slate-500 truncate mt-0.5 font-medium">
                        {toStation ? `${toStation.zone || 'Northern Railway'} • ${toStation.state || 'Uttar Pradesh'}` : 'Northern Railway • Uttar Pradesh'}
                      </div>
                    </div>
                  </div>

                  {/* To Dropdown */}
                  {showToDropdown && toSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 max-h-56 overflow-y-auto">
                      {toSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setToStation(s);
                            setToCode(s.code);
                            setShowToDropdown(false);
                            setToQuery(s.name);
                          }}
                          className="w-full p-2.5 rounded-xl text-left hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900">{s.name}</div>
                            <div className="text-[10px] text-slate-500">{s.fullName}</div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-xs font-mono font-bold text-blue-700">
                            {s.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date Selector Field with Functional Calendar Picker */}
                <div
                  onClick={() => {
                    setShowDatePicker((prev) => !prev);
                    setShowFromDropdown(false);
                    setShowToDropdown(false);
                  }}
                  className={`w-full lg:w-72 relative bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left hover:border-slate-300 transition-all cursor-pointer select-none ${
                    showDatePicker ? 'z-40' : 'z-10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DEPARTURE DATE</span>
                    <span className="material-symbols-outlined text-blue-600 text-[18px]">calendar_today</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="font-bold text-base sm:text-lg text-slate-900 leading-tight">
                      {formatDateDisplayLong(date)}
                    </div>
                    <span className={`material-symbols-outlined text-slate-500 text-[22px] transition-transform duration-200 ${showDatePicker ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </div>

                  {/* Interactive DatePicker Popup */}
                  <DatePickerPopup
                    selectedDate={date}
                    onSelectDate={handleSelectDate}
                    isOpen={showDatePicker}
                    onClose={() => setShowDatePicker(false)}
                    minDateStr={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              {/* Bottom Row: Quick Dates, Quota, Passengers, and Search Trains */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 sm:pt-4">
                {/* Left: Quick Date Modifiers */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-xs font-semibold text-white/90 mr-1.5">Quick Dates:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(0)}
                    className={`px-4 py-1.5 rounded-full text-xs transition-all cursor-pointer shadow-xs ${
                      daysDiff === 0
                        ? 'bg-blue-600 text-white font-medium shadow-md'
                        : 'bg-white/80 hover:bg-white text-slate-900 font-medium'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(1)}
                    className={`px-4 py-1.5 rounded-full text-xs transition-all cursor-pointer shadow-xs ${
                      daysDiff === 1
                        ? 'bg-blue-600 text-white font-medium shadow-md'
                        : 'bg-white/80 hover:bg-white text-slate-900 font-medium'
                    }`}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(3)}
                    className={`px-4 py-1.5 rounded-full text-xs transition-all cursor-pointer shadow-xs ${
                      daysDiff === 3
                        ? 'bg-blue-600 text-white font-medium shadow-md'
                        : 'bg-white/80 hover:bg-white text-slate-900 font-medium'
                    }`}
                  >
                    +3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate(7)}
                    className={`px-4 py-1.5 rounded-full text-xs transition-all cursor-pointer shadow-xs ${
                      daysDiff === 7
                        ? 'bg-blue-600 text-white font-medium shadow-md'
                        : 'bg-white/80 hover:bg-white text-slate-900 font-medium'
                    }`}
                  >
                    Next Week
                  </button>
                </div>

                {/* Right: Quota, Passenger, and Search Button */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Quota Selector Pill */}
                  <div className="relative inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-100/90 hover:bg-amber-100 text-amber-950 font-medium text-xs shadow-xs cursor-pointer transition-all">
                    <span className="material-symbols-outlined text-[16px] text-amber-900">confirmation_number</span>
                    <span>{quotaLabels[quota] || 'General Quota'}</span>
                    <span className="material-symbols-outlined text-[16px]">expand_more</span>
                    <select
                      value={quota}
                      onChange={(e) => setQuota(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    >
                      <option value="GENERAL">General Quota</option>
                      <option value="TATKAL">Tatkal Quota</option>
                      <option value="LADIES">Ladies Quota</option>
                      <option value="SENIOR_CITIZEN">Senior Citizen</option>
                    </select>
                  </div>

                  {/* Passenger Selector Pill */}
                  <div className="relative inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-100/90 hover:bg-blue-100 text-blue-950 font-medium text-xs shadow-xs cursor-pointer transition-all">
                    <span className="material-symbols-outlined text-[16px] text-blue-900">person</span>
                    <span>{passCount} {passCount === 1 ? 'Passenger' : 'Passengers'}</span>
                    <span className="material-symbols-outlined text-[16px]">expand_more</span>
                    <select
                      value={passCount}
                      onChange={(e) => setPassCount(Number(e.target.value))}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    >
                      <option value={1}>1 Passenger</option>
                      <option value={2}>2 Passengers</option>
                      <option value={3}>3 Passengers</option>
                      <option value={4}>4 Passengers</option>
                    </select>
                  </div>

                  {/* Search Trains Action Button */}
                  <button
                    type="button"
                    onClick={() => executeSearch()}
                    disabled={loading}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-lg hover:shadow-blue-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-75"
                  >
                    <span className="material-symbols-outlined text-[18px]">search</span>
                    <span>Search Trains</span>
                  </button>
                </div>
              </div>

              {quota === 'TATKAL' && (
                <div className="mt-2 p-3 rounded-2xl bg-amber-500/20 border border-amber-300/40 text-amber-100 text-xs flex items-center gap-2 text-left backdrop-blur-md">
                  <span className="material-symbols-outlined text-[18px] text-amber-300 shrink-0">timer</span>
                  <div>
                    <strong>Tatkal Booking Rules:</strong> AC classes open at 10:00 AM IST (1 day prior to journey). Non-AC classes open at 11:00 AM IST. Confirmed Tatkal tickets have zero refund on cancellation.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active Corridor Status Bar */}
          <div className="w-full max-w-5xl mx-auto mt-4 px-6 py-2.5 rounded-full bg-slate-950/85 backdrop-blur-md border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/90 shadow-lg relative z-10">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] shrink-0"></span>
              <span className="font-semibold text-slate-300">Active Corridor:</span>
              <span className="font-medium text-white">
                {fromStation?.name || fromCode} ({fromCode}) → {toStation?.name || toCode} ({toCode})
              </span>
            </div>
            <div className="flex items-center gap-4 text-slate-300 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-slate-400">calendar_today</span>
                <span>Date: <strong className="text-white">{formatDateDisplayLong(date)}</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-slate-400">sell</span>
                <span>Quota: <strong className="text-white">{quotaLabels[quota]?.replace(' Quota', '') || quota}</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-slate-400">train</span>
                <span>Available Trains: <strong className="text-white">{results.length}</strong></span>
              </span>
            </div>
          </div>

          {/* Result summary status area */}
          <div className="w-full max-w-5xl mx-auto mt-3 px-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-200/90">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-slate-300 text-[16px]">info</span>
              <span>Found {results.length} direct trains in the catalogue.</span>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_#34d399]"></span>
              <span>{results.some((r) => r.bookable !== false) ? 'Sandbox Inventory Active' : 'Static Catalog Results'}</span>
            </span>
          </div>
        </div>
      </section>

      {/* ─── SEARCH RESULTS LIST ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto w-full px-4 sm:px-6 mt-6">
        {/* Academic Sandbox Disclaimer Banner */}
        <div className="mb-4 p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-on-surface-variant text-left">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px] shrink-0">school</span>
            <span>
              <strong>Academic Sandbox Environment:</strong> Schedules and fares are calculated on local prototype master data. No live tickets are issued or real payments collected.
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-md bg-primary-fixed/30 text-primary font-mono font-bold text-[10px] self-start sm:self-auto shrink-0">
            SANDBOX PROTOTYPE
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center rounded-3xl bg-surface-container-low border border-outline-variant/30 flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
              progress_activity
            </span>
            <span className="font-bold text-sm text-on-surface">Searching Indian Railway Database...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center rounded-3xl bg-error-container/30 border border-error/20 text-error">
            <span className="material-symbols-outlined text-[32px] mb-1">
              {errorCode === 'RATE_LIMIT' ? 'hourglass_top' : 'info'}
            </span>
            <p className="font-bold text-sm">{error}</p>
            {errorCode === 'RATE_LIMIT' && (
              <p className="text-xs mt-2 text-on-surface-variant">
                Catalog or API rate limit reached. Wait a moment, then retry. GitHub raw files and live providers are throttled independently.
              </p>
            )}
            <button
              type="button"
              onClick={() => executeSearch()}
              className="mt-4 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold"
            >
              Retry search
            </button>
          </div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-surface-container-low border border-outline-variant/30 flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[36px] text-outline">search_off</span>
            <h3 className="font-bold text-base text-on-surface">No direct trains found for this route</h3>
            <p className="text-xs text-on-surface-variant max-w-md">
              Try searching with popular pairs seeded in our database: <br />
              • <strong>NDLS → BSB</strong> (Vande Bharat Express) <br />
              • <strong>HWH → NDLS</strong> (Rajdhani Express) <br />
              • <strong>NDLS → AGC</strong> (Shatabdi Express)
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* ─── FILTER & SORT TOOLBAR ─────────────────────────────────── */}
            <div className="bg-surface-container-low/70 border border-outline-variant/30 rounded-2xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs">
              {/* Left: Summary Counter and Active Indicator */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
                <span className="font-bold text-on-surface">
                  Showing {displayedTrains.length} of {results.length} trains
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="ml-2 px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-[11px] font-bold border border-outline-variant/40 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* Right: Filter & Sort Controls */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                {/* Train Type Filter */}
                <div className="relative">
                  <select
                    value={filterTrainType}
                    onChange={(e) => setFilterTrainType(e.target.value)}
                    className="pl-3 pr-7 py-1.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
                  >
                    <option value="ALL">All Train Types</option>
                    {availableTrainTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined text-[16px] text-outline absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    expand_more
                  </span>
                </div>

                {/* Class Filter */}
                <div className="relative">
                  <select
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    className="pl-3 pr-7 py-1.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
                  >
                    <option value="ALL">All Classes</option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Class {cls}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined text-[16px] text-outline absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    expand_more
                  </span>
                </div>

                {/* Departure Time of Day Filter */}
                <div className="relative">
                  <select
                    value={filterTimeOfDay}
                    onChange={(e) => setFilterTimeOfDay(e.target.value)}
                    className="pl-3 pr-7 py-1.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
                  >
                    <option value="ALL">Any Time</option>
                    <option value="EARLY">Early Morning (12am - 6am)</option>
                    <option value="MORNING">Morning (6am - 12pm)</option>
                    <option value="AFTERNOON">Afternoon (12pm - 6pm)</option>
                    <option value="NIGHT">Night (6pm - 12am)</option>
                  </select>
                  <span className="material-symbols-outlined text-[16px] text-outline absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    expand_more
                  </span>
                </div>

                {/* Sort By Selector */}
                <div className="relative shrink-0">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="pl-3.5 pr-8 py-1.5 rounded-xl bg-primary text-on-primary font-bold text-xs focus:outline-none cursor-pointer appearance-none whitespace-nowrap"
                  >
                    <option value="DEPARTURE_ASC">Departure: Earliest</option>
                    <option value="DEPARTURE_DESC">Departure: Latest</option>
                    <option value="DURATION_ASC">Duration: Fastest</option>
                    <option value="FARE_ASC">Fare: Lowest Price</option>
                  </select>
                  <span className="material-symbols-outlined text-[16px] text-on-primary absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    sort
                  </span>
                </div>
              </div>
            </div>

            {displayedTrains.length === 0 ? (
              <div className="p-8 text-center rounded-3xl bg-surface-container-low border border-outline-variant/30 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[32px] text-outline">filter_list_off</span>
                <h4 className="font-bold text-sm text-on-surface">No trains match your filters</h4>
                <p className="text-xs text-on-surface-variant">
                  Try adjusting or clearing your filters to see more express trains.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs hover:bg-primary-container transition-all cursor-pointer"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              displayedTrains.map((trainResult) => {
                const selectedClass =
                  selectedClasses[trainResult.trainRunId] || Object.keys(trainResult.classes)[0];
                const isRouteOpen = expandedRoutes[trainResult.trainRunId] || false;

                return (
                  <article
                    key={trainResult.trainRunId}
                    className="bg-surface-container-lowest rounded-3xl p-5 sm:p-7 shadow-sm hover:shadow-lg transition-all duration-300 border border-outline-variant/20 relative group text-left"
                  >
                  {/* Top Flag / Identity Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-outline-variant/15">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-xl bg-primary text-on-primary font-bold text-sm font-mono shadow-xs">
                        {trainResult.train.number}
                      </span>
                      <div>
                        <h3 className="font-bold text-lg text-on-surface flex items-center gap-2">
                          <span>{trainResult.train.name}</span>
                          <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                          <span className="capitalize">{trainResult.train.type.replace('_', ' ').toLowerCase()}</span>
                          <span>•</span>
                          <span>Daily Operational Run</span>
                        </div>
                      </div>
                    </div>

                    <ProvenanceBadge
                      provenance={trainResult.provenance?.provenance}
                      source={trainResult.provenance?.source}
                      label={trainResult.provenance?.provenanceLabel}
                    />
                  </div>

                  {/* Schedule & Timeline Matrix */}
                  <div className="grid grid-cols-12 items-center py-5 bg-surface-container-low/50 rounded-2xl px-4 sm:px-6 my-4 border border-outline-variant/20">
                    <div className="col-span-4 text-left">
                      <div className="font-display font-extrabold text-2xl sm:text-3xl text-primary leading-none">
                        {trainResult.journey.departureTime}
                      </div>
                      <div className="font-bold text-sm sm:text-base text-on-surface mt-1">
                        {trainResult.journey.fromStation}
                      </div>
                      <div className="text-xs text-on-surface-variant truncate">
                        {trainResult.journey.fromStationName}
                      </div>
                    </div>

                    <div className="col-span-4 flex flex-col items-center justify-center px-2">
                      <div className="flex items-center gap-1 text-xs text-on-surface-variant font-semibold">
                        <span className="material-symbols-outlined text-[16px] text-secondary">timer</span>
                        <span>
                          {trainResult.journey.durationMinutes != null
                            ? `${Math.floor(trainResult.journey.durationMinutes / 60)}h ${trainResult.journey.durationMinutes % 60}m`
                            : '—'}
                        </span>
                      </div>
                      <div className="w-full relative flex items-center justify-between my-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary/20"></div>
                        <div className="flex-1 h-0.5 bg-primary/30 mx-1"></div>
                        <span className="material-symbols-outlined text-primary text-[20px] -mx-1">train</span>
                        <div className="flex-1 h-0.5 bg-primary/30 mx-1"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-secondary ring-4 ring-secondary/20"></div>
                      </div>
                      <div className="text-[11px] text-on-surface-variant">
                        {trainResult.journey.distanceKm != null ? `${trainResult.journey.distanceKm} km` : 'Distance unavailable'} • {trainResult.route.totalStops} stops
                      </div>
                    </div>

                    <div className="col-span-4 text-right">
                      <div className="font-display font-extrabold text-2xl sm:text-3xl text-primary leading-none">
                        {trainResult.journey.arrivalTime || '—'}
                      </div>
                      <div className="font-bold text-sm sm:text-base text-on-surface mt-1">
                        {trainResult.journey.toStation}
                      </div>
                      <div className="text-xs text-on-surface-variant truncate">
                        {trainResult.journey.toStationName}
                      </div>
                    </div>
                  </div>

                  {/* Available Classes & Instant Fare Cards */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[11px] font-bold text-outline uppercase tracking-wider">
                        Available Travel Classes & Fare
                      </span>
                      {trainResult.bookable === false ? (
                        <ProvenanceBadge provenance="UNAVAILABLE" label="Unavailable" />
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                          <span>Sandbox Berth Allocation</span>
                        </span>
                      )}
                    </div>
                    {trainResult.bookable === false && (
                      <p className="text-[11px] text-on-surface-variant mb-2">
                        Seat availability and fares are not published in the DataMeet static catalog. Local sandbox booking stays on RailFlow inventory trains only.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2.5 sm:gap-3">
                      {Object.entries(trainResult.classes).map(([cType, cData]) => {
                        const isSelected = selectedClass === cType;
                        return (
                          <div
                            key={cType}
                            onClick={() =>
                              setSelectedClasses({
                                ...selectedClasses,
                                [trainResult.trainRunId]: cType,
                              })
                            }
                            className={`p-3 rounded-2xl cursor-pointer transition-all border flex flex-col justify-between min-w-[130px] sm:min-w-[150px] flex-1 max-w-[220px] ${
                              isSelected
                                ? 'bg-primary-fixed/20 border-primary ring-2 ring-primary shadow-sm'
                                : 'bg-surface-container-low border-outline-variant/30 hover:bg-surface-container'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-xs sm:text-sm text-primary tracking-tight leading-tight">
                                {cType}
                              </span>
                              <div className="text-right shrink-0">
                                <span className="font-extrabold text-xs text-on-surface block whitespace-nowrap">
                                  ₹{(cData.fare / 100).toFixed(2)}
                                </span>
                                <span className="text-[9px] text-on-surface-variant block whitespace-nowrap">
                                  Base fare
                                </span>
                              </div>
                            </div>
                            <div className="mt-2.5 flex items-center justify-between">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-confirmed/15 text-status-confirmed text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-status-confirmed"></span>
                                {cData.available > 0 ? `AVL ${cData.available}` : 'WL'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expandable Route & Stops Drawer */}
                  {isRouteOpen && (
                    <div className="mt-4 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 animate-fade-in">
                      <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                        Detailed Route Stops ({trainResult.route.name})
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-outline-variant/30 text-outline">
                              <th className="pb-2">Seq</th>
                              <th className="pb-2">Station Code</th>
                              <th className="pb-2">Station Name</th>
                              <th className="pb-2">Distance</th>
                              <th className="pb-2">Platform</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {trainResult.route.stops.map((stop) => (
                              <tr key={stop.sequence} className="py-2">
                                <td className="py-2 font-mono">{stop.sequence}</td>
                                <td className="py-2 font-bold text-primary">{stop.stationCode}</td>
                                <td className="py-2">{stop.stationName}</td>
                                <td className="py-2">{stop.distanceKm} km</td>
                                <td className="py-2">{stop.platform || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Bottom Action Footer */}
                  <div className="mt-5 pt-4 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRoutes({
                            ...expandedRoutes,
                            [trainResult.trainRunId]: !isRouteOpen,
                          })
                        }
                        className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {isRouteOpen ? 'expand_less' : 'expand_more'}
                        </span>
                        <span>{isRouteOpen ? 'Hide Route Schedule' : 'View Route Schedule'}</span>
                      </button>

                      <a
                        href={`/tracking?train=${trainResult.train.number}`}
                        className="text-xs font-bold text-secondary hover:underline flex items-center gap-1 transition-colors"
                        title={`Track ${trainResult.train.number} on Live Map`}
                      >
                        <span className="material-symbols-outlined text-[16px]">radar</span>
                        <span>Live Status & Map</span>
                      </a>
                    </div>

                    {trainResult.bookable === false ? (
                      <span className="px-6 py-2.5 rounded-full bg-surface-container-high text-on-surface-variant font-bold text-xs border border-outline-variant/30 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-outline">block</span>
                        <span>Static catalog — non-bookable</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenBooking(trainResult)}
                        className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-bold text-xs shadow-md hover:bg-primary-container active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <span>Book Now ({selectedClass})</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            }))}
          </div>
        )}
      </section>

      {/* ─── MODALS ────────────────────────────────────────────────────────── */}
      {bookingModalTrain && (
        <BookingModal
          isOpen={!!bookingModalTrain}
          onClose={() => setBookingModalTrain(null)}
          trainResult={bookingModalTrain}
          selectedClass={bookingModalClass}
          onBookingSuccess={handleBookingSuccess}
          onRequireAuth={onRequireAuth}
        />
      )}

      {showPaymentModal && activeBookingId && activePNR && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          bookingId={activeBookingId}
          pnr={activePNR}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
};
