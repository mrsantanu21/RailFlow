/**
 * RailFlow Canonical Station & City Cluster Service
 * Provides normalized station search, alias translation, quarantine of malformed/placeholder
 * entries (e.g. XX-*, YY-*), cluster detection, and nearby station recommendations.
 */

import { indianRailwayService, IRStation } from './indianRailwayService';

export interface CanonicalStationRecord {
  id: string;
  code: string;
  name: string;
  fullName: string;
  city: string;
  state: string;
  zone: string;
  latitude: number | null;
  longitude: number | null;
  aliases: string[];
  isMajorJunction: boolean;
  isActive: boolean;
  provenance: {
    source: string;
    isOfficial: boolean;
    providerName: string;
  };
}

export interface CityCluster {
  id: string;
  cityName: string;
  primaryCode: string;
  aliases: string[];
  satelliteCodes: string[];
}

// ─── Major Indian Railway City Clusters ─────────────────────────────────────
export const INDIAN_CITY_CLUSTERS: CityCluster[] = [
  {
    id: 'KOLKATA',
    cityName: 'Kolkata',
    primaryCode: 'HWH',
    aliases: ['CALCUTTA', 'KOLKATA', 'HOWRAH', 'SEALDAH', 'KOL', 'CAL'],
    satelliteCodes: ['SDAH', 'KOAA', 'SHM', 'SRC'],
  },
  {
    id: 'DELHI',
    cityName: 'New Delhi & NCR',
    primaryCode: 'NDLS',
    aliases: ['DELHI', 'NEW DELHI', 'OLD DELHI', 'DILLI', 'NCR', 'HAZRAT NIZAMUDDIN', 'ANAND VIHAR'],
    satelliteCodes: ['DLI', 'NZM', 'ANVT', 'DEC', 'DEE'],
  },
  {
    id: 'MUMBAI',
    cityName: 'Mumbai',
    primaryCode: 'CSTM',
    aliases: ['MUMBAI', 'BOMBAY', 'BOMBAY CENTRAL', 'BOMBAY VT', 'BOM', 'CST', 'CSMT'],
    satelliteCodes: ['BCT', 'BDTS', 'LTT', 'DR', 'DDR', 'MMCT', 'KYN', 'TNA'],
  },
  {
    id: 'BENGALURU',
    cityName: 'Bengaluru',
    primaryCode: 'SBC',
    aliases: ['BANGALORE', 'BENGALURU', 'BLR', 'BANGALORE CITY', 'YESVANTPUR', 'SMVT'],
    satelliteCodes: ['YPR', 'SMVB', 'BNC', 'WFD', 'KJM'],
  },
  {
    id: 'CHENNAI',
    cityName: 'Chennai',
    primaryCode: 'MAS',
    aliases: ['CHENNAI', 'MADRAS', 'MAA', 'MADRAS CENTRAL', 'EGMORE'],
    satelliteCodes: ['MS', 'TBM', 'PER', 'AJJ'],
  },
  {
    id: 'VARANASI',
    cityName: 'Varanasi',
    primaryCode: 'BSB',
    aliases: ['VARANASI', 'BENARES', 'BANARAS', 'KASHI', 'MUGHALSARAI', 'DEEN DAYAL'],
    satelliteCodes: ['DDU', 'BSBS', 'BCY'],
  },
  {
    id: 'SILIGURI_JALPAIGURI',
    cityName: 'New Jalpaiguri / Siliguri',
    primaryCode: 'NJP',
    aliases: ['NEW JALPAIGURI', 'SILIGURI', 'JALPAIGURI', 'NJPS', 'NJP JN'],
    satelliteCodes: ['SGUJ', 'JPE', 'JPG', 'RQJ', 'ABFC'],
  },
  {
    id: 'HYDERABAD',
    cityName: 'Hyderabad / Secunderabad',
    primaryCode: 'SC',
    aliases: ['HYDERABAD', 'SECUNDERABAD', 'HYD', 'SEC', 'NAMPALLY', 'KACHEGUDA'],
    satelliteCodes: ['HYB', 'KCG', 'CHZ', 'BMT', 'LPI'],
  },
  {
    id: 'AHMEDABAD',
    cityName: 'Ahmedabad',
    primaryCode: 'ADI',
    aliases: ['AHMEDABAD', 'AMDAVAD', 'SABARMATI'],
    satelliteCodes: ['SBT', 'SBI', 'MAN'],
  },
  {
    id: 'PUNE',
    cityName: 'Pune',
    primaryCode: 'PUNE',
    aliases: ['PUNE', 'POONA', 'SHIVAJINAGAR'],
    satelliteCodes: ['SVJR', 'KK', 'CCH', 'HDP'],
  },
  {
    id: 'PATNA',
    cityName: 'Patna',
    primaryCode: 'PNBE',
    aliases: ['PATNA', 'PATLIPUTRA', 'DANAPUR', 'RAJENDRA NAGAR'],
    satelliteCodes: ['RJPB', 'DNR', 'PPTA'],
  },
  {
    id: 'LUCKNOW',
    cityName: 'Lucknow',
    primaryCode: 'LKO',
    aliases: ['LUCKNOW', 'CHARBAGH', 'AISHBAGH'],
    satelliteCodes: ['LJN', 'BNZ', 'ASH'],
  },
  {
    id: 'AGRA',
    cityName: 'Agra',
    primaryCode: 'AGC',
    aliases: ['AGRA', 'AGRA CANTT', 'AGRA FORT'],
    satelliteCodes: ['AF', 'RKM'],
  },
  {
    id: 'JAIPUR',
    cityName: 'Jaipur',
    primaryCode: 'JP',
    aliases: ['JAIPUR', 'PINK CITY'],
    satelliteCodes: ['GADJ', 'DKBJ'],
  },
  {
    id: 'KANPUR',
    cityName: 'Kanpur',
    primaryCode: 'CNB',
    aliases: ['KANPUR', 'CAWNPORE', 'KANPUR CENTRAL'],
    satelliteCodes: ['CPA', 'GOY'],
  },
  {
    id: 'GUWAHATI',
    cityName: 'Guwahati',
    primaryCode: 'GHY',
    aliases: ['GUWAHATI', 'GAUHATI', 'KAMAKHYA'],
    satelliteCodes: ['KYQ'],
  },
  {
    id: 'CHANDIGARH',
    cityName: 'Chandigarh / Kalka',
    primaryCode: 'CDG',
    aliases: ['CHANDIGARH', 'KALKA', 'MOHALI'],
    satelliteCodes: ['KLK', 'UMB'],
  },
];

