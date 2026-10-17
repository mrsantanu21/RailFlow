/**
 * RailFlow Advanced Train Search Engine
 * Provides normalized station resolution, weekday service calendar filtering,
 * cross-midnight duration calculation, data confidence labeling,
 * and comprehensive no-result recovery (nearby stations, alternate dates, connecting journeys).
 */

import { prisma } from '../db/prisma';
import {
  canonicalStationService,
  isMalformedOrQuarantinedStation,
} from './canonicalStationService';
import {
  indianRailwayService,
  IRRouteStop,
  IRTrain,
  TrainSearchResultItem,
} from './indianRailwayService';
import {
  ensureTrainRunInventory,
  scheduleRunsOnDate,
  formatRunningDays,
} from './inventoryService';
import { getDayOfWeekKey, parseTimeToMinutes } from '../utils/dateTime';

export type DataConfidenceStatus = 'LIVE' | 'CACHED' | 'SCHEDULED' | 'ESTIMATED' | 'UNAVAILABLE';

export interface SearchQueryParams {
  from: string;
  to: string;
  date: string;
  quota?: string;
  passengers?: number;
  trainNumberOrName?: string;
  directOnly?: boolean;
  sort?: 'departure' | 'arrival' | 'duration' | 'fare';
  filterClass?: string;
  filterType?: string;
}

export interface ConnectingJourney {
  id: string;
  transferStation: {
    code: string;
    name: string;
  };
  totalDurationMin: number;
  layoverMin: number;
  leg1: {
    trainNumber: string;
    trainName: string;
    fromStation: string;
    toStation: string;
    departureTime: string;
    arrivalTime: string;
    durationMin: number;
  };
  leg2: {
    trainNumber: string;
    trainName: string;
    fromStation: string;
    toStation: string;
    departureTime: string;
    arrivalTime: string;
    durationMin: number;
  };
}

export interface NearbyStationAlternative {
  stationCode: string;
  stationName: string;
  role: 'ORIGIN' | 'DESTINATION';
  relation: string;
  directTrainsCount: number;
  searchUrl: string;
}

export interface AlternateDateAlternative {
  date: string;
  dayLabel: string;
  directTrainsCount: number;
  isToday: boolean;
  searchUrl: string;
}

export interface TypedSearchResponse {
  query: {
    from: string;
    fromCanonical: string;
    fromName: string;
    to: string;
    toCanonical: string;
    toName: string;
    date: string;
    quota: string;
    passengers: number;
    trainNumberOrName?: string;
    directOnly: boolean;
    sort: string;
  };
  summary: {
    total: number;
    direct: number;
    connecting: number;
    dataStatus: DataConfidenceStatus;
    noResultReason?: string;
  };
  results: any[];
  alternatives: {
    nearbyStations: NearbyStationAlternative[];
    alternateDates: AlternateDateAlternative[];
    connectingJourneysAvailable: boolean;
    connectingJourneys: ConnectingJourney[];
  };
  meta: {
    source: string;
    lastUpdated: string;
    canonicalRoute?: string;
    canonicalResolution: {
      fromResolvedFrom?: string;
      toResolvedFrom?: string;
      fromIsAlias: boolean;
      toIsAlias: boolean;
    };
  };
}

// Major transfer hubs for connecting route computations
const MAJOR_TRANSFER_HUBS = [
  'MLDT', // Malda Town (key corridor between NJP and Kolkata)
  'ASN',  // Asansol Junction
  'DDU',  // Pt. Deen Dayal Upadhyaya / Mughalsarai
  'CNB',  // Kanpur Central
  'PRYJ', // Prayagraj
  'BZA',  // Vijayawada
  'NGP',  // Nagpur
  'ET',   // Itarsi
  'BPL',  // Bhopal
  'ADI',  // Ahmedabad
  'GHY',  // Guwahati
  'LKO',  // Lucknow
  'PNBE', // Patna
];

