import { DatameetHttpError, mapUpstreamStatus } from './errors';

export interface FetchJsonOptions {
  timeoutMs?: number;
  maxRetries?: number;
  apiKey?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return asInt * 1000;
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

export async function fetchJsonFile<T>(url: string, options: FetchJsonOptions = {}): Promise<{
  data: T;
  cachedHint: boolean;
  lastModified: string | null;
}> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.DATAMEET_REQUEST_TIMEOUT_MS || 120000);
  const maxRetries = options.maxRetries ?? Number(process.env.DATAMEET_MAX_RETRIES || 2);
  const apiKey = options.apiKey ?? process.env.RAILWAY_API_KEY;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'RailFlow-Academic/1.0 (DataMeet static catalog adapter)',
    };
    if (apiKey && apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    try {
      const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
      if (!response.ok) {
        const preview = await response.text().catch(() => '');
        const mapped = mapUpstreamStatus(response.status, preview);
        if (mapped.code === 'RATE_LIMIT') {
          const waitMs = parseRetryAfterMs(response.headers.get('retry-after')) ?? 2000 * (attempt + 1);
          lastError = mapped;
          if (attempt < maxRetries) {
            await sleep(Math.min(waitMs, 15000));
            continue;
          }
          throw mapped;
        }
        if (mapped.retryable && attempt < maxRetries) {
          lastError = mapped;
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw mapped;
      }

      const text = await response.text();
      const data = JSON.parse(text) as T;
      return {
        data,
        cachedHint: /hit|cache/i.test(response.headers.get('x-cache') || ''),
        lastModified: response.headers.get('last-modified'),
      };
    } catch (err) {
      if (err instanceof DatameetHttpError) {
        throw err;
      }
      const name = (err as Error).name;
      const isTimeout = name === 'AbortError';
      lastError = isTimeout
        ? new DatameetHttpError(`DataMeet catalog request timed out after ${timeoutMs}ms`, 504, 'TIMEOUT', true)
        : new DatameetHttpError(
            `DataMeet catalog network error: ${(err as Error).message}`,
            503,
            'NETWORK_ERROR',
            true
          );
      if (attempt < maxRetries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new DatameetHttpError('DataMeet catalog request failed', 503, 'NETWORK_ERROR', true);
}
