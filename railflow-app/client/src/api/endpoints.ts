import { apiClient } from './client';
import type {
  Station,
  TrainSearchResult,
  FareQuote,
  User,
  Booking,
  PassengerInput,
  AdminSummary,
  NormalizedRunningStatus,
  TrackableTrain,
  TrackingAudit,
  RailRadarRouteGeometry,
  StationLiveBoardResponse,
  TrainsBetweenResult,
} from '../types';

export async function searchStations(q: string = ''): Promise<Station[]> {
  const res = await apiClient.get('/stations', { params: { q, limit: 15 } });
  return res.data?.data?.stations || [];
}

export async function getStation(idOrCode: string): Promise<Station> {
  const res = await apiClient.get(`/stations/${idOrCode}`);
  return res.data?.data?.station;
}

export interface AdvancedSearchResult {
  trains: TrainSearchResult[];
  alternatives?: {
    nearbyStations?: Array<{
      stationCode: string;
      stationName: string;
      role: 'ORIGIN' | 'DESTINATION';
      relation: string;
      directTrainsCount: number;
      searchUrl: string;
    }>;
    alternateDates?: Array<{
      date: string;
      dayLabel: string;
      directTrainsCount: number;
      isToday: boolean;
      searchUrl: string;
    }>;
    connectingJourneysAvailable?: boolean;
    connectingJourneys?: Array<{
      id: string;
      transferStation: { code: string; name: string };
      totalDurationMin: number;
      layoverMin: number;
      leg1: any;
      leg2: any;
    }>;
  };
  fromStation?: { code: string; name: string };
  toStation?: { code: string; name: string };
  meta?: any;
}

export async function searchTrains(params: {
  fromStationCode: string;
  toStationCode: string;
  date: string;
  classType?: string;
  quota?: string;
  passCount?: number;
}): Promise<TrainSearchResult[]> {
  const res = await apiClient.get('/trains', { params });
  return res.data?.data?.results || [];
}

export async function searchTrainsWithAlternatives(params: {
  fromStationCode: string;
  toStationCode: string;
  date: string;
  classType?: string;
  quota?: string;
  passCount?: number;
}): Promise<AdvancedSearchResult> {
  const res = await apiClient.get('/trains', { params });
  return {
    trains: res.data?.data?.results || res.data?.data?.trains || [],
    alternatives: res.data?.data?.alternatives,
    fromStation: res.data?.data?.fromStation,
    toStation: res.data?.data?.toStation,
    meta: res.data?.data?.meta,
  };
}

export async function lookupTrains(q: string): Promise<any[]> {
  const res = await apiClient.get('/trains/lookup', { params: { q } });
  return res.data?.data?.trains || [];
}

export async function getFareQuote(params: {
  scheduleId: string;
  fromStationCode: string;
  toStationCode: string;
  classType: string;
  passengers?: number;
  includeCatering?: boolean;
}): Promise<FareQuote> {
  const res = await apiClient.get('/fares/quote', { params });
  return res.data?.data?.fare;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await apiClient.get('/auth/me');
    return res.data?.data?.user || null;
  } catch {
    return null;
  }
}

export async function login(credentials: { email: string; password: string }): Promise<User> {
  const res = await apiClient.post('/auth/login', credentials);
  return res.data?.data?.user;
}