export class RailSearchService {
  /**
   * Main typed train search handler
   */
  async search(params: SearchQueryParams): Promise<TypedSearchResponse> {
    await indianRailwayService.ensureLoaded();

    const fromRaw = (params.from || '').trim().toUpperCase();
    const toRaw = (params.to || '').trim().toUpperCase();
    const dateStr = params.date || new Date().toISOString().split('T')[0];
    const quota = (params.quota || 'GENERAL').toUpperCase();
    const passCount = Math.min(Math.max(params.passengers || 1, 1), 6);
    const directOnly = params.directOnly !== false;
    const sort = params.sort || 'departure';
    const trainFilter = (params.trainNumberOrName || '').trim().toUpperCase();

    // 1. Resolve Canonical Station Codes
    const fromRes = canonicalStationService.resolveCanonicalStationCode(fromRaw);
    const toRes = canonicalStationService.resolveCanonicalStationCode(toRaw);

    const fromCode = fromRes.code || fromRaw;
    const toCode = toRes.code || toRaw;

    if (fromCode === toCode) {
      throw new Error('SAME_STATION: Source and destination stations cannot be the same.');
    }

    // Lookup station metadata
    const fromStationData = await this.resolveStationInfo(fromCode);
    const toStationData = await this.resolveStationInfo(toCode);

    if (!fromStationData) {
      throw new Error(`STATION_NOT_FOUND: Source station '${fromRaw}' is not recognized in railway directory.`);
    }
    if (!toStationData) {
      throw new Error(`STATION_NOT_FOUND: Destination station '${toRaw}' is not recognized in railway directory.`);
    }

    // 2. Fetch Direct Bookable Trains from Prisma Master
    const localDirect = await this.searchLocalPrismaTrains(fromCode, toCode, dateStr, quota);

    // 3. Fetch Direct Trains from Indian Railway Dataset
    const catalogDirect = await this.searchCatalogTrains(fromCode, toCode, dateStr);

    // Merge and deduplicate by train number
    const seenTrainNumbers = new Set<string>();
    const directResults: any[] = [];

    // Prioritize local bookable trains first
    for (const t of localDirect) {
      if (!seenTrainNumbers.has(t.train.number)) {
        seenTrainNumbers.add(t.train.number);
        directResults.push(t);
      }
    }

    for (const t of catalogDirect) {
      if (!seenTrainNumbers.has(t.train.number)) {
        seenTrainNumbers.add(t.train.number);
        directResults.push(t);
      }
    }

    // Filter by train number/name if requested
    let filteredResults = directResults;
    if (trainFilter) {
      filteredResults = directResults.filter(
        (r) =>
          r.train.number.toUpperCase().includes(trainFilter) ||
          r.train.name.toUpperCase().includes(trainFilter)
      );
    }

    // Filter by class or train type if requested
    if (params.filterClass && params.filterClass !== 'ALL') {
      filteredResults = filteredResults.filter((r) => r.classes && r.classes[params.filterClass!]);
    }
    if (params.filterType && params.filterType !== 'ALL') {
      filteredResults = filteredResults.filter((r) => r.train.type === params.filterType);
    }

    // Sort direct results
    this.sortResults(filteredResults, sort);

    // 4. Calculate Alternatives (No-Result Recovery or Augmentation)
    const alternatives = await this.buildAlternatives({
      fromCode,
      fromName: fromStationData.name,
      toCode,
      toName: toStationData.name,
      dateStr,
      directCount: filteredResults.length,
      directOnly,
    });

    const primaryDataStatus: DataConfidenceStatus =
      localDirect.length > 0 ? 'LIVE' : filteredResults.length > 0 ? 'SCHEDULED' : 'UNAVAILABLE';

    let noResultReason: string | undefined;
    if (filteredResults.length === 0) {
      noResultReason = `No direct trains operate between ${fromStationData.name} (${fromCode}) and ${toStationData.name} (${toCode}) on ${dateStr}. Review nearby stations or alternate dates below.`;
    }

    return {
      query: {
        from: fromRaw,
        fromCanonical: fromCode,
        fromName: fromStationData.name,
        to: toRaw,
        toCanonical: toCode,
        toName: toStationData.name,
        date: dateStr,
        quota,
        passengers: passCount,
        trainNumberOrName: params.trainNumberOrName,
        directOnly,
        sort,
      },
      summary: {
        total: filteredResults.length,
        direct: filteredResults.length,
        connecting: alternatives.connectingJourneys.length,
        dataStatus: primaryDataStatus,
        noResultReason,
      },
      results: filteredResults,
      alternatives: {
        nearbyStations: alternatives.nearbyStations,
        alternateDates: alternatives.alternateDates,
        connectingJourneysAvailable: alternatives.connectingJourneys.length > 0,
        connectingJourneys: alternatives.connectingJourneys,
      },
      meta: {
        source: localDirect.length > 0 ? 'RAILFLOW_PRISMA_MASTER' : 'INDIAN_RAILWAY_OPEN_DATA',
        canonicalRoute: `${fromCode} -> ${toCode}`,
        lastUpdated: new Date().toISOString(),
        canonicalResolution: {
          fromResolvedFrom: fromRes.isAlias ? fromRes.originalInput : undefined,
          toResolvedFrom: toRes.isAlias ? toRes.originalInput : undefined,
          fromIsAlias: fromRes.isAlias,
          toIsAlias: toRes.isAlias,
        },
      },
    };
  }

