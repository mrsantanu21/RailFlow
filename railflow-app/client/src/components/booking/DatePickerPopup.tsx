import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isBefore,
  startOfDay,
  parseISO,
} from 'date-fns';

interface DatePickerPopupProps {
  selectedDate: string; // 'YYYY-MM-DD'
  onSelectDate: (dateStr: string) => void;
  isOpen: boolean;
  onClose: () => void;
  minDateStr?: string; // 'YYYY-MM-DD', default today
}

export const DatePickerPopup: React.FC<DatePickerPopupProps> = ({
  selectedDate,
  onSelectDate,
  isOpen,
  onClose,
  minDateStr,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openUpward, setOpenUpward] = useState(false);
  const [maxHeightStyle, setMaxHeightStyle] = useState<number | undefined>(undefined);

  // Parse current selected date safely
  const initialDate = React.useMemo(() => {
    try {
      return selectedDate ? parseISO(selectedDate) : new Date();
    } catch {
      return new Date();
    }
  }, [selectedDate]);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(initialDate));

  // Sync current month view when selectedDate changes externally (e.g. Quick Date buttons)
  useEffect(() => {
    if (selectedDate) {
      try {
        setCurrentMonth(startOfMonth(parseISO(selectedDate)));
      } catch {
        // keep current
      }
    }
  }, [selectedDate]);

  // Smart Viewport-aware collision detection & positioning
  const checkPosition = () => {
    if (!containerRef.current) return;
    const parentEl = containerRef.current.parentElement;
    if (!parentEl) return;
    const parentRect = parentEl.getBoundingClientRect();
    const popoverHeight = containerRef.current.offsetHeight || 360;

    // Fixed navbar top buffer (h-20 = 80px + 8px safety clearance)
    const TOP_NAVBAR_CLEARANCE = 88;
    const BOTTOM_MARGIN = 16;

    const spaceAbove = parentRect.top - TOP_NAVBAR_CLEARANCE;
    const spaceBelow = window.innerHeight - parentRect.bottom - BOTTOM_MARGIN;

    // Strict Flipping Rule:
    // Only flip upward if:
    // 1. Insufficient space below to display the calendar
    // 2. AND there is strictly sufficient clearance above without clipping into the navbar/screen top
    // If there is insufficient space above, force it to render entirely below the trigger button.
    const canFitAbove = spaceAbove >= popoverHeight;
    const canFitBelow = spaceBelow >= popoverHeight;

    let upward = false;
    if (!canFitBelow && canFitAbove) {
      upward = true;
    } else {
      upward = false;
    }

    setOpenUpward(upward);

    // Compute constrained max height to guarantee it never overflows viewport boundaries
    const availableHeight = upward ? spaceAbove : spaceBelow;
    const constrainedHeight = Math.max(220, Math.min(380, availableHeight));
    setMaxHeightStyle(constrainedHeight);
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    checkPosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', checkPosition);
    window.addEventListener('scroll', checkPosition, true);
    return () => {
      window.removeEventListener('resize', checkPosition);
      window.removeEventListener('scroll', checkPosition, true);
    };
  }, [isOpen]);

  // Handle outside click & escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const parentEl = containerRef.current?.parentElement;
      // Do not trigger onClose if click originated within popup or the parent trigger card
      if (
        containerRef.current?.contains(e.target as Node) ||
        parentEl?.contains(e.target as Node)
      ) {
        return;
      }
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const today = startOfDay(new Date());
  const minDate = minDateStr ? startOfDay(parseISO(minDateStr)) : today;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleYearChange = (year: number) => {
    const updated = new Date(currentMonth);
    updated.setFullYear(year);
    setCurrentMonth(updated);
  };

  const handleMonthChange = (monthIdx: number) => {
    const updated = new Date(currentMonth);
    updated.setMonth(monthIdx);
    setCurrentMonth(updated);
  };

  const currentYear = currentMonth.getFullYear();
  const currentMonthIdx = currentMonth.getMonth();

  // Range of years for dropdown
  const thisYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 4 }, (_, i) => thisYear + i);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div
      ref={containerRef}
      style={{
        maxHeight: maxHeightStyle ? `${maxHeightStyle}px` : undefined,
      }}
      className={`absolute ${
        openUpward ? 'bottom-full mb-2' : 'top-full mt-2'
      } right-0 sm:right-0 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 text-slate-900 dark:text-slate-100 z-50`}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Departure Date Calendar"
    >
      {/* Month & Year Navigation Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <select
            value={currentMonthIdx}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
            className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            aria-label="Select month"
          >
            {monthNames.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={currentYear}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            aria-label="Select year"
          >
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600"
            title="Previous Month"
            aria-label="Previous Month"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600"
            title="Next Month"
            aria-label="Next Month"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {weekDayLabels.map((day) => (
          <div key={day} className="text-[11px] font-bold text-slate-400 dark:text-slate-500 py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, initialDate);
          const isToday = isSameDay(day, today);
          const isDisabled = isBefore(day, minDate);

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  onSelectDate(dateStr);
                  onClose();
                }
              }}
              className={`h-8 w-8 mx-auto text-xs font-semibold rounded-lg flex items-center justify-center transition-all relative focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                !isCurrentMonth
                  ? 'text-slate-300 dark:text-slate-600'
                  : isDisabled
                  ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed line-through'
                  : isSelected
                  ? 'bg-blue-600 text-white font-bold shadow-md hover:bg-blue-700'
                  : 'text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 cursor-pointer'
              } ${isToday && !isSelected ? 'ring-1 ring-blue-500 font-bold' : ''}`}
              aria-label={format(day, 'EEEE, d MMMM yyyy')}
              aria-pressed={isSelected}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      {/* Footer quick action */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={() => {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            onSelectDate(todayStr);
            onClose();
          }}
          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600 rounded px-1"
        >
          Select Today
        </button>
        <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">
          {selectedDate ? format(parseISO(selectedDate), 'dd MMM yyyy') : ''}
        </span>
      </div>
    </div>
  );
};
