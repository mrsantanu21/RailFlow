/**
 * RailFlow Shared Time & Date Formatting Utilities (Server Mirror)
 */

export function formatTimeHHmm(
  timeStr: string | null | undefined,
  fallback: string = '—'
): string {
  if (!timeStr) return fallback;

  const trimmed = timeStr.trim();
  if (!trimmed) return fallback;

  if (trimmed.includes('T')) {
    try {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        const hh = String(parsed.getUTCHours()).padStart(2, '0');
        const mm = String(parsed.getUTCMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      }
    } catch {
      // Fall through to regex parsing
    }
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2].padStart(2, '0');
    return `${hh}:${mm}`;
  }

  const matchLeading = trimmed.match(/^(\d{1,2}):(\d{1,2})/);
  if (matchLeading) {
    const hh = matchLeading[1].padStart(2, '0');
    const mm = matchLeading[2].padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return fallback;
}

export interface ArrivalTimeFormatResult {
  time: string;
  isNextDay: boolean;
  dayOffset: number;
  nextDayLabel: string | null;
}

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

  if (explicitDayOffset != null && explicitDayOffset > 0) {
    return {
      time: formattedArr,
      isNextDay: true,
      dayOffset: explicitDayOffset,
      nextDayLabel: `+${explicitDayOffset} Day${explicitDayOffset > 1 ? 's' : ''}`,
    };
  }

  if (departureTime && durationMinutes != null && durationMinutes > 0) {
    const depFormatted = formatTimeHHmm(departureTime, '');
    if (depFormatted) {
      const [depH, depM] = depFormatted.split(':').map(Number);
      const depTotalMin = depH * 60 + depM;
      const arrTotalMin = depTotalMin + durationMinutes;
      const dayOffset = Math.floor(arrTotalMin / (24 * 60));

      if (dayOffset > 0) {
        return {
          time: formattedArr,
          isNextDay: true,
          dayOffset,
          nextDayLabel: `+${dayOffset} Day${dayOffset > 1 ? 's' : ''}`,
        };
      } else {
        return {
          time: formattedArr,
          isNextDay: false,
          dayOffset: 0,
          nextDayLabel: null,
        };
      }
    }
  }

  if (departureTime) {
    const depFormatted = formatTimeHHmm(departureTime, '');
    if (depFormatted && formattedArr) {
      const [depH, depM] = depFormatted.split(':').map(Number);
      const [arrH, arrM] = formattedArr.split(':').map(Number);
      if (arrH < depH || (arrH === depH && arrM < depM)) {
        return {
          time: formattedArr,
          isNextDay: true,
          dayOffset: 1,
          nextDayLabel: '+1 Day',
        };
      }
    }
  }

  return {
    time: formattedArr,
    isNextDay: false,
    dayOffset: 0,
    nextDayLabel: null,
  };
}