  /**
   * Search direct trains in local Prisma master DB
   */
  private async searchLocalPrismaTrains(
    fromCode: string,
    toCode: string,
    dateStr: string,
    quota: string
  ): Promise<any[]> {
    const [fromStation, toStation] = await Promise.all([
      prisma.station.findFirst({ where: { OR: [{ code: fromCode }, { id: fromCode }], isActive: true } }),
      prisma.station.findFirst({ where: { OR: [{ code: toCode }, { id: toCode }], isActive: true } }),
    ]);

    if (!fromStation || !toStation) return [];

    const routes = await prisma.route.findMany({
      where: {
        isActive: true,
        stations: {
          some: { stationId: fromStation.id },
        },
      },
      include: {
        stations: {
          include: { station: true },
          orderBy: { sequence: 'asc' },
        },
        schedules: {
          where: { isActive: true },
          include: {
            train: true,
            fareRules: true,
          },
        },
      },
    });

    const validSchedules: any[] = [];
    for (const route of routes) {
      const fromRS = route.stations.find((rs) => rs.stationId === fromStation.id);
      const toRS = route.stations.find((rs) => rs.stationId === toStation.id);

      if (!fromRS || !toRS) continue;
      if (fromRS.sequence >= toRS.sequence) continue; // Sequence check

      for (const schedule of route.schedules) {
        if (scheduleRunsOnDate(schedule.runningDays, dateStr)) {
          validSchedules.push({ schedule, route, fromRS, toRS, fromStn: fromStation, toStn: toStation });
        }
      }
    }

    const results = await Promise.all(
      validSchedules.map(async ({ schedule, route, fromRS, toRS, fromStn, toStn }) => {
        const trainRun = await ensureTrainRunInventory(schedule.id, dateStr);

        const classAvailability: Record<string, { available: number; fare: number; status: string }> = {};
        for (const rule of schedule.fareRules) {
          const avail = trainRun.coaches
            .filter((c: any) => c.classType === rule.classType)
            .reduce((sum: number, c: any) => sum + (c.totalSeats || 0), 0);

          classAvailability[rule.classType] = {
            available: Math.max(avail - 5, 0),
            fare: rule.baseFarePaise + rule.reservationCharge + rule.superfastCharge,
            status: avail > 5 ? 'AVAILABLE' : 'WAITLIST',
          };
        }

        const depTime = schedule.departureTime;
        const depOffsetMin = fromRS.departureOffsetMin || 0;
        const arrOffsetMin = toRS.arrivalOffsetMin || fromRS.departureOffsetMin || 0;
        const durationMin = Math.max(arrOffsetMin - depOffsetMin, 0);

        return {
          scheduleId: schedule.id,
          trainRunId: trainRun.id,
          bookable: true,
          dataStatus: 'LIVE' as DataConfidenceStatus,
          provenance: {
            provenance: 'RAILFLOW_DEMO',
            provenanceLabel: 'Live Berth Allocation',
            source: 'RAILFLOW_PRISMA_MASTER',
            providerName: 'RailFlow Live Serializable Inventory',
            isOfficial: true,
            isLive: true,
            cached: false,
            fetchedAt: new Date().toISOString(),
          },
          train: {
            id: schedule.train.id,
            number: schedule.train.number,
            name: schedule.train.name,
            type: schedule.train.type,
          },
          route: {
            id: route.id,
            name: route.name,
            totalStops: toRS.sequence - fromRS.sequence,
            stops: route.stations.map((s: any) => ({
              sequence: s.sequence,
              stationCode: s.station.code,
              stationName: s.station.name,
              distanceKm: s.distanceKm,
              platform: s.platformNumber,
            })),
          },
          fromStation: { code: fromStn.code, name: fromStn.name, sequence: fromRS.sequence },
          toStation: { code: toStn.code, name: toStn.name, sequence: toRS.sequence },
          journey: {
            fromStation: fromStn.code,
            toStation: toStn.code,
            fromStationName: fromStn.name,
            toStationName: toStn.name,
            departureTime: depTime,
            arrivalTime: '14:30',
            durationMinutes: durationMin,
            distanceKm: toRS.distanceKm - fromRS.distanceKm,
            runDate: dateStr,
          },
          departureTime: depTime,
          arrivalTime: '14:30',
          durationMin,
          distanceKm: toRS.distanceKm - fromRS.distanceKm,
          runningDays: formatRunningDays(schedule.runningDays),
          classes: classAvailability,
          journeyDate: dateStr,
        };
      })
    );

    return results;
  }

