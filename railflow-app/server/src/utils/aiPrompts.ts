/**
 * RailFlow AI Prompt Utilities (Server Mirror)
 * Generates dynamic questions and quick action suggestions based on user search state.
 */

export interface AiSearchContext {
  fromCode?: string;
  fromName?: string;
  toCode?: string;
  toName?: string;
  date?: string;
  quota?: string;
  passengers?: number;
}

/**
 * Generates the "Find the cheapest available option" prompt dynamically from the current search state.
 * If origin or destination is missing, asks the user to complete the search.
 * Never uses hard-coded stations like "Kanpur".
 */
export function buildCheapestOptionPrompt(context?: AiSearchContext | null): string {
  if (!context) {
    return 'Please select both origin and destination stations to find the cheapest option.';
  }

  const from = context.fromCode?.trim();
  const to = context.toCode?.trim();

  if (!from || !to) {
    return 'Please select both origin and destination stations to find the cheapest option.';
  }

  const fromLabel =
    context.fromName && context.fromName.toUpperCase() !== from.toUpperCase()
      ? `${context.fromName} (${from.toUpperCase()})`
      : from.toUpperCase();

  const toLabel =
    context.toName && context.toName.toUpperCase() !== to.toUpperCase()
      ? `${context.toName} (${to.toUpperCase()})`
      : to.toUpperCase();

  const dateStr = context.date ? ` for ${context.date}` : '';
  const quota = context.quota ? context.quota.toUpperCase() : 'GENERAL';
  const pax = context.passengers && context.passengers > 0 ? context.passengers : 1;
  const paxStr = ` for ${pax} passenger${pax === 1 ? '' : 's'}`;

  return `What is the cheapest train and class from ${fromLabel} to ${toLabel}${dateStr} under ${quota} quota${paxStr}?`;
}

export interface SuggestedPromptItem {
  icon: string;
  label: string;
  prompt: string;
}

/**
 * Returns the contextual suggested prompt items for the AI Assistant drawer.
 */
export function getSuggestedPrompts(context?: AiSearchContext | null): SuggestedPromptItem[] {
  const from = context?.fromCode?.trim()?.toUpperCase();
  const to = context?.toCode?.trim()?.toUpperCase();
  const fromLabel = context?.fromName || from;
  const toLabel = context?.toName || to;
  const dateStr = context?.date ? ` for ${context.date}` : '';

  return [
    {
      icon: 'train',
      label: 'Find trains between two stations',
      prompt:
        from && to
          ? `Find trains from ${fromLabel} to ${toLabel}${dateStr}`
          : 'Find trains from New Delhi to Varanasi for tomorrow',
    },
    {
      icon: 'currency_rupee',
      label: 'Find the cheapest available option',
      prompt: buildCheapestOptionPrompt(context),
    },
    {
      icon: 'schedule',
      label: 'Compare departure and arrival times',
      prompt:
        from && to
          ? `Compare morning and evening departure times from ${from} to ${to}`
          : 'Compare morning and evening departure times from NDLS to BSB',
    },
    {
      icon: 'receipt_long',
      label: 'Explain a fare breakdown',
      prompt:
        from && to
          ? `Explain the fare breakdown for an express train from ${from} to ${to}`
          : 'Explain the fare breakdown for Vande Bharat 22436 Chair Car from NDLS to BSB',
    },
    {
      icon: 'confirmation_number',
      label: 'Check my RailFlow booking',
      prompt: 'Check the status of my latest RailFlow booking',
    },
  ];
}
