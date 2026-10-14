export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  trainResults?: AiTrainSummary[];
  isError?: boolean;
  isFallback?: boolean;
  actionParams?: {
    from: string;
    to: string;
    date?: string;
    label?: string;
  };
}

export interface AiTrainSummary {
  trainNumber: string;
  trainName: string;
  trainType: string;
  scheduleId?: string;
  trainRunId?: string;
  fromStationCode?: string;
  toStationCode?: string;
  journeyDate?: string;
  departureTime: string;
  arrivalTime: string | null;
  duration: string;
  distanceKm: number;
  classes: Record<
    string,
    {
      available: number;
      fareRupees: number;
    }
  >;
}

export interface AiStatus {
  available: boolean;
  provider: string;
  model: string;
  freeTierEligible: boolean;
  hasSession: boolean;
}
