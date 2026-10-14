export class DatameetHttpError extends Error {
  statusCode: number;
  code: string;
  retryable: boolean;

  constructor(message: string, statusCode: number, code: string, retryable = false) {
    super(message);
    this.name = 'DatameetHttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

export function mapUpstreamStatus(status: number, bodyPreview?: string): DatameetHttpError {
  const suffix = bodyPreview ? ` ${bodyPreview.slice(0, 180)}` : '';
  switch (status) {
    case 401:
      return new DatameetHttpError(
        `DataMeet catalog authentication failed.${suffix}`,
        401,
        'UNAUTHORIZED',
        false
      );
    case 403:
      return new DatameetHttpError(
        `DataMeet catalog access forbidden.${suffix}`,
        403,
        'FORBIDDEN',
        false
      );
    case 404:
      return new DatameetHttpError(
        `DataMeet catalog file not found.${suffix}`,
        404,
        'NOT_FOUND',
        false
      );
    case 429:
      return new DatameetHttpError(
        `DataMeet catalog rate-limited by upstream host.${suffix}`,
        429,
        'RATE_LIMIT',
        true
      );
    default:
      if (status >= 500) {
        return new DatameetHttpError(
          `DataMeet catalog upstream server error (${status}).${suffix}`,
          status,
          'UPSTREAM_ERROR',
          true
        );
      }
      return new DatameetHttpError(
        `DataMeet catalog request failed (${status}).${suffix}`,
        status,
        'UPSTREAM_ERROR',
        status >= 500
      );
  }
}
