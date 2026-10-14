import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting RailFlow Master Data Seeding...');

  // ─── 1. Demo Users (Admin & Passenger) ──────────────────────────────────────
  const adminPasswordHash = await argon2.hash('Admin@123', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const passengerPasswordHash = await argon2.hash('Passenger@123', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  await prisma.user.upsert({
    where: { email: 'admin@railflow.in' },
    update: { name: 'RailFlow Administrator', role: 'ADMIN' },
    create: {
      email: 'admin@railflow.in',
      name: 'RailFlow Administrator',
      passwordHash: adminPasswordHash,
      phone: '9999999999',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { email: 'passenger@railflow.in' },
    update: { name: 'Demo Passenger', role: 'USER' },
    create: {
      email: 'passenger@railflow.in',
      name: 'Demo Passenger',
      passwordHash: passengerPasswordHash,
      phone: '9876543210',
      role: 'USER',
    },
  });

  console.log('✅ Demo users seeded (admin@railflow.in / passenger@railflow.in)');

  // ─── 2. Indian Railway Stations ─────────────────────────────────────────────
  const stationsData = [
    {
      code: 'NDLS',
      name: 'New Delhi',
      fullName: 'New Delhi Railway Station',
      zone: 'Northern Railway (NR)',
      state: 'Delhi',
    },
    {
      code: 'HWH',
      name: 'Howrah',
      fullName: 'Howrah Junction Railway Station',
      zone: 'Eastern Railway (ER)',
      state: 'West Bengal',
    },
    {
      code: 'MMCT',
      name: 'Mumbai Central',
      fullName: 'Mumbai Central Railway Station',
      zone: 'Western Railway (WR)',
      state: 'Maharashtra',
    },
    {
      code: 'CNB',
      name: 'Kanpur Central',
      fullName: 'Kanpur Central Junction',
      zone: 'North Central Railway (NCR)',
      state: 'Uttar Pradesh',
    },
    {
      code: 'BSB',
      name: 'Varanasi',
      fullName: 'Varanasi Junction (Cantt)',
      zone: 'Northern Railway (NR)',
      state: 'Uttar Pradesh',
    },
    {
      code: 'AGC',
      name: 'Agra Cantt',
      fullName: 'Agra Cantt Railway Station',
      zone: 'North Central Railway (NCR)',
      state: 'Uttar Pradesh',
    },
    {
      code: 'MAS',
      name: 'Chennai Central',
      fullName: 'Puratchi Thalaivar Dr. M.G. Ramachandran Central Railway Station',
      zone: 'Southern Railway (SR)',
      state: 'Tamil Nadu',
    },
    {
      code: 'SBC',
      name: 'KSR Bengaluru',
      fullName: 'Krantivira Sangolli Rayanna Bengaluru Station',
      zone: 'South Western Railway (SWR)',
      state: 'Karnataka',
    },
  ];

  const stations: Record<string, { id: string; code: string; name: string }> = {};

  for (const s of stationsData) {
    const station = await prisma.station.upsert({
      where: { code: s.code },
      update: { name: s.name, fullName: s.fullName, zone: s.zone, state: s.state, isActive: true },
      create: { ...s, isActive: true },
    });
    stations[s.code] = station;
  }
  console.log(`✅ ${Object.keys(stations).length} Master Stations seeded.`);

  // ─── 3. Trains ──────────────────────────────────────────────────────────────
  const trainsData = [
    {
      number: '22436',
      name: 'Vande Bharat Express',
      type: 'VANDE_BHARAT',
    },
    {
      number: '12301',
      name: 'Howrah Rajdhani Express',
      type: 'RAJDHANI',
    },
    {
      number: '12002',
      name: 'Bhopal Shatabdi Express',
      type: 'SHATABDI',
    },
    {
      number: '12622',
      name: 'Tamil Nadu Superfast Express',
      type: 'SUPERFAST',
    },
  ];

  const trains: Record<string, { id: string; number: string; name: string }> = {};

  for (const t of trainsData) {
    const train = await prisma.train.upsert({
      where: { number: t.number },
      update: { name: t.name, type: t.type, isActive: true },
      create: { ...t, isActive: true },
    });
    trains[t.number] = train;
  }
  console.log(`✅ ${Object.keys(trains).length} Master Trains seeded.`);

  // ─── 4. Routes & Ordered Stops ──────────────────────────────────────────────
  // Route 1: New Delhi -> Kanpur -> Varanasi
  let routeVB = await prisma.route.findFirst({ where: { name: 'New Delhi – Varanasi Vande Bharat Route' } });
  if (!routeVB) {
    routeVB = await prisma.route.create({
      data: { name: 'New Delhi – Varanasi Vande Bharat Route', isActive: true },
    });
  }

  const vbStops = [
    { stationId: stations['NDLS'].id, sequence: 1, dist: 0, arr: null, dep: 0, plat: '16' },
    { stationId: stations['CNB'].id, sequence: 2, dist: 440, arr: 240, dep: 245, plat: '1' },
    { stationId: stations['BSB'].id, sequence: 3, dist: 755, arr: 480, dep: null, plat: '1' },
  ];
  for (const stop of vbStops) {
    await prisma.routeStation.upsert({
      where: { routeId_sequence: { routeId: routeVB.id, sequence: stop.sequence } },
      update: {
        stationId: stop.stationId,
        distanceKm: stop.dist,
        arrivalOffsetMin: stop.arr,
        departureOffsetMin: stop.dep,
        platformNumber: stop.plat,
      },
      create: {
        routeId: routeVB.id,
        stationId: stop.stationId,
        sequence: stop.sequence,
        distanceKm: stop.dist,
        arrivalOffsetMin: stop.arr,
        departureOffsetMin: stop.dep,
        platformNumber: stop.plat,
      },
    });
  }

  // Route 2: Howrah -> Varanasi -> Kanpur -> New Delhi
  let routeRajdhani = await prisma.route.findFirst({ where: { name: 'Howrah – New Delhi Rajdhani Route' } });
  if (!routeRajdhani) {
    routeRajdhani = await prisma.route.create({
      data: { name: 'Howrah – New Delhi Rajdhani Route', isActive: true },
    });
  }

  const rajdhaniStops = [
    { stationId: stations['HWH'].id, sequence: 1, dist: 0, arr: null, dep: 0, plat: '9' },
    { stationId: stations['BSB'].id, sequence: 2, dist: 680, arr: 455, dep: 465, plat: '5' },
    { stationId: stations['CNB'].id, sequence: 3, dist: 1010, arr: 725, dep: 735, plat: '2' },
    { stationId: stations['NDLS'].id, sequence: 4, dist: 1450, arr: 1020, dep: null, plat: '1' },
  ];
  for (const stop of rajdhaniStops) {
    await prisma.routeStation.upsert({
      where: { routeId_sequence: { routeId: routeRajdhani.id, sequence: stop.sequence } },
      update: {
        stationId: stop.stationId,
        distanceKm: stop.dist,
        arrivalOffsetMin: stop.arr,
        departureOffsetMin: stop.dep,
        platformNumber: stop.plat,
      },
      create: {
        routeId: routeRajdhani.id,
        stationId: stop.stationId,
        sequence: stop.sequence,
        distanceKm: stop.dist,
        arrivalOffsetMin: stop.arr,
        departureOffsetMin: stop.dep,
        platformNumber: stop.plat,
      },
    });
  }

  // Route 3: New Delhi -> Agra Cantt
  let routeShatabdi = await prisma.route.findFirst({ where: { name: 'New Delhi – Agra Cantt Shatabdi Route' } });
  if (!routeShatabdi) {
    routeShatabdi = await prisma.route.create({
      data: { name: 'New Delhi – Agra Cantt Shatabdi Route', isActive: true },
    });
  }

  const shatabdiStops = [
    { stationId: stations['NDLS'].id, sequence: 1, dist: 0, arr: null, dep: 0, plat: '1' },
    { stationId: stations['AGC'].id, sequence: 2, dist: 195, arr: 110, dep: null, plat: '1' },
  ];
  for (const stop of shatabdiStops) {
    await prisma.routeStation.upsert({
      where: { routeId_sequence: { routeId: routeShatabdi.id, sequence: stop.sequence } },
      update: {
        stationId: stop.stationId,
        distanceKm: stop.dist,
        arrivalOffsetMin: stop.arr,
        departureOffsetMin: stop.dep,
        platformNumber: stop.plat,
      },
      create: {
        routeId: routeShatabdi.id,
        stationId: stop.stationId,
        sequence: stop.sequence,
        distanceKm: stop.dist,
        arrivalOffsetMin: stop.arr,
        departureOffsetMin: stop.dep,
        platformNumber: stop.plat,
      },
    });
  }

  console.log('✅ Master Routes and Stops configured.');

  // ─── 5. Schedules ───────────────────────────────────────────────────────────
  let schedVB = await prisma.trainSchedule.findFirst({
    where: { trainId: trains['22436'].id, routeId: routeVB.id },
  });
  if (!schedVB) {
    schedVB = await prisma.trainSchedule.create({
      data: {
        trainId: trains['22436'].id,
        routeId: routeVB.id,
        runningDays: 127, // Daily
        departureTime: '06:00',
        isActive: true,
      },
    });
  }

  let schedRajdhani = await prisma.trainSchedule.findFirst({
    where: { trainId: trains['12301'].id, routeId: routeRajdhani.id },
  });
  if (!schedRajdhani) {
    schedRajdhani = await prisma.trainSchedule.create({
      data: {
        trainId: trains['12301'].id,
        routeId: routeRajdhani.id,
        runningDays: 127, // Daily
        departureTime: '16:55',
        isActive: true,
      },
    });
  }

  let schedShatabdi = await prisma.trainSchedule.findFirst({
    where: { trainId: trains['12002'].id, routeId: routeShatabdi.id },
  });
  if (!schedShatabdi) {
    schedShatabdi = await prisma.trainSchedule.create({
      data: {
        trainId: trains['12002'].id,
        routeId: routeShatabdi.id,
        runningDays: 127, // Daily
        departureTime: '06:00',
        isActive: true,
      },
    });
  }

  console.log('✅ Train Schedules created.');

  // ─── 6. Fare Rules (All amounts in integer paise) ───────────────────────────
  // Vande Bharat: EC and CC
  await prisma.fareRule.upsert({
    where: { scheduleId_classType: { scheduleId: schedVB.id, classType: 'EXEC_CHAIR' } },
    update: { baseFarePaise: 350, reservationCharge: 6000, superfastCharge: 4500, cateringCharge: 35000, gstPercent: 5 },
    create: {
      scheduleId: schedVB.id,
      classType: 'EXEC_CHAIR',
      baseFarePaise: 350,
      reservationCharge: 6000,
      superfastCharge: 4500,
      cateringCharge: 35000,
      gstPercent: 5,
    },
  });
  await prisma.fareRule.upsert({
    where: { scheduleId_classType: { scheduleId: schedVB.id, classType: 'CHAIR_CAR' } },
    update: { baseFarePaise: 180, reservationCharge: 4000, superfastCharge: 4500, cateringCharge: 22000, gstPercent: 5 },
    create: {
      scheduleId: schedVB.id,
      classType: 'CHAIR_CAR',
      baseFarePaise: 180,
      reservationCharge: 4000,
      superfastCharge: 4500,
      cateringCharge: 22000,
      gstPercent: 5,
    },
  });

  // Rajdhani: 1A, 2A, 3A
  await prisma.fareRule.upsert({
    where: { scheduleId_classType: { scheduleId: schedRajdhani.id, classType: 'ONE_AC' } },
    update: { baseFarePaise: 420, reservationCharge: 6000, superfastCharge: 7500, cateringCharge: 40000, gstPercent: 5 },
    create: {
      scheduleId: schedRajdhani.id,
      classType: 'ONE_AC',
      baseFarePaise: 420,
      reservationCharge: 6000,
      superfastCharge: 7500,
      cateringCharge: 40000,
      gstPercent: 5,
    },
  });
  await prisma.fareRule.upsert({
    where: { scheduleId_classType: { scheduleId: schedRajdhani.id, classType: 'TWO_AC' } },
    update: { baseFarePaise: 260, reservationCharge: 5000, superfastCharge: 4500, cateringCharge: 30000, gstPercent: 5 },
    create: {
      scheduleId: schedRajdhani.id,
      classType: 'TWO_AC',
      baseFarePaise: 260,
      reservationCharge: 5000,
      superfastCharge: 4500,
      cateringCharge: 30000,
      gstPercent: 5,
    },
  });
  await prisma.fareRule.upsert({
    where: { scheduleId_classType: { scheduleId: schedRajdhani.id, classType: 'THREE_AC' } },
    update: { baseFarePaise: 180, reservationCharge: 4000, superfastCharge: 4500, cateringCharge: 25000, gstPercent: 5 },
    create: {
      scheduleId: schedRajdhani.id,
      classType: 'THREE_AC',
      baseFarePaise: 180,
      reservationCharge: 4000,
      superfastCharge: 4500,
      cateringCharge: 25000,
      gstPercent: 5,
    },
  });

  // Shatabdi: EC and CC
  await prisma.fareRule.upsert({
    where: { scheduleId_classType: { scheduleId: schedShatabdi.id, classType: 'EXEC_CHAIR' } },
    update: { baseFarePaise: 400, reservationCharge: 6000, superfastCharge: 4500, cateringCharge: 20000, gstPercent: 5 },
    create: {
      scheduleId: schedShatabdi.id,
      classType: 'EXEC_CHAIR',
      baseFarePaise: 400,
      reservationCharge: 6000,
      superfastCharge: 4500,
      cateringCharge: 20000,
      gstPercent: 5,
    },
  });
  await prisma.fareRule.upsert({
    where: { scheduleId_classType: { scheduleId: schedShatabdi.id, classType: 'CHAIR_CAR' } },
    update: { baseFarePaise: 210, reservationCharge: 4000, superfastCharge: 4500, cateringCharge: 15000, gstPercent: 5 },
    create: {
      scheduleId: schedShatabdi.id,
      classType: 'CHAIR_CAR',
      baseFarePaise: 210,
      reservationCharge: 4000,
      superfastCharge: 4500,
      cateringCharge: 15000,
      gstPercent: 5,
    },
  });

  console.log('✅ Fare Rules seeded.');

  // ─── 7. Calendar Train Runs & Coaches/Seats ─────────────────────────────────
  // Generate runs for today and next 14 days
  const today = new Date();
  const dateStrings: string[] = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dateStrings.push(d.toISOString().split('T')[0]);
  }

  const activeSchedules = [
    {
      schedule: schedVB,
      coaches: [
        { coachNumber: 'E1', classType: 'EXEC_CHAIR', seatCount: 52 },
        { coachNumber: 'C1', classType: 'CHAIR_CAR', seatCount: 78 },
        { coachNumber: 'C2', classType: 'CHAIR_CAR', seatCount: 78 },
      ],
    },
    {
      schedule: schedRajdhani,
      coaches: [
        { coachNumber: 'H1', classType: 'ONE_AC', seatCount: 24 },
        { coachNumber: 'A1', classType: 'TWO_AC', seatCount: 46 },
        { coachNumber: 'B1', classType: 'THREE_AC', seatCount: 64 },
        { coachNumber: 'B2', classType: 'THREE_AC', seatCount: 64 },
      ],
    },
    {
      schedule: schedShatabdi,
      coaches: [
        { coachNumber: 'E1', classType: 'EXEC_CHAIR', seatCount: 52 },
        { coachNumber: 'C1', classType: 'CHAIR_CAR', seatCount: 78 },
      ],
    },
  ];

  const berthTypesSleeper = ['LOWER', 'MIDDLE', 'UPPER', 'LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'];
  const berthTypesChair = ['WINDOW', 'AISLE'];

  for (const item of activeSchedules) {
    for (const runDate of dateStrings) {
      const trainRun = await prisma.trainRun.upsert({
        where: {
          scheduleId_runDate: {
            scheduleId: item.schedule.id,
            runDate,
          },
        },
        update: { status: 'SCHEDULED' },
        create: {
          scheduleId: item.schedule.id,
          runDate,
          status: 'SCHEDULED',
        },
      });

      for (const c of item.coaches) {
        const coach = await prisma.coach.upsert({
          where: {
            trainRunId_coachNumber: {
              trainRunId: trainRun.id,
              coachNumber: c.coachNumber,
            },
          },
          update: { totalSeats: c.seatCount, classType: c.classType },
          create: {
            trainRunId: trainRun.id,
            coachNumber: c.coachNumber,
            classType: c.classType,
            totalSeats: c.seatCount,
          },
        });

        // Check if seats already created
        const existingSeatCount = await prisma.seat.count({ where: { coachId: coach.id } });
        if (existingSeatCount < c.seatCount) {
          const isChair = c.classType === 'CHAIR_CAR' || c.classType === 'EXEC_CHAIR';
          const seatsData = [];
          for (let sNum = existingSeatCount + 1; sNum <= c.seatCount; sNum++) {
            const berthType = isChair
              ? berthTypesChair[(sNum - 1) % berthTypesChair.length]
              : berthTypesSleeper[(sNum - 1) % berthTypesSleeper.length];
            seatsData.push({
              coachId: coach.id,
              seatNumber: sNum,
              berthType,
            });
          }
          await prisma.seat.createMany({
            data: seatsData,
          });
        }
      }
    }
  }

  console.log(`✅ TrainRuns and Coaches/Seats populated across 15 calendar days.`);
  console.log('🎉 RailFlow Master Data Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
