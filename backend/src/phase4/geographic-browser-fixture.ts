import {
  PrismaClient,
  UserRole,
  UserStatus,
  WoStatus,
  WoType,
} from '@prisma/client';

const prisma = new PrismaClient();

const tag = `geo-browser-e2e-${Date.now()}`;

async function main() {
  console.log('');
  console.log('=== PHASE 4 GEOGRAPHIC BROWSER FIXTURE ===');
  console.log(`Fixture tag: ${tag}`);

  const originLat = 14.400000;
  const originLng = 120.940000;

  console.log('');
  console.log('=== 1. CREATE TEAM ===');

  const team = await prisma.team.create({
    data: {
      name: `${tag}-team`,
    },
  });

  console.log(`PASS: team created: ${team.id}`);

  console.log('');
  console.log('=== 2. CREATE MANAGEMENT ACTOR ===');

  const controller = await prisma.user.create({
    data: {
      role: UserRole.JOB_CONTROLLER,
      name: `${tag}-controller`,
      email: `${tag}-controller@example.invalid`,
      status: UserStatus.ONLINE,
    },
  });

  console.log(`PASS: controller created: ${controller.id}`);

  console.log('');
  console.log('=== 3. CREATE TECHNICIANS ===');

  const freshTech = await prisma.user.create({
    data: {
      role: UserRole.TECHNICIAN,
      teamId: team.id,
      name: 'GEO E2E — Fresh Technician',
      email: `${tag}-fresh@example.invalid`,
      status: UserStatus.AVAILABLE,
      lastLat: originLat,
      lastLng: originLng,
      lastLocationAt: new Date(),
    },
  });

  const staleTech = await prisma.user.create({
    data: {
      role: UserRole.TECHNICIAN,
      teamId: team.id,
      name: 'GEO E2E — Stale Technician',
      email: `${tag}-stale@example.invalid`,
      status: UserStatus.AVAILABLE,
      lastLat: originLat + 0.002,
      lastLng: originLng + 0.002,
      lastLocationAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });

  const offlineTech = await prisma.user.create({
    data: {
      role: UserRole.TECHNICIAN,
      teamId: team.id,
      name: 'GEO E2E — Offline Technician',
      email: `${tag}-offline@example.invalid`,
      status: UserStatus.OFFLINE,
      lastLat: originLat + 0.004,
      lastLng: originLng + 0.004,
      lastLocationAt: new Date(),
    },
  });

  console.log(`PASS: fresh technician:   ${freshTech.id}`);
  console.log(`PASS: stale technician:   ${staleTech.id}`);
  console.log(`PASS: offline technician: ${offlineTech.id}`);

  console.log('');
  console.log('=== 4. CREATE SUBSCRIBERS + WORK ORDERS ===');

  const locations = [
    {
      label: 'NEAR',
      lat: 14.401000,
      lng: 120.940000,
      priority: 3,
    },
    {
      label: 'MIDDLE',
      lat: 14.405000,
      lng: 120.940000,
      priority: 2,
    },
    {
      label: 'FAR',
      lat: 14.410000,
      lng: 120.940000,
      priority: 1,
    },
  ];

  const created: Array<{
    woNumber: string;
    subscriber: string;
    lat: number;
    lng: number;
  }> = [];

  for (const location of locations) {
    const suffix = location.label.toLowerCase();

    const subscriber = await prisma.subscriber.create({
      data: {
        accountNumber: `${tag}-${suffix}-acct`,
        name: `GEO E2E — ${location.label} Subscriber`,
        address: `Browser Geographic Test — ${location.label}`,
        contactNumber: '0000000000',
        plan: 'GEO-BROWSER-E2E',
        lat: location.lat,
        lng: location.lng,
        verified: true,
      },
    });

    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `${tag}-${suffix}-wo`,
        type: WoType.REPAIR,
        status: WoStatus.ASSIGNED,
        subscriberId: subscriber.id,
        priority: location.priority,
        createdBy: controller.id,
      },
    });

    await prisma.assignment.create({
      data: {
        workOrderId: wo.id,
        teamId: team.id,
        assignedBy: controller.id,
      },
    });

    created.push({
      woNumber: wo.woNumber,
      subscriber: subscriber.name,
      lat: location.lat,
      lng: location.lng,
    });

    console.log(`PASS: ${location.label} work order created.`);
  }

  console.log('');
  console.log('=== 5. FIXTURE SUMMARY ===');

  console.log(`TAG: ${tag}`);
  console.log(`TEAM: ${team.name}`);
  console.log(`FRESH TECHNICIAN: ${freshTech.name}`);
  console.log(`FRESH TECHNICIAN ID: ${freshTech.id}`);
  console.log(`STALE TECHNICIAN: ${staleTech.name}`);
  console.log(`OFFLINE TECHNICIAN: ${offlineTech.name}`);

  console.log('');
  console.log('Expected geographic sequence:');

  created.forEach((item, index) => {
    console.log(
      `  ${index + 1}. ${item.woNumber} — ${item.subscriber}`,
    );
  });

  console.log('');
  console.log('=== BROWSER FIXTURE READY ===');
  console.log('');
  console.log('IMPORTANT:');
  console.log('Fixture intentionally remains in PostgreSQL.');
  console.log('DO NOT rerun this script.');
  console.log('DO NOT assign/reassign the test work orders.');
  console.log('DO NOT start/complete the test work orders.');
  console.log('Use the management UI for READ-ONLY inspection and Dispatch preview.');
  console.log('Cleanup will be performed with a separate controlled command.');
}

main()
  .catch((error) => {
    console.error('');
    console.error('FAIL: browser fixture creation failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
