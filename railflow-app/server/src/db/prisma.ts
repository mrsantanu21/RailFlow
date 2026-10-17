import { PrismaClient } from '@prisma/client';
import { createClient } from '@libsql/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env.TURSO_DATABASE_URL;
  const rawToken = process.env.TURSO_AUTH_TOKEN;
  const tursoUrl = rawUrl?.trim().replace(/^["']|["']$/g, '');
  const tursoAuthToken = rawToken?.trim().replace(/^["']|["']$/g, '');
  const isProd = process.env.NODE_ENV === 'production';

  if (tursoUrl) {
    if ((tursoUrl.startsWith('libsql:') || tursoUrl.startsWith('https:')) && !tursoAuthToken) {
      throw new Error(
        '[Database Error] TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is configured for remote connection.'
      );
    }
    const libsql = createClient({
      url: tursoUrl,
      authToken: tursoAuthToken,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({
      adapter,
      log: isProd ? ['error'] : ['query', 'error', 'warn'],
    });
  }

  if (isProd) {
    throw new Error(
      '[Database Error] TURSO_DATABASE_URL is not configured in production. Running with local SQLite on Render will cause silent data loss upon container restart.'
    );
  }

  return new PrismaClient({
    log: ['query', 'error', 'warn'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