export async function register(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<User> {
  const res = await apiClient.post('/auth/register', data);
  return res.data?.data?.user;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function createBooking(data: {
  trainRunId: string;
  scheduleId: string;
  fromStationCode: string;
  toStationCode: string;
  classType: string;
  quotaType?: string;
  includeCatering?: boolean;
  passengers: PassengerInput[];
}): Promise<Booking> {
  const res = await apiClient.post('/bookings', data);
  return res.data?.data?.booking;
}

export async function getBookingByPNR(pnr: string): Promise<Booking> {
  const res = await apiClient.get(`/bookings/pnr/${pnr}`);
  return res.data?.data?.booking;
}

export async function getBookingById(id: string): Promise<Booking> {
  const res = await apiClient.get(`/bookings/${id}`);
  return res.data?.data?.booking;
}

export async function cancelBooking(id: string, reason?: string): Promise<any> {
  const res = await apiClient.post(`/bookings/${id}/cancel`, { reason });
  return res.data?.data;
}

export async function getMyBookings(page = 1, limit = 20): Promise<{ bookings: Booking[]; total: number }> {
  const res = await apiClient.get('/bookings', { params: { page, limit } });
  return {
    bookings: res.data?.data?.bookings || [],
    total: res.data?.data?.pagination?.total || 0,
  };
}

export async function createPayment(data: {
  bookingId: string;
  method?: string;
}): Promise<any> {
  const res = await apiClient.post('/payments/initialize', data);
  const d = res.data?.data;
  return { id: d?.paymentId || d?.id, ...d };
}

export async function simulatePaymentResult(
  transactionId: string,
  outcome: 'SUCCESS' | 'FAILED'
): Promise<any> {
  const res = await apiClient.post(`/payments/${transactionId}/simulate-result`, {
    outcome,
    failureReason: outcome === 'FAILED' ? 'Bank server timeout (simulated)' : undefined,
  });
  return res.data?.data;
}

export async function getAdminSummary(): Promise<AdminSummary> {
  const res = await apiClient.get('/admin/reports/summary');
  return res.data?.data?.summary;
}

export async function getAdminBookings(page: number = 1, limit: number = 20): Promise<any> {
  const res = await apiClient.get('/admin/bookings', { params: { page, limit } });
  return res.data?.data;
}

export async function getTrainRunningStatus(trainNumber: string, date?: string): Promise<NormalizedRunningStatus> {
  const res = await apiClient.get(`/tracking/${encodeURIComponent(trainNumber)}`, {
    params: date ? { date } : undefined,
  });
  return res.data?.data?.status;
}

export async function getActiveTrackableTrains(): Promise<TrackableTrain[]> {
  const res = await apiClient.get('/tracking/active-trains');
  return res.data?.data?.trains || [];
}

export async function getTrackingAudit(): Promise<TrackingAudit> {
  const res = await apiClient.get('/tracking/audit');
  return res.data?.data?.audit;
}

export async function getTrainRouteGeometry(trainNumber: string): Promise<RailRadarRouteGeometry> {
  const res = await apiClient.get(`/tracking/${encodeURIComponent(trainNumber)}/route`);
  return res.data?.data?.geometry;
}

export async function getStationLiveBoard(stationCode: string, hours = 4): Promise<StationLiveBoardResponse> {
  const res = await apiClient.get(`/tracking/stations/${encodeURIComponent(stationCode)}/live`, {
    params: { hours },
  });
  return res.data?.data?.board;
}

export async function getTrainsBetweenStations(from: string, to: string): Promise<TrainsBetweenResult> {
  const res = await apiClient.get(`/tracking/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
  return res.data?.data?.result;
}


// ─── ADMIN CRUD ENDPOINTS ───────────────────────────────────────────────────

export async function getAdminTrains(): Promise<any[]> {
  const res = await apiClient.get('/admin/trains');
  return res.data?.data?.trains || [];
}

export async function createAdminTrain(data: {
  number: string;
  name: string;
  type: string;
  isActive?: boolean;
}): Promise<any> {
  const res = await apiClient.post('/admin/trains', data);
  return res.data?.data?.train;
}

export async function updateAdminTrain(
  id: string,
  data: { number?: string; name?: string; type?: string; isActive?: boolean }
): Promise<any> {
  const res = await apiClient.put(`/admin/trains/${id}`, data);
  return res.data?.data?.train;
}

export async function deleteAdminTrain(id: string): Promise<void> {
  await apiClient.delete(`/admin/trains/${id}`);
}

export async function getAdminStations(): Promise<Station[]> {
  const res = await apiClient.get('/admin/stations');
  return res.data?.data?.stations || [];
}

export async function createAdminStation(data: {
  code: string;
  name: string;
  fullName: string;
  zone: string;
  state: string;
  isActive?: boolean;
}): Promise<Station> {
  const res = await apiClient.post('/admin/stations', data);
  return res.data?.data?.station;
}

export async function updateAdminStation(
  id: string,
  data: Partial<Station>
): Promise<Station> {
  const res = await apiClient.put(`/admin/stations/${id}`, data);
  return res.data?.data?.station;
}

export async function getAdminRoutes(): Promise<any[]> {
  const res = await apiClient.get('/admin/routes');
  return res.data?.data?.routes || [];
}

export async function createAdminRoute(data: {
  name: string;
  isActive?: boolean;
}): Promise<any> {
  const res = await apiClient.post('/admin/routes', data);
  return res.data?.data?.route;
}

export async function updateAdminRoute(
  id: string,
  data: { name?: string; isActive?: boolean }
): Promise<any> {
  const res = await apiClient.put(`/admin/routes/${id}`, data);
  return res.data?.data?.route;
}

