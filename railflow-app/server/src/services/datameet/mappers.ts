import { DatameetScheduleStop, DatameetStation, DatameetTrain } from './types';

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === 'None' || text.toLowerCase() === 'null') return null;
  return text;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === 'None') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asCoordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng === 0 && lat === 0) return null;
  return [lng, lat];
}

export function mapStationFeature(feature: any): DatameetStation | null {
  const props = feature?.properties || {};
  const code = asNullableString(props.code)?.toUpperCase();
  if (!code) return null;
  const coords = asCoordinatePair(feature?.geometry?.coordinates);
  return {
    code,
    name: asNullableString(props.name) || code,
    state: asNullableString(props.state),
    zone: asNullableString(props.zone),
    address: asNullableString(props.address),
    longitude: coords ? coords[0] : null,
    latitude: coords ? coords[1] : null,
  };
}

function classListFromTrainProps(props: any): string[] {
  const classes: string[] = [];
  if (props?.first_ac) classes.push('ONE_AC');
  if (props?.second_ac) classes.push('TWO_AC');
  if (props?.third_ac) classes.push('THREE_AC');
  if (props?.sleeper) classes.push('SLEEPER');
  if (props?.chair_car) classes.push('CHAIR_CAR');
  if (props?.first_class) classes.push('FIRST_CLASS');
  return classes;
}

export function mapTrainFeature(feature: any): DatameetTrain | null {
  const props = feature?.properties || {};
  const number = asNullableString(props.number);
  if (!number) return null;
  const rawCoords = feature?.geometry?.coordinates;
  let coordinates: Array<[number, number]> | null = null;
  if (Array.isArray(rawCoords)) {
    const parsed = rawCoords
      .map((pair) => asCoordinatePair(pair))
      .filter((pair): pair is [number, number] => pair !== null);
    coordinates = parsed.length >= 2 ? parsed : null;
  }
  const durationH = asNullableNumber(props.duration_h) ?? 0;
  const durationM = asNullableNumber(props.duration_m) ?? 0;
  const durationMinutes =
    props.duration_h != null || props.duration_m != null ? durationH * 60 + durationM : null;

  return {
    number,
    name: asNullableString(props.name) || `Train ${number}`,
    type: asNullableString(props.type),
    zone: asNullableString(props.zone),
    fromStationCode: asNullableString(props.from_station_code)?.toUpperCase() ?? null,
    fromStationName: asNullableString(props.from_station_name),
    toStationCode: asNullableString(props.to_station_code)?.toUpperCase() ?? null,
    toStationName: asNullableString(props.to_station_name),
    departure: asNullableString(props.departure),
    arrival: asNullableString(props.arrival),
    durationMinutes,
    distanceKm: asNullableNumber(props.distance),
    returnTrain: asNullableString(props.return_train),
    classes: classListFromTrainProps(props),
    coordinates,
  };
}

export function mapScheduleRow(row: any): DatameetScheduleStop | null {
  const trainNumber = asNullableString(row?.train_number);
  const stationCode = asNullableString(row?.station_code)?.toUpperCase();
  if (!trainNumber || !stationCode) return null;
  return {
    id: asNullableNumber(row?.id),
    trainNumber,
    trainName: asNullableString(row?.train_name),
    stationCode,
    stationName: asNullableString(row?.station_name),
    arrival: asNullableString(row?.arrival),
    departure: asNullableString(row?.departure),
    day: asNullableNumber(row?.day),
  };
}

export function minutesBetween(start: string | null, startDay: number | null, end: string | null, endDay: number | null): number | null {
  if (!start || !end) return null;
  const startParts = start.split(':').map(Number);
  const endParts = end.split(':').map(Number);
  if (startParts.length < 2 || endParts.length < 2) return null;
  const startMin = startParts[0] * 60 + startParts[1] + ((startDay ?? 1) - 1) * 24 * 60;
  const endMin = endParts[0] * 60 + endParts[1] + ((endDay ?? 1) - 1) * 24 * 60;
  const diff = endMin - startMin;
  return diff >= 0 ? diff : null;
}
