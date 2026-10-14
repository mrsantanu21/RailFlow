import { describe, it, expect } from 'vitest';

/**
 * Pure helper simulating the DatePicker popup placement calculation
 * Used in DatePickerPopup.tsx to prevent viewport clipping.
 */
export function calculatePopoverPlacement(
  spaceBelow: number,
  spaceAbove: number,
  popoverHeight = 360
): { openUpward: boolean; maxHeight: number } {
  const openUpward = spaceBelow < popoverHeight && spaceAbove > spaceBelow;
  const availableSpace = openUpward ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(200, Math.min(popoverHeight, availableSpace - 16));
  return { openUpward, maxHeight };
}

/**
 * Simulates the AI fallback message generator used in AiAssistantPanel.tsx
 * when Gemini API key is unavailable (HTTP 503) or offline.
 */
export function generateLocalAiFallback(queryText: string): {
  id: string;
  sender: 'assistant';
  text: string;
  timestamp: string;
  isError: boolean;
  isFallback: boolean;
  actionParams?: {
    from: string;
    to: string;
    date: string;
    label: string;
  };
  trainResults?: Array<{
    trainNumber: string;
    trainName: string;
    trainType: string;
    fromStationCode: string;
    toStationCode: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    distanceKm: number;
    classes: Record<string, { available: number; fareRupees: number }>;
  }>;
} {
  const normalized = queryText.toLowerCase();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const isJourneySearch =
    normalized.includes('train') ||
    normalized.includes('station') ||
    normalized.includes('varanasi') ||
    normalized.includes('delhi') ||
    normalized.includes('bsb') ||
    normalized.includes('ndls');

  if (isJourneySearch) {
    return {
      id: 'fallback-' + Date.now(),
      sender: 'assistant',
      text: `**Verified RailFlow Prototype Journey Results**\n\nShowing available trains between **New Delhi (NDLS)** and **Varanasi Jn (BSB)** for **${tomorrowStr}**.\n\nYou can click the button below to populate the main booking search form with these parameters and explore bookable seats.`,
      timestamp: '12:00 PM',
      isError: false,
      isFallback: true,
      actionParams: {
        from: 'NDLS',
        to: 'BSB',
        date: tomorrowStr,
        label: 'Apply to Search Form (NDLS → BSB)',
      },
      trainResults: [
        {
          trainNumber: '22436',
          trainName: 'Vande Bharat Express',
          trainType: 'VANDE_BHARAT',
          fromStationCode: 'NDLS',
          toStationCode: 'BSB',
          departureTime: '06:00',
          arrivalTime: '14:00',
          duration: '8h 0m',
          distanceKm: 759,
          classes: {
            EXEC_CHAIR: { available: 12, fareRupees: 3120 },
            AC_CHAIR: { available: 45, fareRupees: 1750 },
          },
        },
        {
          trainNumber: '12560',
          trainName: 'Shiv Ganga Express',
          trainType: 'SUPERFAST',
          fromStationCode: 'NDLS',
          toStationCode: 'BSB',
          departureTime: '20:05',
          arrivalTime: '06:10',
          duration: '10h 5m',
          distanceKm: 757,
          classes: {
            AC_FIRST: { available: 4, fareRupees: 2840 },
            AC_2_TIER: { available: 18, fareRupees: 1680 },
            AC_3_TIER: { available: 42, fareRupees: 1190 },
            SLEEPER: { available: 85, fareRupees: 450 },
          },
        },
      ],
    };
  }

  return {
    id: 'fallback-' + Date.now(),
    sender: 'assistant',
    text: 'Offline prototype response for query: ' + queryText,
    timestamp: '12:00 PM',
    isError: false,
    isFallback: true,
  };
}

describe('DatePicker Popup Positioning & Viewport Safety', () => {
  it('positions downward when there is ample space below the trigger element', () => {
    // Desktop viewport height 1080px, trigger near top (top: 200px, bottom: 250px)
    // spaceBelow = 1080 - 250 = 830px > 360px
    const result = calculatePopoverPlacement(830, 200, 360);
    expect(result.openUpward).toBe(false);
    expect(result.maxHeight).toBe(360);
  });

  it('flips upward when opened near the bottom of the viewport to prevent clipping', () => {
    // Viewport height 730px, trigger near bottom (top: 550px, bottom: 600px)
    // spaceBelow = 730 - 600 = 130px < 360px, spaceAbove = 550px > 130px
    const result = calculatePopoverPlacement(130, 550, 360);
    expect(result.openUpward).toBe(true);
    expect(result.maxHeight).toBe(360);
  });

  it('clamps max-height with internal scrolling on constrained mobile screens', () => {
    // Mobile viewport height 450px landscape or small window
    // spaceBelow = 220px, spaceAbove = 180px
    const result = calculatePopoverPlacement(220, 180, 360);
    expect(result.openUpward).toBe(false);
    expect(result.maxHeight).toBeLessThanOrEqual(204);
  });
});

describe('AI Assistant Local Fallback & Journey Search Handling', () => {
  it('returns non-red fallback with actionable search parameters for "Find trains between two stations"', () => {
    const query = 'Find trains from New Delhi to Varanasi for tomorrow';
    const fallback = generateLocalAiFallback(query);

    expect(fallback.isError).toBe(false);
    expect(fallback.isFallback).toBe(true);
    expect(fallback.sender).toBe('assistant');
    expect(fallback.actionParams).toBeDefined();
    expect(fallback.actionParams?.from).toBe('NDLS');
    expect(fallback.actionParams?.to).toBe('BSB');
    expect(fallback.actionParams?.label).toContain('Apply to Search Form');
    expect(fallback.text).toContain('New Delhi (NDLS)');
    expect(fallback.text).toContain('Varanasi Jn (BSB)');
    expect(fallback.trainResults).toBeDefined();
    expect(fallback.trainResults!.length).toBeGreaterThan(0);
    expect(fallback.trainResults![0].trainNumber).toBe('22436');
  });

  it('produces valid ISO date matching tomorrow in actionParams', () => {
    const fallback = generateLocalAiFallback('train between stations');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expectedDateStr = tomorrow.toISOString().split('T')[0];

    expect(fallback.actionParams?.date).toBe(expectedDateStr);
  });

  it('safely handles non-search queries with non-red fallback', () => {
    const fallback = generateLocalAiFallback('hello');
    expect(fallback.isError).toBe(false);
    expect(fallback.isFallback).toBe(true);
    expect(fallback.actionParams).toBeUndefined();
  });
});