  /**
   * Search direct trains in Indian Railway open timetable dataset
   */
  private async searchCatalogTrains(
    fromCode: string,
    toCode: string,
    dateStr: string
  ): Promise<any[]> {
    const rawItems = await indianRailwayService.searchTrainsBetween(fromCode, toCode, dateStr);

    return rawItems.map((item) => ({
      ...item,
      bookable: false,
      dataStatus: 'SCHEDULED' as DataConfidenceStatus,
      provenance: {
        provenance: 'STATIC_ROUTE',
        provenanceLabel: 'Static Timetable Data',
        source: 'INDIAN_RAILWAY_OPEN_DATA',
        providerName: 'Indian Railway Data (prasenjit-27/Indian-Railway-Data, MIT License)',
        isOfficial: false,
        isLive: false,
        cached: true,
        fetchedAt: new Date().toISOString(),
        limitations: [
          'Scheduled timetable data; does not provide real-time GPS telemetry.',
          'Sandbox bookings are simulated demonstrations.',
        ],
      },
    }));
  }

  /**
   * Build smart alternatives: nearby stations, alternate dates, connecting journeys
   */
  private async buildAlternatives(opts: {
    fromCode: string;
    fromName: string;
    toCode: string;
    toName: string;
    dateStr: string;
    directCount: number;
    directOnly: boolean;
  }): Promise<{
    nearbyStations: NearbyStationAlternative[];
    alternateDates: AlternateDateAlternative[];
    connectingJourneys: ConnectingJourney[];
  }> {
    const { fromCode, toCode, dateStr, directCount } = opts;

    // 1. Nearby Stations Alternatives
    const nearbyStations: NearbyStationAlternative[] = [];
    const originNearby = canonicalStationService.getNearbyStations(fromCode);
    const destNearby = canonicalStationService.getNearbyStations(toCode);

    for (const near of originNearby) {
      const trains = await indianRailwayService.searchTrainsBetween(near.code, toCode, dateStr);
      if (trains.length > 0) {
        nearbyStations.push({
          stationCode: near.code,
          stationName: near.name,
          role: 'ORIGIN',
          relation: near.relation,
          directTrainsCount: trains.length,
          searchUrl: `/search?from=${near.code}&to=${toCode}&date=${dateStr}`,
        });
      }
    }

    for (const near of destNearby) {
      const trains = await indianRailwayService.searchTrainsBetween(fromCode, near.code, dateStr);
      if (trains.length > 0) {
        nearbyStations.push({
          stationCode: near.code,
          stationName: near.name,
          role: 'DESTINATION',
          relation: near.relation,
          directTrainsCount: trains.length,
          searchUrl: `/search?from=${fromCode}&to=${near.code}&date=${dateStr}`,
        });
      }
    }

    // 2. Alternate Dates Alternatives
    const alternateDates: AlternateDateAlternative[] = [];
    const curDate = new Date(dateStr);

    for (let offset = -2; offset <= 3; offset++) {
      if (offset === 0) continue;
      const d = new Date(curDate);
      d.setDate(d.getDate() + offset);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) continue; // Skip past dates

      const dStr = d.toISOString().split('T')[0];
      const trainsOnDate = await indianRailwayService.searchTrainsBetween(fromCode, toCode, dStr);

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayLabel = `${dayNames[d.getDay()]}, ${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;

      if (trainsOnDate.length > 0 || offset === 1 || offset === -1) {
        alternateDates.push({
          date: dStr,
          dayLabel,
          directTrainsCount: trainsOnDate.length,
          isToday: d.toDateString() === today.toDateString(),
          searchUrl: `/search?from=${fromCode}&to=${toCode}&date=${dStr}`,
        });
      }
    }

    // 3. Connecting 1-Transfer Journeys (when direct trains are 0 or requested)
    let connectingJourneys: ConnectingJourney[] = [];
    if (directCount === 0) {
      connectingJourneys = await this.computeConnectingJourneys(fromCode, toCode, dateStr);
    }

    return {
      nearbyStations: nearbyStations.slice(0, 6),
      alternateDates: alternateDates.slice(0, 5),
      connectingJourneys: connectingJourneys.slice(0, 4),
    };
  }

  /**
   * Compute 1-transfer connecting journeys between origin and destination via major hubs
   */
  private async computeConnectingJourneys(
    fromCode: string,
    toCode: string,
    dateStr: string
  ): Promise<ConnectingJourney[]> {
    const connections: ConnectingJourney[] = [];

    for (const hub of MAJOR_TRANSFER_HUBS) {
      if (hub === fromCode || hub === toCode) continue;

      const leg1Trains = await indianRailwayService.searchTrainsBetween(fromCode, hub, dateStr);
      if (leg1Trains.length === 0) continue;

      const leg2Trains = await indianRailwayService.searchTrainsBetween(hub, toCode, dateStr);
      if (leg2Trains.length === 0) continue;

      // Find compatible leg pairs with minimum 45m and maximum 360m layover
      for (const t1 of leg1Trains.slice(0, 3)) {
        const arrMin1 = parseTimeToMinutes(t1.arrivalTime || '12:00:00');

        for (const t2 of leg2Trains.slice(0, 3)) {
          const depMin2 = parseTimeToMinutes(t2.departureTime || '14:00:00');
          let layover = depMin2 - arrMin1;
          if (layover < 0) {
            layover += 1440; // overnight layover
          }

          if (layover >= 45 && layover <= 360) {
            const dur1 = t1.durationMin || 180;
            const dur2 = t2.durationMin || 180;
            const totalDur = dur1 + layover + dur2;

            const hubStation = await this.resolveStationInfo(hub);

            connections.push({
              id: `conn-${t1.train.number}-${hub}-${t2.train.number}`,
              transferStation: {
                code: hub,
                name: hubStation?.name || hub,
              },
              totalDurationMin: totalDur,
              layoverMin: layover,
              leg1: {
                trainNumber: t1.train.number,
                trainName: t1.train.name,
                fromStation: fromCode,
                toStation: hub,
                departureTime: t1.departureTime,
                arrivalTime: t1.arrivalTime || '12:00',
                durationMin: dur1,
              },
              leg2: {
                trainNumber: t2.train.number,
                trainName: t2.train.name,
                fromStation: hub,
                toStation: toCode,
                departureTime: t2.departureTime,
                arrivalTime: t2.arrivalTime || '18:00',
                durationMin: dur2,
              },
            });

            if (connections.length >= 4) return connections;
          }
        }
      }
    }

    return connections;
  }

  private sortResults(results: any[], sort: string) {
    results.sort((a, b) => {
      if (sort === 'departure') {
        const aTime = a.departureTime === 'Not available' ? '99:99' : a.departureTime;
        const bTime = b.departureTime === 'Not available' ? '99:99' : b.departureTime;
        return aTime.localeCompare(bTime);
      }
      if (sort === 'arrival') {
        const aTime = a.arrivalTime === 'Not available' ? '99:99' : a.arrivalTime;
        const bTime = b.arrivalTime === 'Not available' ? '99:99' : b.arrivalTime;
        return aTime.localeCompare(bTime);
      }
      if (sort === 'duration') {
        return (a.durationMin || 9999) - (b.durationMin || 9999);
      }
      return 0;
    });
  }

  private async resolveStationInfo(code: string): Promise<{ code: string; name: string } | null> {
    const prismaStn = await prisma.station.findFirst({
      where: { OR: [{ code }, { id: code }] },
    });
    if (prismaStn) {
      return { code: prismaStn.code, name: prismaStn.name };
    }

    const irStn = indianRailwayService.getStationSync(code);
    if (irStn) {
      return { code: irStn.code, name: irStn.name };
    }

    return null;
  }
}

export const railSearchService = new RailSearchService();
