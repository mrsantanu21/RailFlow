import React from 'react';

export type DataProvenance =
  | 'LIVE_EXTERNAL'
  | 'STATIC_ROUTE'
  | 'TIMETABLE_ESTIMATE'
  | 'CACHED'
  | 'RAILFLOW_DEMO'
  | 'UNAVAILABLE';

const LABELS: Record<DataProvenance, string> = {
  LIVE_EXTERNAL: 'Live External Data',
  STATIC_ROUTE: 'Static Route Data',
  TIMETABLE_ESTIMATE: 'Timetable Estimate',
  CACHED: 'Cached Data',
  RAILFLOW_DEMO: 'RailFlow Demo Data',
  UNAVAILABLE: 'Unavailable',
};

const STYLES: Record<DataProvenance, string> = {
  LIVE_EXTERNAL: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  STATIC_ROUTE: 'bg-primary/10 border-primary/20 text-primary',
  TIMETABLE_ESTIMATE: 'bg-secondary-fixed/40 border-secondary/20 text-on-secondary-fixed',
  CACHED: 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300',
  RAILFLOW_DEMO: 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant',
  UNAVAILABLE: 'bg-error-container/20 border-error/20 text-error',
};

export function provenanceFromSource(source?: string | null, freshnessSeconds?: number | null): DataProvenance {
  if (!source || source === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (typeof freshnessSeconds === 'number' && freshnessSeconds > 300) return 'CACHED';
  const s = source.toUpperCase();
  if (s.includes('RAILRADAR') || s.includes('CHUKCHUK') || s.includes('RAPIDAPI')) return 'LIVE_EXTERNAL';
  if (s.includes('DATAMEET') || s.includes('STATIC') || s.includes('GEOJSON')) return 'STATIC_ROUTE';
  if (s.includes('TIMETABLE') || s.includes('CRIS')) return 'TIMETABLE_ESTIMATE';
  if (s.includes('DEMO') || s.includes('PRISMA') || s.includes('LOCAL') || s.includes('SANDBOX')) return 'RAILFLOW_DEMO';
  if (s.includes('CACHED')) return 'CACHED';
  return 'STATIC_ROUTE';
}

interface ProvenanceBadgeProps {
  provenance?: DataProvenance | null;
  source?: string | null;
  freshnessSeconds?: number | null;
  label?: string | null;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  provenance,
  source,
  freshnessSeconds,
  label,
}) => {
  const kind = provenance || provenanceFromSource(source, freshnessSeconds);
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${STYLES[kind]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>
      <span>{label || LABELS[kind]}</span>
    </span>
  );
};
