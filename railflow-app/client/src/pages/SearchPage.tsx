import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeftRight,
  Ticket,
  Users,
  ChevronDown,
  Check,
  AlertCircle,
  Search,
  X,
} from 'lucide-react';
import type { Station, TrainSearchResult } from '../types';
import {
  searchStations,
  searchTrainsWithAlternatives,
  lookupTrains,
  type AdvancedSearchResult,
} from '../api/endpoints';
import { BookingModal } from '../components/booking/BookingModal';
import { PaymentModal } from '../components/booking/PaymentModal';
import { QuickSandboxModal } from '../components/booking/QuickSandboxModal';
import { DatePickerPopup } from '../components/booking/DatePickerPopup';
import { TrainResultSkeleton } from '../components/search/TrainResultSkeleton';
import { JourneyContextBar } from '../components/search/JourneyContextBar';
import { TrainResultCard } from '../components/search/TrainResultCard';
import { CoachSeatMapModal } from '../components/booking/CoachSeatMapModal';
import { NoResultRecovery } from '../components/search/NoResultRecovery';
import { useClickOutside } from '../hooks/useClickOutside';

interface SearchPageProps {
  onRequireAuth: () => void;
  onNavigateToPNR: (pnr: string) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onRequireAuth, onNavigateToPNR }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Search Form State
  const [searchMode, setSearchMode] = useState<'ROUTE' | 'TRAIN_NUMBER'>('ROUTE');
  const [trainQuery, setTrainQuery] = useState('');
  const [trainSuggestions, setTrainSuggestions] = useState<any[]>([]);
  const [showTrainDropdown, setShowTrainDropdown] = useState(false);
  const [selectedTrainFilter, setSelectedTrainFilter] = useState<string | null>(null);

  const [fromCode, setFromCode] = useState('NDLS');
  const [toCode, setToCode] = useState('BSB');
  const todayStr = React.useMemo(() => new Date().toISOString().split('T')[0], []);
  const [date, setDate] = useState(() => todayStr);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [quota, setQuota] = useState('GENERAL');
  const [passCount, setPassCount] = useState(1);

  // Custom Dropdown Open States
  const [showQuotaDropdown, setShowQuotaDropdown] = useState(false);
  const [showPassDropdown, setShowPassDropdown] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  // Autocomplete suggestions
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromSuggestions, setFromSuggestions] = useState<Station[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Station[]>([]);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);

  // Keyboard navigation indices for autocomplete
  const [fromHighlightedIndex, setFromHighlightedIndex] = useState(-1);
  const [toHighlightedIndex, setToHighlightedIndex] = useState(-1);
  const [trainHighlightedIndex, setTrainHighlightedIndex] = useState(-1);

  // Selected Stations details
  const [fromStation, setFromStation] = useState<Station | null>(null);
  const [toStation, setToStation] = useState<Station | null>(null);

  // Train Results & Alternatives
  const [results, setResults] = useState<TrainSearchResult[]>([]);
  const [alternatives, setAlternatives] = useState<AdvancedSearchResult['alternatives'] | null>(null);
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

  // Sandbox Modal State
  const [sandboxModalTrain, setSandboxModalTrain] = useState<TrainSearchResult | null>(null);
  const [sandboxFareInfo, setSandboxFareInfo] = useState<{
    distanceKm: number | null;
    ratePerKm: number;
    estimatedFare: number | null;
  } | null>(null);

  // Seat Matrix Modal State
  const [seatMapModalTrain, setSeatMapModalTrain] = useState<TrainSearchResult | null>(null);
  const [seatMapModalClass, setSeatMapModalClass] = useState<string>('');

  // Request race-condition safeguard
  const searchRequestIdRef = React.useRef(0);
  const isInitializedRef = React.useRef(false);

  // DOM Refs
  const fromRef = React.useRef<HTMLDivElement>(null);
  const toRef = React.useRef<HTMLDivElement>(null);
  const trainRef = React.useRef<HTMLDivElement>(null);
  const quotaDropdownRef = React.useRef<HTMLDivElement>(null);
  const quotaTriggerRef = React.useRef<HTMLButtonElement>(null);
  const passDropdownRef = React.useRef<HTMLDivElement>(null);
  const passTriggerRef = React.useRef<HTMLButtonElement>(null);

  // Click outside hooks for custom dropdowns
  useClickOutside(quotaDropdownRef, () => setShowQuotaDropdown(false), {
    enabled: showQuotaDropdown,
    onEscape: () => setShowQuotaDropdown(false),
    ignoreRefs: [quotaTriggerRef],
  });

  useClickOutside(passDropdownRef, () => setShowPassDropdown(false), {
    enabled: showPassDropdown,
    onEscape: () => setShowPassDropdown(false),
    ignoreRefs: [passTriggerRef],
  });

  // Global escape and click listener for input autocomplete dropdowns
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
        setShowQuotaDropdown(false);
        setShowPassDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Synchronize state with URL parameters (preserves unrelated params without reload)
  const syncToUrl = React.useCallback(
    (f: string, t: string, d: string, q: string, p: number, train?: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('from', f);
          next.set('to', t);
          next.set('date', d);
          next.set('quota', q);
          next.set('passengers', String(p));
          if (train) {
            next.set('train', train);
          } else {
            next.delete('train');
          }
          if (next.toString() === prev.toString()) {
            return prev;
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Calculation for static catalog trains (approx ₹1.50/km for Sleeper/Exp, ₹2.80/km for Rajdhani/SF)
  const getStaticTrainFareInfo = React.useCallback((trainResult: TrainSearchResult, count: number) => {
    const typeStr = (trainResult.train?.type || '').toUpperCase();
    const nameStr = (trainResult.train?.name || '').toUpperCase();
    const isSuperfast =
      typeStr === 'SF' ||
      typeStr === 'RAJ' ||
      nameStr.includes('RAJDHANI') ||
      nameStr.includes('SUPERFAST') ||
      nameStr.includes('DURONTO') ||
      nameStr.includes('SHATABDI') ||
      nameStr.includes('VANDE BHARAT');

    const ratePerKm = isSuperfast ? 2.80 : 1.50;

    // Primary: journey.distanceKm
    let distanceKm: number | null = trainResult.journey?.distanceKm ?? null;

    // Secondary: calculate from route stops distance delta if valid positive
    if ((distanceKm == null || distanceKm <= 0) && trainResult.route?.stops?.length >= 2) {
      const fromStop = trainResult.route.stops.find(
        (s) => s.stationCode === trainResult.journey.fromStation
      );
      const toStop = trainResult.route.stops.find(
        (s) => s.stationCode === trainResult.journey.toStation
      );
      if (
        fromStop?.distanceKm != null &&
        toStop?.distanceKm != null &&
        toStop.distanceKm > fromStop.distanceKm
      ) {
        distanceKm = toStop.distanceKm - fromStop.distanceKm;
      }
    }

    if (distanceKm != null && distanceKm > 0) {
      const basePerPax = Math.round(distanceKm * ratePerKm);
      const totalFare = basePerPax * count;
      return {
        isAvailable: true,
        distanceKm,
        ratePerKm,
        basePerPassenger: basePerPax,
        totalEstimatedFare: totalFare,
        isSuperfast,
        categoryLabel: isSuperfast ? 'Rajdhani / Superfast' : 'Sleeper / Express',
      };
    }

    return {
      isAvailable: false,
      distanceKm: null,
      ratePerKm,
      basePerPassenger: null,
      totalEstimatedFare: null,
      isSuperfast,
      categoryLabel: isSuperfast ? 'Rajdhani / Superfast' : 'Sleeper / Express',
    };
  }, []);

  // Search Execution with Validation and Request-Sequence Protection
  const executeSearch = React.useCallback(
    async (
      fCode = fromCode,
      tCode = toCode,
      d = date,
      q = quota,
      p = passCount,
      trainFilter = selectedTrainFilter
    ) => {
      const trimmedFrom = fCode.trim().toUpperCase();
      const trimmedTo = tCode.trim().toUpperCase();

      if (!trimmedFrom || !trimmedTo) {
        setError('Please select both origin and destination stations.');
        setErrorCode('MISSING_STATIONS');
        return;
      }

      // Check stable ID or matching code
      const isSameStation =
        (fromStation?.id && toStation?.id && fromStation.id === toStation.id && fromStation.code === trimmedFrom && toStation.code === trimmedTo) ||
        trimmedFrom === trimmedTo;

      if (isSameStation) {
        setError('Origin and destination stations cannot be the same.');
        setErrorCode('SAME_STATION');
        setResults([]);
        setAlternatives(null);
        return;
      }

      // Sync URL
      syncToUrl(trimmedFrom, trimmedTo, d, q, p, trainFilter);

      const currentRequestId = ++searchRequestIdRef.current;
      setLoading(true);
      setError(null);
      setErrorCode(null);

      try {
        const data = await searchTrainsWithAlternatives({
          fromStationCode: trimmedFrom,
          toStationCode: trimmedTo,
          date: d,
          quota: q,
          passCount: p,
        });

        // Discard if superseded by a newer search
        if (currentRequestId !== searchRequestIdRef.current) {
          return;
        }

        const trains = data.trains || [];
        setResults(trains);
        setAlternatives(data.alternatives || null);

        // Update station objects if server returned canonical station metadata
        if (data.fromStation && (!fromStation || fromStation.code !== data.fromStation.code)) {
          setFromStation((prev) => ({ ...(prev || {}), ...data.fromStation } as Station));
        }
        if (data.toStation && (!toStation || toStation.code !== data.toStation.code)) {
          setToStation((prev) => ({ ...(prev || {}), ...data.toStation } as Station));
        }

        // Default selected class for each train (first available class)
        const initialSelections: Record<string, string> = {};
        trains.forEach((t) => {
          const availableClasses = Object.keys(t.classes || {});
          if (availableClasses.length > 0) {
            initialSelections[t.trainRunId] = availableClasses[0];
          }
        });
        setSelectedClasses(initialSelections);
      } catch (err: any) {
        if (currentRequestId !== searchRequestIdRef.current) {
          return;
        }
        setError(err.message || 'Train search failed');
        setErrorCode(err.code || (err.status === 429 ? 'RATE_LIMIT' : null));
        setResults([]);
        setAlternatives(null);
      } finally {
        if (currentRequestId === searchRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [fromCode, toCode, date, quota, passCount, selectedTrainFilter, fromStation, toStation, syncToUrl]
  );

  const formStateRef = React.useRef({ fromCode, toCode, date, quota, passCount });
  useEffect(() => {
    formStateRef.current = { fromCode, toCode, date, quota, passCount };
  }, [fromCode, toCode, date, quota, passCount]);

  const executeSearchRef = React.useRef(executeSearch);
  useEffect(() => {
    executeSearchRef.current = executeSearch;
  }, [executeSearch]);

  const syncToUrlRef = React.useRef(syncToUrl);
  useEffect(() => {
    syncToUrlRef.current = syncToUrl;
  }, [syncToUrl]);

  // Initial station load & URL query param parsing on mount
  useEffect(() => {
    let active = true;

    async function init() {
      const allStations = await searchStations('');
      if (!active) return;

      const pFrom = searchParams.get('from')?.toUpperCase();
      const pTo = searchParams.get('to')?.toUpperCase();
      const pDate = searchParams.get('date');
      const pQuota = searchParams.get('quota')?.toUpperCase();
      const pPass = parseInt(searchParams.get('passengers') || '', 10);
      const pTrain = searchParams.get('train');

      const validQuota = ['GENERAL', 'TATKAL', 'LADIES', 'SENIOR_CITIZEN'].includes(pQuota || '')
        ? (pQuota as string)
        : 'GENERAL';
      const validPass = !isNaN(pPass) && pPass >= 1 && pPass <= 6 ? pPass : 1;
      const validDate = pDate && /^\d{4}-\d{2}-\d{2}$/.test(pDate) ? pDate : new Date().toISOString().split('T')[0];

      const initialFromCode = pFrom || 'NDLS';
      const initialToCode = pTo || 'BSB';

      const foundFrom = allStations.find((s) => s.code === initialFromCode) || null;
      const foundTo = allStations.find((s) => s.code === initialToCode) || null;

      setFromStation(foundFrom);
      setFromCode(initialFromCode);
      setToStation(foundTo);
      setToCode(initialToCode);
      setDate(validDate);
      setQuota(validQuota);
      setPassCount(validPass);
      if (pTrain) {
        setSelectedTrainFilter(pTrain);
        setTrainQuery(pTrain);
      }

      isInitializedRef.current = true;

      // Sync URL once with initial canonical parameters
      syncToUrlRef.current(initialFromCode, initialToCode, validDate, validQuota, validPass, pTrain);

      // Execute search if valid
      if (initialFromCode && initialToCode && initialFromCode !== initialToCode) {
        executeSearchRef.current(initialFromCode, initialToCode, validDate, validQuota, validPass, pTrain);
      } else if (initialFromCode && initialToCode && initialFromCode === initialToCode) {
        setError('Origin and destination stations cannot be the same.');
        setErrorCode('SAME_STATION');
      }
    }

    init();

    return () => {
      active = false;
    };
  }, [searchParams]); // Synchronize with URL on mount

  // Handle browser Back / Forward history navigation without effect loops
  useEffect(() => {
    if (!isInitializedRef.current) return;

    const pFrom = searchParams.get('from')?.toUpperCase();
    const pTo = searchParams.get('to')?.toUpperCase();
    const pDate = searchParams.get('date');
    const pQuota = searchParams.get('quota')?.toUpperCase();
    const pPass = parseInt(searchParams.get('passengers') || '', 10);
    const pTrain = searchParams.get('train');

    const current = formStateRef.current;

    const validQuota = ['GENERAL', 'TATKAL', 'LADIES', 'SENIOR_CITIZEN'].includes(pQuota || '')
      ? (pQuota as string)
      : current.quota;
    const validPass = !isNaN(pPass) && pPass >= 1 && pPass <= 6 ? pPass : current.passCount;
    const validDate = pDate && /^\d{4}-\d{2}-\d{2}$/.test(pDate) ? pDate : current.date;

    const hasChanged =
      (pFrom && pFrom !== current.fromCode) ||
      (pTo && pTo !== current.toCode) ||
      (validDate !== current.date) ||
      (validQuota !== current.quota) ||
      (validPass !== current.passCount);

    if (hasChanged) {
      if (pFrom && pFrom !== current.fromCode) setFromCode(pFrom);
      if (pTo && pTo !== current.toCode) setToCode(pTo);
      if (validDate !== current.date) setDate(validDate);
      if (validQuota !== current.quota) setQuota(validQuota);
      if (validPass !== current.passCount) setPassCount(validPass);
      if (pTrain !== selectedTrainFilter) setSelectedTrainFilter(pTrain || null);

      const targetFrom = pFrom || current.fromCode;
      const targetTo = pTo || current.toCode;

      if (targetFrom && targetTo) {
        executeSearchRef.current(targetFrom, targetTo, validDate, validQuota, validPass, pTrain);
      }
    }
  }, [searchParams, selectedTrainFilter]);

  // Handle station typing with live API query
  const handleFromType = async (val: string) => {
    setFromQuery(val);
    setShowFromDropdown(true);
    setFromHighlightedIndex(-1);
    setResults([]); // Invalidate stale results when station inputs change
    setAlternatives(null);
    const stations = await searchStations(val);
    setFromSuggestions(stations);
  };

  const handleToType = async (val: string) => {
    setToQuery(val);
    setShowToDropdown(true);
    setToHighlightedIndex(-1);
    setResults([]); // Invalidate stale results when station inputs change
    setAlternatives(null);
    const stations = await searchStations(val);
    setToSuggestions(stations);
  };

  const handleTrainType = async (val: string) => {
    setTrainQuery(val);
    setTrainHighlightedIndex(-1);
    if (val.trim().length >= 2) {
      setShowTrainDropdown(true);
      const trains = await lookupTrains(val.trim());
      setTrainSuggestions(trains);
    } else {
      setShowTrainDropdown(false);
      setTrainSuggestions([]);
      if (!val.trim()) {
        setSelectedTrainFilter(null);
      }
    }
  };

  const handleSelectTrain = (train: any) => {
    setSelectedTrainFilter(train.number);
    setTrainQuery(`${train.number} - ${train.name}`);
    setShowTrainDropdown(false);

    const route = train.schedules?.[0]?.route;
    if (route && route.stations?.length >= 2) {
      const origin = route.stations[0].station;
      const terminus = route.stations[route.stations.length - 1].station;
      setFromStation(origin);
      setFromCode(origin.code);
      setToStation(terminus);
      setToCode(terminus.code);
      setSearchMode('ROUTE');
      executeSearch(origin.code, terminus.code, date, quota, passCount, train.number);
    } else {
      executeSearch(fromCode, toCode, date, quota, passCount, train.number);
    }
  };

  const handleClearTrainFilter = () => {
    setSelectedTrainFilter(null);
    setTrainQuery('');
    setShowTrainDropdown(false);
    executeSearch(fromCode, toCode, date, quota, passCount, null);
  };

  // Keyboard navigation handlers
  const handleFromKeyDown = (e: React.KeyboardEvent) => {
    if (!showFromDropdown || fromSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFromHighlightedIndex((prev) => (prev < fromSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFromHighlightedIndex((prev) => (prev > 0 ? prev - 1 : fromSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (fromHighlightedIndex >= 0 && fromHighlightedIndex < fromSuggestions.length) {
        e.preventDefault();
        const s = fromSuggestions[fromHighlightedIndex];
        setFromStation(s);
        setFromCode(s.code);
        setShowFromDropdown(false);
        setFromQuery(s.name);
        setResults([]);
        setAlternatives(null);
        if (errorCode === 'SAME_STATION') {
          setError(null);
          setErrorCode(null);
        }
        if (toCode && s.code !== toCode) {
          executeSearch(s.code, toCode, date, quota, passCount);
        }
      }
    } else if (e.key === 'Escape') {
      setShowFromDropdown(false);
    }
  };

  const handleToKeyDown = (e: React.KeyboardEvent) => {
    if (!showToDropdown || toSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setToHighlightedIndex((prev) => (prev < toSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setToHighlightedIndex((prev) => (prev > 0 ? prev - 1 : toSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (toHighlightedIndex >= 0 && toHighlightedIndex < toSuggestions.length) {
        e.preventDefault();
        const s = toSuggestions[toHighlightedIndex];
        setToStation(s);
        setToCode(s.code);
        setShowToDropdown(false);
        setToQuery(s.name);
        setResults([]);
        setAlternatives(null);
        if (errorCode === 'SAME_STATION') {
          setError(null);
          setErrorCode(null);
        }
        if (fromCode && s.code !== fromCode) {
          executeSearch(fromCode, s.code, date, quota, passCount);
        }
      }
    } else if (e.key === 'Escape') {
      setShowToDropdown(false);
    }
  };

  const handleTrainKeyDown = (e: React.KeyboardEvent) => {
    if (!showTrainDropdown || trainSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTrainHighlightedIndex((prev) => (prev < trainSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTrainHighlightedIndex((prev) => (prev > 0 ? prev - 1 : trainSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (trainHighlightedIndex >= 0 && trainHighlightedIndex < trainSuggestions.length) {
        e.preventDefault();
        handleSelectTrain(trainSuggestions[trainHighlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowTrainDropdown(false);
    }
  };

  const handleSwapStations = () => {
    setIsSwapping(true);
    setTimeout(() => setIsSwapping(false), 300);

    const tempCode = fromCode;
    const tempStation = fromStation;
    const tempQuery = fromQuery;

    const newFromCode = toCode;
    const newToCode = tempCode;

    setFromCode(newFromCode);
    setFromStation(toStation);
    setFromQuery(toQuery);

    setToCode(newToCode);
    setToStation(tempStation);
    setToQuery(tempQuery);

    // Stale prevention: immediately clear previous results so old result cards cannot linger
    setResults([]);
    setAlternatives(null);

    if (errorCode === 'SAME_STATION') {
      setError(null);
      setErrorCode(null);
    }

    if (newFromCode && newToCode && newFromCode !== newToCode) {
      executeSearch(newFromCode, newToCode, date, quota, passCount);
    }
  };

  const handleQuickDate = (daysFromToday: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    const dateStr = d.toISOString().split('T')[0];
    setError(null);
    setDate(dateStr);
    setResults([]);
    executeSearch(fromCode, toCode, dateStr, quota, passCount);
  };

  const handleSelectDate = (newDateStr: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (newDateStr < todayStr) {
      setError('Journey date cannot be in the past.');
      return;
    }
    setError(null);
    setDate(newDateStr);
    setResults([]);
    executeSearch(fromCode, toCode, newDateStr, quota, passCount);
  };

  const formatDateDisplayLong = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  // Real Booking modal invocation for bookable trains
  const handleOpenBooking = (train: TrainSearchResult, overrideClass?: string) => {
    if (train.bookable === false) return;
    const cls = overrideClass || selectedClasses[train.trainRunId] || Object.keys(train.classes)[0];
    if (!cls) return;
    setBookingModalTrain(train);
    setBookingModalClass(cls);
  };

  const handleOpenSeatMatrix = (train: TrainSearchResult, classCode: string) => {
    const safeClass =
      classCode ||
      selectedClasses[train.trainRunId] ||
      (train.classes && Object.keys(train.classes)[0]) ||
      '3A';
    setSeatMapModalTrain(train);
    setSeatMapModalClass(safeClass);
  };

  const handleProceedFromSeatMatrix = (
    train: TrainSearchResult,
    classCode: string,
    _preferences: ('LOWER' | 'MIDDLE' | 'UPPER' | 'SIDE_LOWER' | 'SIDE_UPPER')[]
  ) => {
    setSeatMapModalTrain(null);
    if (train.bookable !== false) {
      handleOpenBooking(train, classCode);
    } else {
      handleOpenSandboxBooking(train);
    }
  };

  // Sandbox modal invocation for static catalogue trains (isolated from real bookings)
  const handleOpenSandboxBooking = (train: TrainSearchResult) => {
    const info = getStaticTrainFareInfo(train, passCount);
    setSandboxModalTrain(train);
    setSandboxFareInfo({
      distanceKm: info.distanceKm,
      ratePerKm: info.ratePerKm,
      estimatedFare: info.totalEstimatedFare,
    });
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

  const daysDiff = React.useMemo(() => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      return Math.round(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return -1;
    }
  }, [date]);

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

    // Filter by specific selected train number
    if (selectedTrainFilter) {
      list = list.filter((t) => t.train.number === selectedTrainFilter);
    }

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
  }, [results, selectedTrainFilter, sortBy, filterTrainType, filterClass, filterTimeOfDay]);

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
              className={`px-5 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
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
              className={`px-5 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
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
                <div ref={trainRef} className="relative bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left mb-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Direct Train Number / Name Lookup</span>
                    <span className="material-symbols-outlined text-slate-400 text-[18px]">train</span>
                  </div>
                  <div className="flex items-center gap-2.5 mt-2">
                    <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                    </div>
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Type 5-digit number or name (e.g. 22436, Vande Bharat, Rajdhani)..."
                        aria-label="Direct Train Number or Name Lookup"
                        value={trainQuery}
                        onChange={(e) => handleTrainType(e.target.value)}
                        onKeyDown={handleTrainKeyDown}
                        className="w-full font-bold text-base sm:text-lg text-slate-900 bg-transparent focus:outline-none"
                      />
                      {(trainQuery || selectedTrainFilter) && (
                        <button
                          type="button"
                          onClick={handleClearTrainFilter}
                          aria-label="Clear train search"
                          className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {selectedTrainFilter && (
                    <div className="mt-2 text-xs flex items-center justify-between bg-blue-50/70 border border-blue-200/50 rounded-xl px-3 py-1.5 text-blue-900">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                        <span>Filtering to Train <span className="font-mono font-bold">{selectedTrainFilter}</span></span>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearTrainFilter}
                        className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                      >
                        Show all trains on route
                      </button>
                    </div>
                  )}
                  {showTrainDropdown && trainSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 max-h-60 overflow-y-auto">
                      {trainSuggestions.map((t, idx) => {
                        const route = t.schedules?.[0]?.route;
                        const origin = route?.stations?.[0]?.station;
                        const dest = route?.stations?.slice(-1)[0]?.station;
                        const isHighlighted = idx === trainHighlightedIndex;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleSelectTrain(t)}
                            className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                              isHighlighted ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                            }`}
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
                  className={`flex-1 w-full min-h-[96px] flex flex-col justify-between relative group bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all ${
                    showFromDropdown ? 'z-30' : 'z-10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">FROM STATION</span>
                    <span className="text-blue-700 font-extrabold font-mono text-xs bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                      {fromCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="material-symbols-outlined text-blue-600 text-[26px] shrink-0" aria-hidden="true">location_on</span>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        placeholder="Search origin station or code..."
                        aria-label="Origin station"
                        value={fromQuery}
                        onChange={(e) => handleFromType(e.target.value)}
                        onKeyDown={handleFromKeyDown}
                        onFocus={() => {
                          setShowFromDropdown(true);
                          setShowToDropdown(false);
                          setShowDatePicker(false);
                          setShowQuotaDropdown(false);
                          setShowPassDropdown(false);
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
                      {fromSuggestions.map((s, idx) => {
                        const isHighlighted = idx === fromHighlightedIndex;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setFromStation(s);
                              setFromCode(s.code);
                              setShowFromDropdown(false);
                              setFromQuery(s.name);
                              setResults([]);
                              setAlternatives(null);
                              if (errorCode === 'SAME_STATION') {
                                setError(null);
                                setErrorCode(null);
                              }
                              if (toCode && s.code !== toCode) {
                                executeSearch(s.code, toCode, date, quota, passCount);
                              }
                            }}
                            className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                              isHighlighted ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-xs text-slate-900">{s.name}</div>
                              <div className="text-[10px] text-slate-500">{s.fullName}</div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-xs font-mono font-bold text-blue-700">
                              {s.code}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Circular Swap Button with Transition Animation */}
                <div className="flex justify-center -my-2 lg:my-0 lg:-mx-2 z-20 shrink-0 self-center">
                  <button
                    type="button"
                    onClick={handleSwapStations}
                    aria-label="Swap origin and destination stations"
                    className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 group shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    <ArrowLeftRight
                      className={`w-5 h-5 transition-transform duration-300 ease-in-out motion-reduce:transition-none motion-reduce:transform-none ${
                        isSwapping ? 'rotate-180' : 'group-hover:rotate-180'
                      }`}
                    />
                  </button>
                </div>

                {/* To Station Field */}
                <div
                  ref={toRef}
                  className={`flex-1 w-full min-h-[96px] flex flex-col justify-between relative group bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all ${
                    showToDropdown ? 'z-30' : 'z-10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">TO STATION</span>
                    <span className="text-blue-700 font-extrabold font-mono text-xs bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                      {toCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="material-symbols-outlined text-amber-500 text-[26px] shrink-0" aria-hidden="true">location_on</span>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        placeholder="Search destination station or code..."
                        aria-label="Destination station"
                        value={toQuery}
                        onChange={(e) => handleToType(e.target.value)}
                        onKeyDown={handleToKeyDown}
                        onFocus={() => {
                          setShowToDropdown(true);
                          setShowFromDropdown(false);
                          setShowDatePicker(false);
                          setShowQuotaDropdown(false);
                          setShowPassDropdown(false);
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
                      {toSuggestions.map((s, idx) => {
                        const isHighlighted = idx === toHighlightedIndex;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setToStation(s);
                              setToCode(s.code);
                              setShowToDropdown(false);
                              setToQuery(s.name);
                              setResults([]);
                              setAlternatives(null);
                              if (errorCode === 'SAME_STATION') {
                                setError(null);
                                setErrorCode(null);
                              }
                              if (fromCode && s.code !== fromCode) {
                                executeSearch(fromCode, s.code, date, quota, passCount);
                              }
                            }}
                            className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                              isHighlighted ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-xs text-slate-900">{s.name}</div>
                              <div className="text-[10px] text-slate-500">{s.fullName}</div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-xs font-mono font-bold text-blue-700">
                              {s.code}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Date Selector Field with Functional Calendar Picker */}
                <div className="relative w-full lg:w-72">
                  <button
                    type="button"
                    id="departure-date-btn"
                    aria-haspopup="dialog"
                    aria-expanded={showDatePicker}
                    aria-controls="departure-datepicker-popup"
                    aria-label={`Departure date: ${formatDateDisplayLong(date)}`}
                    onClick={() => {
                      setShowDatePicker((prev) => !prev);
                      setShowFromDropdown(false);
                      setShowToDropdown(false);
                      setShowQuotaDropdown(false);
                      setShowPassDropdown(false);
                    }}
                    className={`w-full min-h-[96px] flex flex-col justify-between bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer select-none ${
                      showDatePicker ? 'ring-2 ring-blue-500/20 border-blue-500 z-40' : 'z-10'
                    }`}
                  >
                    <div className="flex items-start justify-between w-full">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">DEPARTURE DATE</span>
                      <span className="material-symbols-outlined text-blue-600 text-[18px]">calendar_today</span>
                    </div>
                    <div className="flex items-center justify-between w-full mt-1.5">
                      <div className="font-bold text-base sm:text-lg text-slate-900 leading-tight">
                        {formatDateDisplayLong(date)}
                      </div>
                      <span className={`material-symbols-outlined text-slate-500 text-[22px] transition-transform duration-200 ${showDatePicker ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </div>
                  </button>

                  {/* Interactive DatePicker Popup as sibling */}
                  <div id="departure-datepicker-popup">
                    <DatePickerPopup
                      selectedDate={date}
                      onSelectDate={handleSelectDate}
                      isOpen={showDatePicker}
                      onClose={() => setShowDatePicker(false)}
                      minDateStr={todayStr}
                    />
                  </div>
                </div>
              </div>

              {/* Inline Validation Error Banner */}
              {error && (
                <div
                  role="alert"
                  className="mt-2 p-3.5 rounded-2xl bg-red-500/20 border border-red-400/40 text-red-200 text-xs flex items-center gap-2.5 text-left backdrop-blur-md animate-fade-in"
                >
                  <AlertCircle className="w-5 h-5 text-red-300 shrink-0" />
                  <span className="font-semibold text-xs leading-normal">{error}</span>
                </div>
              )}

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
                  {/* Quota Selector Custom Accessible Dropdown */}
                  <div className="relative">
                    <button
                      ref={quotaTriggerRef}
                      id="quota-select-btn"
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={showQuotaDropdown}
                      aria-controls="quota-dropdown-menu"
                      onClick={() => {
                        setShowQuotaDropdown((prev) => !prev);
                        setShowPassDropdown(false);
                        setShowDatePicker(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-100/90 hover:bg-amber-100 text-amber-950 font-medium text-xs shadow-xs cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <Ticket className="w-4 h-4 text-amber-900 shrink-0" />
                      <span>{quotaLabels[quota] || 'General Quota'}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-amber-900 transition-transform duration-200 ${
                          showQuotaDropdown ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {showQuotaDropdown && (
                      <div
                        id="quota-dropdown-menu"
                        ref={quotaDropdownRef}
                        role="listbox"
                        aria-labelledby="quota-select-btn"
                        className="absolute bottom-full mb-2 right-0 bg-white rounded-2xl shadow-2xl border border-slate-200 p-1.5 z-50 min-w-[190px] animate-fade-in"
                      >
                        {Object.entries(quotaLabels).map(([qKey, qLabel]) => {
                          const isSelected = quota === qKey;
                          return (
                            <button
                              key={qKey}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              tabIndex={0}
                              onClick={() => {
                                setQuota(qKey);
                                setShowQuotaDropdown(false);
                                setResults([]);
                                executeSearch(fromCode, toCode, date, qKey, passCount);
                              }}
                              className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected ? 'bg-amber-50 text-amber-950 font-bold' : 'hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <span>{qLabel}</span>
                              {isSelected && <Check className="w-4 h-4 text-amber-700 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Passenger Selector Custom Accessible Dropdown */}
                  <div className="relative">
                    <button
                      ref={passTriggerRef}
                      id="passenger-select-btn"
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={showPassDropdown}
                      aria-controls="passenger-dropdown-menu"
                      onClick={() => {
                        setShowPassDropdown((prev) => !prev);
                        setShowQuotaDropdown(false);
                        setShowDatePicker(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-100/90 hover:bg-blue-100 text-blue-950 font-medium text-xs shadow-xs cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Users className="w-4 h-4 text-blue-900 shrink-0" />
                      <span>{passCount} {passCount === 1 ? 'Passenger' : 'Passengers'}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-blue-900 transition-transform duration-200 ${
                          showPassDropdown ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {showPassDropdown && (
                      <div
                        id="passenger-dropdown-menu"
                        ref={passDropdownRef}
                        role="listbox"
                        aria-labelledby="passenger-select-btn"
                        className="absolute bottom-full mb-2 right-0 bg-white rounded-2xl shadow-2xl border border-slate-200 p-1.5 z-50 min-w-[170px] animate-fade-in"
                      >
                        {[1, 2, 3, 4, 5, 6].map((num) => {
                          const isSelected = passCount === num;
                          return (
                            <button
                              key={num}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              tabIndex={0}
                              onClick={() => {
                                setPassCount(num);
                                setShowPassDropdown(false);
                                setResults([]);
                                executeSearch(fromCode, toCode, date, quota, num);
                              }}
                              className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected ? 'bg-blue-50 text-blue-950 font-bold' : 'hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <span>{num} {num === 1 ? 'Passenger' : 'Passengers'}</span>
                              {isSelected && <Check className="w-4 h-4 text-blue-700 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Search Trains Action Button */}
                  <button
                    type="button"
                    onClick={() => executeSearch()}
                    disabled={loading}
                    className="px-7 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg hover:shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900 min-h-[44px]"
                  >
                    <Search className="w-4 h-4" aria-hidden="true" />
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
        </div>
      </section>

      {/* RailFlow Journey Context Bar */}
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 mt-4">
        <JourneyContextBar
          fromCode={fromCode}
          fromStationName={fromStation?.name || fromCode}
          toCode={toCode}
          toStationName={toStation?.name || toCode}
          formattedDate={formatDateDisplayLong(date)}
          quotaLabel={quotaLabels[quota]?.replace(' Quota', '') || quota}
          passCount={passCount}
          totalTrains={results.length}
          onModifySearch={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>

      {/* ─── SEARCH RESULTS LIST ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto w-full px-4 sm:px-6 mt-6">
        {/* Academic Sandbox Disclaimer Banner */}
        <div className="mb-4 p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex items-center gap-2.5 text-left">
          <span className="material-symbols-outlined text-primary text-[20px] shrink-0">school</span>
          <span className="text-xs sm:text-sm font-semibold tracking-wider uppercase text-[#00236F] dark:text-blue-200">
            SCHEDULED DATA
          </span>
        </div>

        {loading ? (
          <TrainResultSkeleton count={3} />
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
              className="mt-4 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer"
            >
              Retry search
            </button>
          </div>
        ) : results.length === 0 ? (
          <NoResultRecovery
            fromCode={fromCode}
            fromName={fromStation?.name || fromCode}
            toCode={toCode}
            toName={toStation?.name || toCode}
            dateStr={date}
            nearbyStations={alternatives?.nearbyStations}
            alternateDates={alternatives?.alternateDates}
            connectingJourneys={alternatives?.connectingJourneys}
            onSelectStation={(role, code) => {
              if (role === 'ORIGIN') {
                setFromCode(code);
                setFromQuery(code);
                executeSearch(code, toCode, date, quota, passCount);
              } else {
                setToCode(code);
                setToQuery(code);
                executeSearch(fromCode, code, date, quota, passCount);
              }
            }}
            onSelectDate={(newDate) => {
              setDate(newDate);
              executeSearch(fromCode, toCode, newDate, quota, passCount);
            }}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {/* ─── FILTER & SORT TOOLBAR ─────────────────────────────────── */}
            <div className="bg-surface-container-low/85 border border-outline-variant/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
              {/* Left: Summary Counter and Active Indicator */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">tune</span>
                <span className="font-bold text-on-surface">
                  Showing {displayedTrains.length} of {results.length} trains
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="ml-2 px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-[11px] font-bold border border-outline-variant/40 flex items-center gap-1 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">close</span>
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* Right: Filter & Sort Controls */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full md:w-auto">
                {/* Train Type Filter */}
                <div className="relative">
                  <select
                    value={filterTrainType}
                    onChange={(e) => setFilterTrainType(e.target.value)}
                    aria-label="Filter by train type"
                    className={`h-10 pl-3 pr-8 rounded-xl border text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer appearance-none transition-colors ${
                      filterTrainType !== 'ALL'
                        ? 'bg-primary-fixed/30 border-primary text-primary font-bold ring-1 ring-primary/40'
                        : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface font-semibold hover:border-outline-variant'
                    }`}
                  >
                    <option value="ALL">All Train Types</option>
                    {availableTrainTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined text-[16px] text-outline absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
                    expand_more
                  </span>
                </div>

                {/* Class Filter */}
                <div className="relative">
                  <select
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    aria-label="Filter by travel class"
                    className={`h-10 pl-3 pr-8 rounded-xl border text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer appearance-none transition-colors ${
                      filterClass !== 'ALL'
                        ? 'bg-primary-fixed/30 border-primary text-primary font-bold ring-1 ring-primary/40'
                        : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface font-semibold hover:border-outline-variant'
                    }`}
                  >
                    <option value="ALL">All Classes</option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Class {cls}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined text-[16px] text-outline absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
                    expand_more
                  </span>
                </div>

                {/* Departure Time of Day Filter */}
                <div className="relative">
                  <select
                    value={filterTimeOfDay}
                    onChange={(e) => setFilterTimeOfDay(e.target.value)}
                    aria-label="Filter by departure time"
                    className={`h-10 pl-3 pr-8 rounded-xl border text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer appearance-none transition-colors ${
                      filterTimeOfDay !== 'ALL'
                        ? 'bg-primary-fixed/30 border-primary text-primary font-bold ring-1 ring-primary/40'
                        : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface font-semibold hover:border-outline-variant'
                    }`}
                  >
                    <option value="ALL">Any Time</option>
                    <option value="EARLY">Early Morning (12am - 6am)</option>
                    <option value="MORNING">Morning (6am - 12pm)</option>
                    <option value="AFTERNOON">Afternoon (12pm - 6pm)</option>
                    <option value="NIGHT">Night (6pm - 12am)</option>
                  </select>
                  <span className="material-symbols-outlined text-[16px] text-outline absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
                    expand_more
                  </span>
                </div>

                {/* Sort By Selector */}
                <div className="relative shrink-0">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    aria-label="Sort trains by"
                    className="h-10 pl-3.5 pr-8 rounded-xl bg-primary hover:bg-primary/95 text-on-primary font-bold text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer appearance-none whitespace-nowrap shadow-xs transition-colors"
                  >
                    <option value="DEPARTURE_ASC">Departure: Earliest</option>
                    <option value="DEPARTURE_DESC">Departure: Latest</option>
                    <option value="DURATION_ASC">Duration: Fastest</option>
                    <option value="FARE_ASC">Fare: Lowest Price</option>
                  </select>
                  <span className="material-symbols-outlined text-[16px] text-on-primary absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
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
                  selectedClasses[trainResult.trainRunId] ||
                  (trainResult.classes && Object.keys(trainResult.classes)[0]) ||
                  '3A';
                const isRouteOpen = expandedRoutes[trainResult.trainRunId] || false;

                const staticFare = getStaticTrainFareInfo(trainResult, passCount);

                return (
                  <TrainResultCard
                    key={trainResult.trainRunId}
                    trainResult={trainResult}
                    selectedClass={selectedClass}
                    passCount={passCount}
                    isRouteOpen={isRouteOpen}
                    staticFare={staticFare}
                    onSelectClass={(trainRunId, cls) =>
                      setSelectedClasses((prev) => ({
                        ...prev,
                        [trainRunId]: cls,
                      }))
                    }
                    onToggleRoute={(trainRunId) =>
                      setExpandedRoutes((prev) => ({
                        ...prev,
                        [trainRunId]: !prev[trainRunId],
                      }))
                    }
                    onOpenBooking={(train) => handleOpenBooking(train, selectedClass)}
                    onOpenSandboxBooking={(train) => handleOpenSandboxBooking(train)}
                    onOpenSeatMatrix={(train, cls) => handleOpenSeatMatrix(train, cls)}
                  />
                );
              })
            )}
          </div>
        )}
      </section>

      {/* ─── REAL BOOKING MODAL (Bookable Trains) ────────────────────────────── */}
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

      {/* ─── QUICK SANDBOX MODAL (Isolated Simulation for Static Catalog) ───── */}
      {sandboxModalTrain && sandboxFareInfo && (
        <QuickSandboxModal
          isOpen={!!sandboxModalTrain}
          onClose={() => {
            setSandboxModalTrain(null);
            setSandboxFareInfo(null);
          }}
          trainResult={sandboxModalTrain}
          passCount={passCount}
          quota={quota}
          distanceKm={sandboxFareInfo.distanceKm}
          ratePerKm={sandboxFareInfo.ratePerKm}
          estimatedFare={sandboxFareInfo.estimatedFare}
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

      {/* ─── COACH SEAT MAP MODAL ────────────────────────────────────────── */}
      {seatMapModalTrain && (
        <CoachSeatMapModal
          isOpen={!!seatMapModalTrain}
          onClose={() => setSeatMapModalTrain(null)}
          trainResult={seatMapModalTrain}
          selectedClass={seatMapModalClass}
          passCount={passCount}
          onProceedToBooking={handleProceedFromSeatMatrix}
        />
      )}
    </div>
  );
};