// ─── Direct Code Typo / Alias Map ───────────────────────────────────────────
export const DIRECT_CODE_ALIASES: Record<string, string> = {
  NJPS: 'NJP',
  NDLSJ: 'NDLS',
  HWHJ: 'HWH',
  SDAHJ: 'SDAH',
  CSMT: 'CSTM',
  MMCT: 'BCT',
  CSMTT: 'CSTM',
  VT: 'CSTM',
  CST: 'CSTM',
  MGS: 'DDU', // Historical Mughalsarai -> Pt Deen Dayal Upadhyaya
  ALD: 'PRYJ', // Historical Allahabad -> Prayagraj
  BZAJ: 'BZA',
};

// ─── Malformed Station Quarantine Filter ────────────────────────────────────
export function isMalformedOrQuarantinedStation(code: string, name?: string): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();

  // Quarantine XX-*, YY-*, ZZ-*, *--* placeholder codes
  if (upper.startsWith('XX-') || upper.startsWith('YY-') || upper.startsWith('ZZ-')) {
    return true;
  }
  if (upper.includes('--') || upper.length < 2 || upper.length > 10) {
    return true;
  }
  // Check invalid characters (must be alphanumeric, dash, or underscore)
  if (!/^[A-Z0-9]+([-_][A-Z0-9]+)*$/.test(upper)) {
    return true;
  }

  if (name) {
    const nameUpper = name.trim().toUpperCase();
    if (
      nameUpper === 'PLACEHOLDER' ||
      nameUpper === 'TEST' ||
      nameUpper === 'INTERNAL' ||
      nameUpper.length === 0
    ) {
      return true;
    }
  }

  return false;
}

export class CanonicalStationService {
  private clusterByCode = new Map<string, CityCluster>();
  private clusterByAlias = new Map<string, CityCluster>();
  private majorStations = new Set<string>();

  constructor() {
    for (const cluster of INDIAN_CITY_CLUSTERS) {
      this.clusterByCode.set(cluster.primaryCode, cluster);
      this.majorStations.add(cluster.primaryCode);

      for (const sat of cluster.satelliteCodes) {
        this.clusterByCode.set(sat, cluster);
        this.majorStations.add(sat);
      }

      for (const alias of cluster.aliases) {
        this.clusterByAlias.set(alias.toUpperCase(), cluster);
      }
    }
  }

