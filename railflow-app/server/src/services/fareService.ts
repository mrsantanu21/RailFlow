import { prisma } from '../db/prisma';

/**
 * Server-side fare calculation. Never trust fare totals from the browser.
 * Always recalculate before confirming a booking.
 */
export async function calculateFare(
  scheduleId: string,
  fromStationCode: string,
  toStationCode: string,
  classType: string,
  passengerCount: number,
  includeCatering: boolean = false
): Promise<{
  distanceKm: number;
  baseFarePaise: number;
  reservationCharge: number;
  superfastCharge: number;
  cateringCharge: number;
  gstPaise: number;
  subtotalPaise: number;
  totalPaise: number;
} | null> {
  const schedule = await prisma.trainSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      route: {
        include: {
          stations: {
            include: { station: true },
            orderBy: { sequence: 'asc' },
          },
        },
      },
      fareRules: {
        where: { classType: classType as any, isActive: true },
      },
    },
  });

  if (!schedule) return null;

  const fromRS = schedule.route.stations.find(rs => rs.station.code === fromStationCode.toUpperCase());
  const toRS = schedule.route.stations.find(rs => rs.station.code === toStationCode.toUpperCase());

  if (!fromRS || !toRS || fromRS.sequence >= toRS.sequence) return null;

  const fareRule = schedule.fareRules[0];
  if (!fareRule) return null;

  const distanceKm = toRS.distanceKm - fromRS.distanceKm;
  const baseFarePerPax = Math.round((fareRule.baseFarePaise * distanceKm) / 100); // per 100km base rate
  const cateringPerPax = includeCatering ? fareRule.cateringCharge : 0;
  const chargesPerPax = fareRule.reservationCharge + fareRule.superfastCharge + cateringPerPax;
  const subtotalPerPax = baseFarePerPax + chargesPerPax;
  const subtotalAll = subtotalPerPax * passengerCount;
  const gstPaise = Math.round(subtotalAll * fareRule.gstPercent / 100);
  const totalPaise = subtotalAll + gstPaise;

  return {
    distanceKm,
    baseFarePaise: baseFarePerPax * passengerCount,
    reservationCharge: fareRule.reservationCharge * passengerCount,
    superfastCharge: fareRule.superfastCharge * passengerCount,
    cateringCharge: cateringPerPax * passengerCount,
    gstPaise,
    subtotalPaise: subtotalAll,
    totalPaise,
  };
}
