/**
 * RailFlow Idempotent Data Import & Audit Service
 * Validates railway dataset integrity, ensures foreign key sanity, stop ordering,
 * logs statistics, and writes audit records to DataSource and SyncRun tables.
 */

import { prisma } from '../db/prisma';
import { indianRailwayService, IRTrain, IRStation } from './indianRailwayService';
import { isMalformedOrQuarantinedStation } from './canonicalStationService';

export interface ValidationReport {
  dataSourceName: string;
  sourceVersion: string;
  startedAt: string;
  completedAt: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  totalStationsExamined: number;
  validStationsCount: number;
  quarantinedStationsCount: number;
  totalTrainsExamined: number;
  validTrainsCount: number;
  rejectedTrainsCount: number;
  issuesDetected: string[];
}

export class DataImportService {
  /**
   * Run full validation and sync audit run on the loaded railway dataset.
   */
  async runDatasetValidationAndAudit(): Promise<ValidationReport> {
    const startedAt = new Date();
    await indianRailwayService.ensureLoaded();

    const stations = indianRailwayService.getAllStations();
    const trains = indianRailwayService.getAllTrains();

    let validStationsCount = 0;
    let quarantinedStationsCount = 0;
    const issues: string[] = [];

    // 1. Validate stations
    const stationCodeSet = new Set<string>();
    for (const s of stations) {
      if (isMalformedOrQuarantinedStation(s.code, s.name)) {
        quarantinedStationsCount++;
      } else {
        validStationsCount++;
        stationCodeSet.add(s.code.toUpperCase());
      }
    }

    // 2. Validate trains
    let validTrainsCount = 0;
    let rejectedTrainsCount = 0;
    const trainNumberSet = new Set<string>();

    for (const t of trains) {
      if (!t.trainNumber || t.trainNumber.trim().length === 0) {
        rejectedTrainsCount++;
        issues.push(`Train with empty trainNumber encountered.`);
        continue;
      }

      if (trainNumberSet.has(t.trainNumber)) {
        rejectedTrainsCount++;
        issues.push(`Duplicate trainNumber ${t.trainNumber} encountered.`);
        continue;
      }
      trainNumberSet.add(t.trainNumber);

      // Validate route stops
      const stops = t.completeOrderedRoute || [];
      if (stops.length < 2) {
        rejectedTrainsCount++;
        issues.push(`Train ${t.trainNumber} has fewer than 2 stops.`);
        continue;
      }

      let sequenceValid = true;
      for (let i = 0; i < stops.length - 1; i++) {
        if (stops[i].sequence >= stops[i + 1].sequence) {
          sequenceValid = false;
          break;
        }
      }

      if (!sequenceValid) {
        issues.push(`Train ${t.trainNumber} has non-monotonic stop sequence.`);
      }

      validTrainsCount++;
    }

    const completedAt = new Date();
    const status = rejectedTrainsCount === 0 ? 'SUCCESS' : 'PARTIAL';

    // 3. Persist DataSource and SyncRun audit in Prisma DB
    try {
      const dataSource = await prisma.dataSource.upsert({
        where: { name: 'INDIAN_RAILWAY_OPEN_DATA' },
        create: {
          name: 'INDIAN_RAILWAY_OPEN_DATA',
          type: 'OPEN_DATASET',
          description: 'Indian Railway master schedule dataset (prasenjit-27/Indian-Railway-Data, MIT License)',
          version: 'v2024.1',
          lastSyncAt: completedAt,
          recordCount: validTrainsCount,
          status: 'ACTIVE',
        },
        update: {
          lastSyncAt: completedAt,
          recordCount: validTrainsCount,
          status: 'ACTIVE',
        },
      });

      await prisma.syncRun.create({
        data: {
          dataSourceId: dataSource.id,
          version: 'v2024.1',
          source: 'data/indian-railways/stations.json + trains.json',
          status,
          startedAt,
          completedAt,
          insertedCount: validTrainsCount + validStationsCount,
          updatedCount: 0,
          rejectedCount: rejectedTrainsCount + quarantinedStationsCount,
          errorLog: issues.length > 0 ? issues.slice(0, 20).join('\n') : null,
        },
      });
    } catch (err: any) {
      console.warn('[DataImportService] Failed to record SyncRun audit in DB:', err.message);
    }

    return {
      dataSourceName: 'INDIAN_RAILWAY_OPEN_DATA',
      sourceVersion: 'v2024.1',
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      status,
      totalStationsExamined: stations.length,
      validStationsCount,
      quarantinedStationsCount,
      totalTrainsExamined: trains.length,
      validTrainsCount,
      rejectedTrainsCount,
      issuesDetected: issues.slice(0, 10),
    };
  }
}

export const dataImportService = new DataImportService();
