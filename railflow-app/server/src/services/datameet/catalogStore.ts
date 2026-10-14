import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchJsonFile } from './httpClient';
import { mapScheduleRow, mapStationFeature, mapTrainFeature } from './mappers';
import {
  DatameetCatalogSnapshot,
  DatameetScheduleStop,
  DatameetStation,
  DatameetTrain,
} from './types';

export type DatasetName = 'stations' | 'trains' | 'schedules';

interface GeoJsonCollection {
  type?: string;
  features?: any[];
}

export class DatameetCatalogStore {
  private snapshot: DatameetCatalogSnapshot | null = null;
  private inflight: Promise<DatameetCatalogSnapshot> | null = null;
  private blockedUntil = 0;

  getBaseUrl(): string {
    return (process.env.RAILWAY_API_BASE_URL || 'https://raw.githubusercontent.com/datameet/railways/master').replace(
      /\/+$/,
      ''
    );
  }

  isEnabled(): boolean {
    if (process.env.NODE_ENV === 'test' && process.env.DATAMEET_FORCE === 'true') {
      return true;
    }
    if (process.env.NODE_ENV === 'test') {
      return Boolean(this.snapshot);
    }
    const flag = process.env.DATAMEET_ENABLED;
    if (flag === 'false' || flag === '0') return false;
    return flag === 'true' || flag === '1' || !flag;
  }

  isRateLimited(): boolean {
    return Date.now() < this.blockedUntil;
  }

  setRateLimitCooldown(ms: number): void {
    this.blockedUntil = Date.now() + ms;
  }

  getSnapshot(): DatameetCatalogSnapshot | null {
    return this.snapshot;
  }

  hydrate(payload: { stations?: any; trains?: any; schedules?: any }, cached = true): DatameetCatalogSnapshot {
    const snapshot = this.buildSnapshot(payload, cached);
    this.snapshot = snapshot;
    return snapshot;
  }

  reset(): void {
    this.snapshot = null;
    this.inflight = null;
    this.blockedUntil = 0;
  }

  async ensureLoaded(datasets: DatasetName[] = ['stations', 'trains', 'schedules']): Promise<DatameetCatalogSnapshot | null> {
    if (!this.isEnabled()) return this.snapshot;
    if (this.snapshot && datasets.every((name) => this.snapshot!.datasets.includes(name))) {
      return this.snapshot;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.load(datasets)
      .catch((err) => {
        this.inflight = null;
        throw err;
      })
      .then((snap) => {
        this.inflight = null;
        return snap;
      });
    return this.inflight;
  }

  private cacheDir(): string {
    return process.env.DATAMEET_CACHE_DIR || path.join(process.cwd(), 'data', 'datameet');
  }

  private cacheTtlMs(): number {
    const hours = Number(process.env.DATAMEET_CACHE_TTL_HOURS || 168);
    return hours * 60 * 60 * 1000;
  }

  private async readCache(file: string): Promise<any | null> {
    try {
      const full = path.join(this.cacheDir(), file);
      const stat = await fs.stat(full);
      if (Date.now() - stat.mtimeMs > this.cacheTtlMs()) return null;
      const raw = await fs.readFile(full, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async writeCache(file: string, data: unknown): Promise<void> {
    try {
      const dir = this.cacheDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, file), JSON.stringify(data));
    } catch (err) {
      console.warn('[DataMeet] disk cache write skipped:', (err as Error).message);
    }
  }

  private async loadFile(name: DatasetName): Promise<{ payload: any; fromCache: boolean }> {
    const file = `${name}.json`;
    const cached = await this.readCache(file);
    if (cached) {
      return { payload: cached, fromCache: true };
    }
    if (this.isRateLimited()) {
      throw new Error('DataMeet catalog cooldown active after upstream 429.');
    }
    const url = `${this.getBaseUrl()}/${file}`;
    try {
      const result = await fetchJsonFile<any>(url);
      await this.writeCache(file, result.data);
      return { payload: result.data, fromCache: result.cachedHint };
    } catch (err: any) {
      if (err?.code === 'RATE_LIMIT') {
        this.setRateLimitCooldown(60_000);
      }
      throw err;
    }
  }

  private async load(datasets: DatasetName[]): Promise<DatameetCatalogSnapshot> {
    const payload: { stations?: any; trains?: any; schedules?: any } = {};
    let cached = true;
    for (const name of datasets) {
      const { payload: filePayload, fromCache } = await this.loadFile(name);
      payload[name] = filePayload;
      if (!fromCache) cached = false;
    }
    const snapshot = this.buildSnapshot(payload, cached);
    this.snapshot = snapshot;
    return snapshot;
  }

  private buildSnapshot(
    payload: { stations?: any; trains?: any; schedules?: any },
    cached: boolean
  ): DatameetCatalogSnapshot {
    const stations: DatameetStation[] = [];
    const stationsByCode = new Map<string, DatameetStation>();
    const stationCollection = payload.stations as GeoJsonCollection | undefined;
    for (const feature of stationCollection?.features || []) {
      const mapped = mapStationFeature(feature);
      if (!mapped) continue;
      stations.push(mapped);
      stationsByCode.set(mapped.code, mapped);
    }

    const trains: DatameetTrain[] = [];
    const trainsByNumber = new Map<string, DatameetTrain>();
    const trainCollection = payload.trains as GeoJsonCollection | undefined;
    for (const feature of trainCollection?.features || []) {
      const mapped = mapTrainFeature(feature);
      if (!mapped) continue;
      trains.push(mapped);
      trainsByNumber.set(mapped.number, mapped);
    }

    const schedulesByTrain = new Map<string, DatameetScheduleStop[]>();
    const schedulesByStation = new Map<string, DatameetScheduleStop[]>();
    const scheduleRows = Array.isArray(payload.schedules) ? payload.schedules : [];
    for (const row of scheduleRows) {
      const mapped = mapScheduleRow(row);
      if (!mapped) continue;
      const trainStops = schedulesByTrain.get(mapped.trainNumber) || [];
      trainStops.push(mapped);
      schedulesByTrain.set(mapped.trainNumber, trainStops);
      const stationStops = schedulesByStation.get(mapped.stationCode) || [];
      stationStops.push(mapped);
      schedulesByStation.set(mapped.stationCode, stationStops);
    }

    const datasets: DatasetName[] = [];
    if (payload.stations) datasets.push('stations');
    if (payload.trains) datasets.push('trains');
    if (payload.schedules) datasets.push('schedules');

    return {
      stations,
      stationsByCode,
      trains,
      trainsByNumber,
      schedulesByTrain,
      schedulesByStation,
      loadedAt: new Date().toISOString(),
      sourceBaseUrl: this.getBaseUrl(),
      cached,
      datasets,
    };
  }
}

export const datameetCatalog = new DatameetCatalogStore();