  /**
   * Normalizes any station input (code, typo, city name, alias) to canonical station information.
   */
  resolveCanonicalStationCode(input: string): {
    code: string;
    isAlias: boolean;
    originalInput: string;
    cluster?: CityCluster;
  } {
    const raw = (input || '').trim().toUpperCase();
    if (!raw) {
      return { code: '', isAlias: false, originalInput: input };
    }

    // 1. Direct typo / alias map (e.g. NJPS -> NJP)
    if (DIRECT_CODE_ALIASES[raw]) {
      const canonical = DIRECT_CODE_ALIASES[raw];
      return {
        code: canonical,
        isAlias: true,
        originalInput: input,
        cluster: this.clusterByCode.get(canonical),
      };
    }

    // 2. City alias match (e.g. "Calcutta" -> HWH, "Delhi" -> NDLS)
    if (this.clusterByAlias.has(raw)) {
      const cluster = this.clusterByAlias.get(raw)!;
      return {
        code: cluster.primaryCode,
        isAlias: true,
        originalInput: input,
        cluster,
      };
    }

    // 3. Direct cluster code
    if (this.clusterByCode.has(raw)) {
      return {
        code: raw,
        isAlias: false,
        originalInput: input,
        cluster: this.clusterByCode.get(raw),
      };
    }

    return {
      code: raw,
      isAlias: false,
      originalInput: input,
    };
  }

  /**
   * Returns nearby or satellite stations for a given station code.
   * Useful for no-result recovery (e.g. for NJP returns SGUJ, JPE, JPG; for HWH returns SDAH, KOAA).
   */
  getNearbyStations(stationCode: string): Array<{ code: string; name: string; relation: string }> {
    const upper = stationCode.trim().toUpperCase();
    const resolved = this.resolveCanonicalStationCode(upper);
    const code = resolved.code;

    const cluster = this.clusterByCode.get(code);
    if (!cluster) {
      return [];
    }

    const nearbyCodes = [cluster.primaryCode, ...cluster.satelliteCodes].filter((c) => c !== code);

    const results: Array<{ code: string; name: string; relation: string }> = [];
    for (const c of nearbyCodes) {
      const name = this.getStationDisplayName(c);
      results.push({
        code: c,
        name,
        relation: c === cluster.primaryCode ? 'City Central / Main Junction' : 'City Satellite Terminal',
      });
    }

    return results;
  }

  private getStationDisplayName(code: string): string {
    const knownNames: Record<string, string> = {
      HWH: 'Howrah Junction',
      SDAH: 'Sealdah',
      KOAA: 'Kolkata Terminal',
      SHM: 'Shalimar',
      SRC: 'Santragachi Junction',
      NDLS: 'New Delhi',
      DLI: 'Delhi Junction (Old Delhi)',
      NZM: 'Hazrat Nizamuddin',
      ANVT: 'Anand Vihar Terminal',
      DEC: 'Delhi Cantt',
      CSMT: 'Chhatrapati Shivaji Maharaj Terminus',
      MMCT: 'Mumbai Central',
      BDTS: 'Bandra Terminus',
      LTT: 'Lokmanya Tilak Terminus',
      DR: 'Dadar',
      SBC: 'KSR Bengaluru City',
      YPR: 'Yesvantpur Junction',
      SMVB: 'SMVT Bengaluru',
      BNC: 'Bengaluru Cantt',
      MAS: 'MGR Chennai Central',
      MS: 'Chennai Egmore',
      TBM: 'Tambaram',
      BSB: 'Varanasi Junction',
      DDU: 'Pt. Deen Dayal Upadhyaya Junction',
      BSBS: 'Banaras',
      NJP: 'New Jalpaiguri Junction',
      SGUJ: 'Siliguri Junction',
      JPE: 'Jalpaiguri Road',
      SC: 'Secunderabad Junction',
      HYB: 'Hyderabad Deccan Nampally',
      ADI: 'Ahmedabad Junction',
      PUNE: 'Pune Junction',
      PNBE: 'Patna Junction',
      LKO: 'Lucknow Charbagh',
      AGC: 'Agra Cantt',
      JP: 'Jaipur Junction',
      CNB: 'Kanpur Central',
      GHY: 'Guwahati',
    };
    return knownNames[code] || code;
  }

