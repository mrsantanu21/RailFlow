import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatameetHttpError } from '../services/datameet/errors';
import { fetchJsonFile } from '../services/datameet/httpClient';
import { datameetCatalog } from '../services/datameet/catalogStore';
import { datameetService } from '../services/datameet/datameetService';

const fixtureStations = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [77.22, 28.64] },
      properties: { state: 'Delhi', code: 'NDLS', name: 'New Delhi', zone: 'NR', address: 'New Delhi' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [82.98, 25.32] },
      properties: { state: 'Uttar Pradesh', code: 'BSB', name: 'Varanasi Jn', zone: 'NR', address: 'Varanasi' },
    },
  ],
};

const fixtureTrains = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.22, 28.64],
          [80.35, 26.45],
          [82.98, 25.32],
        ],
      },
      properties: {
        number: '12301',
        name: 'Howrah Rajdhani Fixture',
        type: 'Raj',
        from_station_code: 'NDLS',
        from_station_name: 'NEW DELHI',
        to_station_code: 'BSB',
        to_station_name: 'VARANASI JN',
        departure: '16:50:00',
        arrival: '05:00:00',
        duration_h: 12,
        duration_m: 10,
        distance: 755,
        third_ac: true,
        sleeper: true,
      },
    },
  ],
};

const fixtureSchedules = [
  {
    arrival: 'None',
    day: 1,
    train_name: 'Howrah Rajdhani Fixture',
    station_name: 'NEW DELHI',
    station_code: 'NDLS',
    id: 1,
    train_number: '12301',
    departure: '16:50:00',
  },
  {
    arrival: '22:00:00',
    day: 1,
    train_name: 'Howrah Rajdhani Fixture',
    station_name: 'KANPUR CENTRAL',
    station_code: 'CNB',
    id: 2,
    train_number: '12301',
    departure: '22:05:00',
  },
  {
    arrival: '05:00:00',
    day: 2,
    train_name: 'Howrah Rajdhani Fixture',
    station_name: 'VARANASI JN',
    station_code: 'BSB',
    id: 3,
    train_number: '12301',
    departure: 'None',
  },
];

describe('DataMeet static catalog adapter', () => {
  beforeEach(() => {
    datameetService.resetForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    datameetService.resetForTests();
    vi.restoreAllMocks();
  });

  it('maps stations, trains, and intermediate-stop search without fabricating platforms or fares', async () => {
    datameetService.hydrateForTests({
      stations: fixtureStations,
      trains: fixtureTrains,
      schedules: fixtureSchedules,
    });

    const stations = await datameetService.searchStations('ndl');
    expect(stations[0].code).toBe('NDLS');
    expect(stations[0].latitude).toBe(28.64);
    expect(stations[0].provenance.source).toBe('DATAMEET_OPEN_DATA');
    expect(stations[0].provenance.isOfficial).toBe(false);
    expect(stations[0].provenance.isLive).toBe(false);

    const trains = await datameetService.searchTrainsBetween('NDLS', 'BSB', '2026-10-13');
    expect(trains).toHaveLength(1);
    expect(trains[0].bookable).toBe(false);
    expect(trains[0].train.number).toBe('12301');
    expect(trains[0].classes).toEqual({});
    expect(trains[0].route.stops.every((s) => s.platform === null)).toBe(true);
    expect(trains[0].journey.departureTime).toBe('16:50:00');
    expect(trains[0].journey.arrivalTime).toBe('05:00:00');
  });

  it('returns static route geometry from published LineString coordinates only', async () => {
    datameetService.hydrateForTests({
      stations: fixtureStations,
      trains: fixtureTrains,
      schedules: fixtureSchedules,
    });
    const geometry = await datameetService.getRouteGeometry('12301');
    expect(geometry).not.toBeNull();
    expect(geometry?.geojson.geometry.coordinates.length).toBe(3);
    expect(geometry?.meta.source).toBe('DATAMEET_OPEN_DATA');
  });

  it('station board uses scheduled times and never invents platform or delay', async () => {
    datameetService.hydrateForTests({
      stations: fixtureStations,
      trains: fixtureTrains,
      schedules: fixtureSchedules,
    });
    const board = await datameetService.getScheduledStationBoard('NDLS');
    expect(board?.trains[0].platform).toBeNull();
    expect(board?.trains[0].delayMinutes).toBeNull();
    expect(board?.trains[0].expectedDepartureTime).toBeNull();
    expect(board?.meta.source).toBe('DATAMEET_OPEN_DATA');
  });

  it('maps 401, 404, 429, and timeout honestly', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    await expect(fetchJsonFile('https://example.test/stations.json', { maxRetries: 0 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('missing', { status: 404, statusText: 'Not Found' })
    );
    await expect(fetchJsonFile('https://example.test/missing.json', { maxRetries: 0 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('slow down', { status: 429, statusText: 'Too Many Requests' })
    );
    await expect(fetchJsonFile('https://example.test/stations.json', { maxRetries: 0 })).rejects.toBeInstanceOf(
      DatameetHttpError
    );

    vi.spyOn(global, 'fetch').mockImplementationOnce(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });
    await expect(fetchJsonFile('https://example.test/stations.json', { maxRetries: 0, timeoutMs: 10 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('does not fetch GitHub during unit tests unless a fixture is hydrated', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const stations = await datameetService.searchStations('NDLS');
    expect(stations).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(datameetCatalog.getSnapshot()).toBeNull();
  });
});
