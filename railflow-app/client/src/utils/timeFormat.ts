/**
 * RailFlow Shared Time Formatting Utilities
 * Provides consistent 24-hour HH:mm formatting and next-day arrival calculation.
 */

/**
 * Normalizes any departure/arrival time input to strict 24-hour "HH:mm".
 * Handles inputs with seconds (e.g. "20:40:00"), without seconds (e.g. "06:00", "6:5"),
 * ISO strings, or empty/null values.
 */
export function formatTimeHHmm(timeStr: string | null | undefined, fallback = '—'): string {
  if (!timeStr) return fallback;
  const trimmed = String(timeStr).trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return fallback;

  // Extract time portion if ISO string is provided
  const timePart = trimmed.includes('T')
    ? (trimmed.split('T')[1]?.split(/[Z+-]/)[0] || '')
    : trimmed;

  const match = timePart.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return fallback;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
}

export interface ArrivalTimeFormatResult {
  time: string; // Formatted "HH:mm" or "—"
  isNextDay: boolean;
  dayOffset: number; // 0, 1, 2, ...
  nextDayLabel: string | null; // e.g. "+1 Day", "+2 Days", or null
}

/**
 * Formats arrival time and correctly computes next-day arrivals based on:
 * 1. Explicit day offset (e.g. from timetable schedule stop day differences)
 * 2. Cumulative journey duration in minutes added to departure clock time
 * 3. Fallback clock rollover comparison (if arrival clock is earlier than departure clock)
 */
export function formatArrivalTime(
  arrivalTime: string | null | undefined,
  departureTime?: string | null | undefined,
  durationMinutes?: number | null | undefined,
  explicitDayOffset?: number | null | undefined
): ArrivalTimeFormatResult {
  const formattedArr = formatTimeHHmm(arrivalTime);
  if (formattedArr === '—') {
    return { time: '—', isNextDay: false, dayOffset: 0, nextDayLabel: null };
  }

  // 1. Explicit multi-day offset from schedule master
  if (explicitDayOffset != null && explicitDayOffset > 0) {
    return {
      time: formattedArr,
      isNextDay: true,
      dayOffset: explicitDayOffset,
      nextDayLabel: `+${explicitDayOffset} Day${explicitDayOffset > 1 ? 's' : ''}`,
    };
  }

  // 2. Cumulative duration offset from departure
  if (departureTime && durationMinutes != null && durationMinutes > 0) {
    const depFormatted = formatTimeHHmm(departureTime, '');
    if (depFormatted) {
      const [depH, depM] = depFormatted.split(':').map(Number);
      const depTotalMin = depH * 60 + depM;
      const totalArrivalMin = depTotalMin + durationMinutes;
      const daysPassed = Math.floor(totalArrivalMin / 1440);
      if (daysPassed > 0) {
        return {
          time: formattedArr,
          isNextDay: true,
          dayOffset: daysPassed,
          nextDayLabel: `+${daysPassed} Day${daysPassed > 1 ? 's' : ''}`,
        };
      }
      return { time: formattedArr, isNextDay: false, dayOffset: 0, nextDayLabel: null };
    }
  }

  // 3. Fallback overnight rollover: arrival time earlier than departure time
  if (departureTime) {
    const depFormatted = formatTimeHHmm(departureTime, '');
    if (depFormatted) {
      const [depH, depM] = depFormatted.split(':').map(Number);
      const [arrH, arrM] = formattedArr.split(':').map(Number);
      const depTotalMin = depH * 60 + depM;
      const arrTotalMin = arrH * 60 + arrM;
      if (arrTotalMin < depTotalMin) {
        return {
          time: formattedArr,
          isNextDay: true,
          dayOffset: 1,
          nextDayLabel: '+1 Day',
        };
      }
    }
  }

  return { time: formattedArr, isNextDay: false, dayOffset: 0, nextDayLabel: null };
}