  /**
   * Search canonical stations with smart ranking:
   * Rank 1: Exact code match (e.g. NDLS)
   * Rank 2: Exact name or alias match (e.g. "Delhi" -> New Delhi, Old Delhi...)
   * Rank 3: Name starts with query
   * Rank 4: Code starts with query
   * Rank 5: City cluster matches
   * Rank 6: Name/State contains query
   * Filters out all quarantined internal placeholder stations (XX-*, YY-*).
   */
  async searchStations(query: string, limit = 20): Promise<CanonicalStationRecord[]> {
    await indianRailwayService.ensureLoaded();
    const rawQ = (query || '').trim();
    const qUpper = rawQ.toUpperCase();

    // 1. Check if user typed a city alias (e.g. "Calcutta", "Delhi", "Bangalore")
    const matchedCluster = this.clusterByAlias.get(qUpper);

    const irStations = indianRailwayService.getAllStations();

    const rank1_exactCode: CanonicalStationRecord[] = [];
    const rank2_exactName: CanonicalStationRecord[] = [];
    const rank3_namePrefix: CanonicalStationRecord[] = [];
    const rank4_codePrefix: CanonicalStationRecord[] = [];
    const rank5_clusterMatches: CanonicalStationRecord[] = [];
    const rank6_contains: CanonicalStationRecord[] = [];

    const seenCodes = new Set<string>();

    // If query matches a city cluster, prioritize all cluster stations!
    if (matchedCluster) {
      const allClusterCodes = [matchedCluster.primaryCode, ...matchedCluster.satelliteCodes];
      for (const code of allClusterCodes) {
        const s = indianRailwayService.getStationSync(code);
        if (s && !isMalformedOrQuarantinedStation(s.code, s.name)) {
          seenCodes.add(s.code);
          rank2_exactName.push(this.formatRecord(s, matchedCluster.cityName));
        }
      }
    }

    // Direct typo/alias check (e.g. NJPS -> NJP)
    if (DIRECT_CODE_ALIASES[qUpper]) {
      const canonicalCode = DIRECT_CODE_ALIASES[qUpper];
      const s = indianRailwayService.getStationSync(canonicalCode);
      if (s && !isMalformedOrQuarantinedStation(s.code, s.name) && !seenCodes.has(s.code)) {
        seenCodes.add(s.code);
        rank1_exactCode.push(this.formatRecord(s));
      }
    }

    for (const s of irStations) {
      if (!s || !s.code) continue;
      if (isMalformedOrQuarantinedStation(s.code, s.name)) continue;
      if (seenCodes.has(s.code)) continue;

      const codeUpper = s.code.toUpperCase();
      const nameUpper = s.name.toUpperCase();
      const stateUpper = (s.state || '').toUpperCase();

      if (!qUpper) {
        // Return major junctions first for empty query
        if (this.majorStations.has(codeUpper)) {
          seenCodes.add(codeUpper);
          rank1_exactCode.push(this.formatRecord(s));
        } else {
          rank6_contains.push(this.formatRecord(s));
        }
        continue;
      }

      if (codeUpper === qUpper) {
        seenCodes.add(codeUpper);
        rank1_exactCode.push(this.formatRecord(s));
      } else if (nameUpper === qUpper) {
        seenCodes.add(codeUpper);
        rank2_exactName.push(this.formatRecord(s));
      } else if (nameUpper.startsWith(qUpper)) {
        seenCodes.add(codeUpper);
        rank3_namePrefix.push(this.formatRecord(s));
      } else if (codeUpper.startsWith(qUpper)) {
        seenCodes.add(codeUpper);
        rank4_codePrefix.push(this.formatRecord(s));
      } else if (nameUpper.includes(qUpper) || stateUpper.includes(qUpper)) {
        seenCodes.add(codeUpper);
        rank6_contains.push(this.formatRecord(s));
      }
    }

    // Sort name prefixes and code prefixes prioritizing major junctions
    const prioritizeMajor = (a: CanonicalStationRecord, b: CanonicalStationRecord) => {
      if (a.isMajorJunction && !b.isMajorJunction) return -1;
      if (!a.isMajorJunction && b.isMajorJunction) return 1;
      return a.name.localeCompare(b.name);
    };

    rank3_namePrefix.sort(prioritizeMajor);
    rank4_codePrefix.sort(prioritizeMajor);
    rank6_contains.sort(prioritizeMajor);

    const merged = [
      ...rank1_exactCode,
      ...rank2_exactName,
      ...rank3_namePrefix,
      ...rank4_codePrefix,
      ...rank5_clusterMatches,
      ...rank6_contains,
    ];

    return merged.slice(0, limit);
  }

  private formatRecord(s: IRStation, overrideCity?: string): CanonicalStationRecord {
    const cluster = this.clusterByCode.get(s.code);
    const city = overrideCity || cluster?.cityName || s.state || '';
    const aliases = cluster?.aliases || [];

    return {
      id: `stn-${s.code}`,
      code: s.code,
      name: s.name,
      fullName: `${s.name} (${s.code})`,
      city,
      state: s.state || '',
      zone: s.zone || 'IR',
      latitude: s.coordinates?.latitude || null,
      longitude: s.coordinates?.longitude || null,
      aliases,
      isMajorJunction: this.majorStations.has(s.code),
      isActive: true,
      provenance: {
        source: 'INDIAN_RAILWAY_OPEN_DATA',
        isOfficial: true,
        providerName: 'Indian Railway Data Directory',
      },
    };
  }
}

export const canonicalStationService = new CanonicalStationService();
