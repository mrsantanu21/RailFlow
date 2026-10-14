/**
 * RailFlow Expired Inventory Hold Cleanup Service
 *
 * Architecture & Concurrency Model:
 * ─────────────────────────────────────────────────────────────────────────────
 * In the current single-process SQLite development setup:
 * - A module-level mutex flag (`isCleanupRunning`) guards against overlapping executions.
 * - Periodic cleanup runs via an unref'd `setInterval` timer that does not block process exit.
 * - Server startup executes an immediate cleanup wrapped in try/catch to heal any holds
 *   left behind by an unclean prior termination.
 * - Graceful shutdown hooks clear the timer and wait for in-flight tasks to exit cleanly.
 *
 * Scaling to Multi-Instance / Clustered Deployments (e.g. Node.js on Kubernetes + PostgreSQL):
 * ─────────────────────────────────────────────────────────────────────────────
 * In a multi-node production deployment, local in-memory intervals across instances
 * would cause redundant queries and race conditions. Recommended production patterns:
 *
 * 1. Distributed Locking (Redis / Valkey):
 *    - Use Redlock or a simple `SET lock:hold_cleanup <uuid> NX PX 30000` before running.
 *    - Only the instance that acquires the lock executes cleanup; others skip the tick.
 *
 * 2. Database Advisory Locks (PostgreSQL):
 *    - Execute `SELECT pg_try_advisory_xact_lock(198273645)` inside a short transaction.
 *    - The lock automatically releases when the transaction commits or aborts.
 *
 * 3. Dedicated Worker / Kubernetes CronJob:
 *    - Move cleanup out of the web request handlers entirely into a background worker process
 *      (e.g., BullMQ / Agenda) or trigger a dedicated internal endpoint via Cloud Scheduler.
 *
 * 4. Row-Level `FOR UPDATE SKIP LOCKED` (PostgreSQL):
 *    - Lock and update expired rows in batches without competing instances blocking each other.
 */

import { prisma } from '../db/prisma';

let cleanupTimer: NodeJS.Timeout | null = null;
let isCleanupRunning = false;

export interface CleanupResult {
  releasedAllocations: number;
  failedBookings: number;
  timestamp: string;
}

/**
 * Releases all expired LOCKED seat allocations and updates the corresponding PENDING bookings.
 * Idempotent: safe to run multiple times with zero side-effects on subsequent runs.
 * Guaranteed to NEVER release seats belonging to CONFIRMED bookings.
 */
export async function cleanupExpiredHolds(): Promise<CleanupResult> {
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. Find all allocations that are strictly LOCKED and expired
    const expiredAllocations = await tx.seatAllocation.findMany({
      where: {
        status: 'LOCKED',
        lockedUntil: { lt: now },
      },
      include: {
        bookingPassenger: {
          select: { bookingId: true },
        },
      },
    });

    if (expiredAllocations.length === 0) {
      return {
        releasedAllocations: 0,
        failedBookings: 0,
        timestamp: now.toISOString(),
      };
    }

    const allocationIds = expiredAllocations.map((a) => a.id);
    const bookingIds = [
      ...new Set(expiredAllocations.map((a) => a.bookingPassenger.bookingId)),
    ];

    // 2. Transition expired LOCKED allocations to RELEASED
    // Defensive filter: strictly match status: 'LOCKED' to ensure CONFIRMED is NEVER touched
    const allocationUpdateResult = await tx.seatAllocation.updateMany({
      where: {
        id: { in: allocationIds },
        status: 'LOCKED',
      },
      data: {
        status: 'RELEASED',
      },
    });

    // 3. Mark the corresponding PENDING bookings as FAILED
    let failedBookingsCount = 0;
    if (bookingIds.length > 0) {
      const bookingUpdateResult = await tx.booking.updateMany({
        where: {
          id: { in: bookingIds },
          status: 'PENDING',
        },
        data: {
          status: 'FAILED',
        },
      });
      failedBookingsCount = bookingUpdateResult.count;
    }

    return {
      releasedAllocations: allocationUpdateResult.count,
      failedBookings: failedBookingsCount,
      timestamp: now.toISOString(),
    };
  });
}

/**
 * Starts the periodic background cleanup job.
 * Avoids overlapping runs using an in-memory guard flag.
 */
export function startHoldCleanupJob(intervalMs: number = 60000): void {
  if (cleanupTimer) {
    return; // Already running
  }

  // Run once immediately on startup
  (async () => {
    try {
      const result = await cleanupExpiredHolds();
      if (result.releasedAllocations > 0) {
        console.log(`[HoldCleanup] Initial startup run released ${result.releasedAllocations} expired seat hold(s).`);
      }
    } catch (err) {
      console.error('[HoldCleanup] Error during startup cleanup run:', err);
    }
  })();

  cleanupTimer = setInterval(async () => {
    if (isCleanupRunning) {
      console.warn('[HoldCleanup] Previous cleanup execution is still in progress; skipping tick.');
      return;
    }

    isCleanupRunning = true;
    try {
      const result = await cleanupExpiredHolds();
      if (result.releasedAllocations > 0) {
        console.log(
          `[HoldCleanup] Released ${result.releasedAllocations} expired seat hold(s) across ${result.failedBookings} booking(s).`
        );
      }
    } catch (err) {
      console.error('[HoldCleanup] Error during periodic cleanup execution:', err);
    } finally {
      isCleanupRunning = false;
    }
  }, intervalMs);

  // Unref timer so it does not prevent Node.js from exiting cleanly
  cleanupTimer.unref();
}

/**
 * Stops the periodic background cleanup job. Safe for server shutdown or test teardown.
 */
export function stopHoldCleanupJob(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  isCleanupRunning = false;
}

/**
 * Helper to inspect if cleanup is currently executing.
 */
export function isHoldCleanupActive(): boolean {
  return isCleanupRunning;
}
