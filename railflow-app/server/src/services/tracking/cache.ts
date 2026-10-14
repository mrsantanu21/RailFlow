// In-memory TTL cache for train tracking data to respect provider limits
// Features: TTL expiration, in-flight request deduplication, and quota rate-limit cooling.

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
  ttlMs: number;
}

export interface QuotaState {
  remainingMonth: number | null;
  remainingMin: number | null;
  lastUpdated: number;
  blockedUntil: number; // For 429 backoff
}

export class TrackingCache {
  private cache = new Map<string, CacheEntry<any>>();
  private inflight = new Map<string, Promise<any>>();
  private quota: QuotaState = {
    remainingMonth: null,
    remainingMin: null,
    lastUpdated: 0,
    blockedUntil: 0,
  };

  constructor(private defaultTtlMs: number = 60 * 1000) {} // default 60 seconds

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      cachedAt: Date.now(),
      ttlMs: ttlMs || this.defaultTtlMs,
    });
  }

  getAgeSeconds(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return 0;
    return Math.floor((Date.now() - entry.cachedAt) / 1000);
  }

  // Deduplicate concurrent in-flight requests for the exact same key
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    if (this.inflight.has(key)) {
      return (await this.inflight.get(key)) as T;
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        this.set(key, result, ttlMs);
        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  // Quota & Rate Limit Management
  updateQuota(remainingMonth?: number | null, remainingMin?: number | null) {
    if (remainingMonth !== undefined && remainingMonth !== null) {
      this.quota.remainingMonth = remainingMonth;
    }
    if (remainingMin !== undefined && remainingMin !== null) {
      this.quota.remainingMin = remainingMin;
    }
    this.quota.lastUpdated = Date.now();
  }

  setQuotaCooldown(cooldownMs: number = 60 * 1000) {
    this.quota.blockedUntil = Date.now() + cooldownMs;
  }

  isQuotaCooldown(): boolean {
    return Date.now() < this.quota.blockedUntil;
  }

  getQuota(): Readonly<QuotaState> {
    return { ...this.quota };
  }

  clear(): void {
    this.cache.clear();
    this.inflight.clear();
    this.quota.blockedUntil = 0;
  }
}


export const trackingCache = new TrackingCache(60 * 1000); // 60s default TTL
export const CACHE_TTL_LIVE = 60 * 1000;              // 60s for live running status
export const CACHE_TTL_ROUTE = 24 * 60 * 60 * 1000;    // 24 hours for static route geometry
export const CACHE_TTL_STATION_BOARD = 3 * 60 * 1000;  // 3 minutes for station live board
export const CACHE_TTL_BETWEEN = 30 * 60 * 1000;       // 30 minutes for trains between stations

