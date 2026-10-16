/**
 * CLI script to execute railway data validation, integrity checks, and sync audit run.
 * Usage: npx tsx src/scripts/importRailwayData.ts
 */

import { dataImportService } from '../services/dataImportService';
import { prisma } from '../db/prisma';

async function main() {
  console.log('🚂 [RailFlow Data Import Pipeline] Starting dataset integrity audit...');
  try {
    const report = await dataImportService.runDatasetValidationAndAudit();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ RailFlow Railway Dataset Integrity Report:');
    console.log(`   Source: ${report.dataSourceName} (${report.sourceVersion})`);
    console.log(`   Status: ${report.status}`);
    console.log(`   Valid Stations: ${report.validStationsCount.toLocaleString()} (Quarantined: ${report.quarantinedStationsCount})`);
    console.log(`   Valid Trains: ${report.validTrainsCount.toLocaleString()} (Rejected: ${report.rejectedTrainsCount})`);
    console.log(`   Execution Time: ${new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime()}ms`);
    if (report.issuesDetected.length > 0) {
      console.log('   Issues noted:');
      report.issuesDetected.forEach(issue => console.log(`    - ${issue}`));
    }
    console.log('═══════════════════════════════════════════════════════════');
  } catch (err: any) {
    console.error('❌ Data import audit failed:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
