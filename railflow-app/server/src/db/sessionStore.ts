import session from 'express-session';
import { prisma } from './prisma';

/**
 * RailFlow Persistent SQLite/Prisma Session Store
 *
 * Implements express-session Store interface using the database.
 * Preserves user sessions across server restarts without requiring
 * external infrastructure (like Redis) during development.
 */
export class PrismaSessionStore extends session.Store {
  private readyPromise: Promise<void>;

  constructor() {
    super();
    this.readyPromise = this.initTable();
  }

  private async initTable(): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS _app_sessions (
          sid TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          expiresAt TEXT NOT NULL
        )
      `);
      await this.clearExpired();
    } catch (err) {
      console.error('[SessionStore] Table initialization error:', err);
    }
  }

  public async clearExpired(): Promise<number> {
    try {
      const nowIso = new Date().toISOString();
      const count = await prisma.$executeRawUnsafe(
        `DELETE FROM _app_sessions WHERE expiresAt < '${nowIso}'`
      );
      return (count as number) || 0;
    } catch {
      return 0;
    }
  }

  private sanitizeSid(sid: string): string {
    return sid.replace(/[^a-zA-Z0-9_\-]/g, '');
  }

  public get = (
    sid: string,
    callback: (err?: any, session?: session.SessionData | null) => void
  ): void => {
    this.readyPromise
      .then(async () => {
        const safeSid = this.sanitizeSid(sid);
        const rows: any[] = await prisma.$queryRawUnsafe(
          `SELECT sid, data, expiresAt FROM _app_sessions WHERE sid = '${safeSid}'`
        );
        if (!rows || rows.length === 0) {
          return callback(null, null);
        }
        const row = rows[0];
        if (new Date(row.expiresAt).getTime() < Date.now()) {
          await prisma.$executeRawUnsafe(`DELETE FROM _app_sessions WHERE sid = '${safeSid}'`);
          return callback(null, null);
        }
        const parsed = JSON.parse(row.data);
        return callback(null, parsed);
      })
      .catch((err) => callback(err));
  };

  public set = (
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: any) => void
  ): void => {
    this.readyPromise
      .then(async () => {
        const safeSid = this.sanitizeSid(sid);
        const expiresAt = sessionData.cookie?.expires
          ? new Date(sessionData.cookie.expires).toISOString()
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const serialized = JSON.stringify(sessionData).replace(/'/g, "''");

        await prisma.$executeRawUnsafe(`
          INSERT INTO _app_sessions (sid, data, expiresAt)
          VALUES ('${safeSid}', '${serialized}', '${expiresAt}')
          ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expiresAt = excluded.expiresAt
        `);
        callback?.(null);
      })
      .catch((err) => callback?.(err));
  };

  public destroy = (sid: string, callback?: (err?: any) => void): void => {
    this.readyPromise
      .then(async () => {
        const safeSid = this.sanitizeSid(sid);
        await prisma.$executeRawUnsafe(`DELETE FROM _app_sessions WHERE sid = '${safeSid}'`);
        callback?.(null);
      })
      .catch((err) => callback?.(err));
  };

  public touch = (
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: any) => void
  ): void => {
    this.readyPromise
      .then(async () => {
        const safeSid = this.sanitizeSid(sid);
        const expiresAt = sessionData.cookie?.expires
          ? new Date(sessionData.cookie.expires).toISOString()
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await prisma.$executeRawUnsafe(
          `UPDATE _app_sessions SET expiresAt = '${expiresAt}' WHERE sid = '${safeSid}'`
        );
        callback?.(null);
      })
      .catch((err) => callback?.(err));
  };
}
