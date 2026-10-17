import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

describe('Turso libSQL Driver Adapter Compatibility', () => {
  it('instantiates libSQL client and PrismaLibSQL adapter successfully', () => {
    // In-memory libSQL database instance
    const client = createClient({
      url: ':memory:',
    });
    expect(client).toBeDefined();

    const adapter = new PrismaLibSQL(client);
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe('sqlite');
  });

  it('initializes PrismaClient with PrismaLibSQL adapter', async () => {
    const client = createClient({
      url: ':memory:',
    });
    const adapter = new PrismaLibSQL(client);
    const testPrisma = new PrismaClient({ adapter });
    expect(testPrisma).toBeDefined();

    // Verify raw query through adapter
    const result = await testPrisma.$queryRawUnsafe('SELECT 1 as val');
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(Number((result as any[])[0].val)).toBe(1);

    await testPrisma.$disconnect();
  });

  it('supports interactive transaction over PrismaLibSQL adapter', async () => {
    const client = createClient({
      url: ':memory:',
    });
    const adapter = new PrismaLibSQL(client);
    const testPrisma = new PrismaClient({ adapter });

    // Create a temporary table in the in-memory libSQL DB
    await testPrisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS _test_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    // Verify interactive transaction execution
    const txResult = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO _test_items (id, name) VALUES ('item-1', 'Vande Bharat')
      `);
      const rows: any[] = await tx.$queryRawUnsafe(`
        SELECT id, name FROM _test_items WHERE id = 'item-1'
      `);
      return rows[0];
    });

    expect(txResult).toBeDefined();
    expect(txResult.id).toBe('item-1');
    expect(txResult.name).toBe('Vande Bharat');

    await testPrisma.$disconnect();
  });

  it('supports _app_sessions table creation and upsert on libSQL adapter', async () => {
    const client = createClient({
      url: ':memory:',
    });
    const adapter = new PrismaLibSQL(client);
    const testPrisma = new PrismaClient({ adapter });

    // Test session table creation
    await testPrisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS _app_sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      )
    `);

    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const data = JSON.stringify({ userId: 'u123', role: 'USER' });

    // Test upsert with ON CONFLICT(sid) DO UPDATE
    await testPrisma.$executeRawUnsafe(`
      INSERT INTO _app_sessions (sid, data, expiresAt)
      VALUES ('sid_test', '${data}', '${expiresAt}')
      ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expiresAt = excluded.expiresAt
    `);

    const rows: any[] = await testPrisma.$queryRawUnsafe(
      `SELECT sid, data, expiresAt FROM _app_sessions WHERE sid = 'sid_test'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sid).toBe('sid_test');
    expect(JSON.parse(rows[0].data).userId).toBe('u123');

    await testPrisma.$disconnect();
  });
});
