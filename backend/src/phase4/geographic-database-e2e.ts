import {
  PrismaClient,
  UserRole,
  UserStatus,
  WoStatus,
  WoType,
} from '@prisma/client';

import { WorkOrdersService } from '../work-orders/work-orders.service';
import { WorkOrdersPhase2Service } from '../work-orders/work-orders-phase2.service';

const prisma = new PrismaClient();
const tag = `geo-e2e-${Date.now()}`;

const workOrders = new WorkOrdersService(prisma as any);
const smartNext = new WorkOrdersPhase2Service(prisma as any);

function ok(name: string, condition: unknown) {
  if (!condition) {
    throw new Error(`FAIL: ${name}`);
  }
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('');
  console.log('=== PHASE 4 GEOGRAPHIC DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  let teamId: string | null = null;
  let controllerId: string | null = null;
  let freshTechId: string | null = null;
  let staleTechId: string | null = null;
  let offlineTechId: string | null = null;

  const subscriberIds: string[] = [];
  const workOrderIds: string[] = [];

  try {
    /*
     * Controlled coordinates.
     * They are test coordinates only and are not intended
     * to represent a real subscriber or technician.
     */
    const originLat = 14.400000;
    const originLng = 120.940000;

    console.log('');
    console.log('=== 1. CREATE ISOLATED FIXTURE ===');

    const team = await prisma.team.create({
      data: {
        name: `${tag}-team`,
      },
    });

    teamId = team.id;

    const controller = await prisma.user.create({
      data: {
        role: UserRole.JOB_CONTROLLER,
        name: `${tag}-controller`,
        email: `${tag}-controller@example.invalid`,
        status: UserStatus.ONLINE,
      },
    });

    controllerId = controller.id;

    const freshTech = await prisma.user.create({
      data: {
        role: UserRole.TECHNICIAN,
        teamId: team.id,
        name: `${tag}-fresh-tech`,
        email: `${tag}-fresh-tech@example.invalid`,
        status: UserStatus.AVAILABLE,
        lastLat: originLat,
        lastLng: originLng,
        lastLocationAt: new Date(),
      },
    });

    freshTechId = freshTech.id;

    const staleTech = await prisma.user.create({
      data: {
        role: UserRole.TECHNICIAN,
        teamId: team.id,
        name: `${tag}-stale-tech`,
        email: `${tag}-stale-tech@example.invalid`,
        status: UserStatus.AVAILABLE,
        lastLat: originLat,
        lastLng: originLng,
        lastLocationAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    staleTechId = staleTech.id;

    const offlineTech = await prisma.user.create({
      data: {
        role: UserRole.TECHNICIAN,
        teamId: team.id,
        name: `${tag}-offline-tech`,
        email: `${tag}-offline-tech@example.invalid`,
        status: UserStatus.OFFLINE,
        lastLat: originLat,
        lastLng: originLng,
        lastLocationAt: new Date(),
      },
    });

    offlineTechId = offlineTech.id;

    ok('fixture team created', !!team.id);
    ok('fresh technician created', !!freshTech.id);
    ok('stale technician created', !!staleTech.id);
    ok('offline technician created', !!offlineTech.id);

    console.log('');
    console.log('=== 2. CREATE GEOGRAPHIC WORK ORDERS ===');

    const locations = [
      {
        suffix: 'near',
        lat: 14.401000,
        lng: 120.940000,
        priority: 3,
      },
      {
        suffix: 'middle',
        lat: 14.405000,
        lng: 120.940000,
        priority: 1,
      },
      {
        suffix: 'far',
        lat: 14.410000,
        lng: 120.940000,
        priority: 1,
      },
    ];

    for (const item of locations) {
      const subscriber = await prisma.subscriber.create({
        data: {
          accountNumber: `${tag}-${item.suffix}-acct`,
          name: `${tag}-${item.suffix}-subscriber`,
          address: `Geographic E2E ${item.suffix}`,
          contactNumber: '0000000000',
          plan: 'GEO-E2E',
          lat: item.lat,
          lng: item.lng,
          verified: true,
        },
      });

      subscriberIds.push(subscriber.id);

      const wo = await prisma.workOrder.create({
        data: {
          woNumber: `${tag}-${item.suffix}-wo`,
          type: WoType.REPAIR,
          status: WoStatus.ASSIGNED,
          subscriberId: subscriber.id,
          priority: item.priority,
          createdBy: controller.id,
        },
      });

      workOrderIds.push(wo.id);

      await prisma.assignment.create({
        data: {
          workOrderId: wo.id,
          teamId: team.id,
          assignedBy: controller.id,
        },
      });
    }

    ok('three controlled work orders created', workOrderIds.length === 3);

    console.log('');
    console.log('=== 3. NEARBY — FRESH GPS ===');

    const nearby = await workOrders.findNearbyTechnicians(
      originLat,
      originLng,
      3000,
    );

    const freshResult = nearby.find((x: any) => x.id === freshTech.id);

    ok('fresh technician returned by Nearby', !!freshResult);
    ok(
      'fresh technician proximity eligible',
      freshResult?.canUseForProximity === true,
    );
    ok(
      'fresh technician reported non-stale',
      freshResult?.isStale === false,
    );

    console.log('');
    console.log('=== 4. STALE / OFFLINE EXCLUSION ===');

    ok(
      'stale technician excluded from Nearby',
      !nearby.some((x: any) => x.id === staleTech.id),
    );

    ok(
      'offline technician excluded from Nearby',
      !nearby.some((x: any) => x.id === offlineTech.id),
    );

    console.log('');
    console.log('=== 5. SNAPSHOT ASSIGNMENTS BEFORE SMART NEXT ===');

    const beforeAssignments = await prisma.assignment.findMany({
      where: {
        workOrderId: {
          in: workOrderIds,
        },
      },
      orderBy: [
        { workOrderId: 'asc' },
        { assignedAt: 'asc' },
      ],
      select: {
        id: true,
        workOrderId: true,
        teamId: true,
        assignedBy: true,
      },
    });

    const beforeWorkOrders = await prisma.workOrder.findMany({
      where: {
        id: {
          in: workOrderIds,
        },
      },
      orderBy: {
        woNumber: 'asc',
      },
      select: {
        id: true,
        woNumber: true,
        status: true,
        priority: true,
      },
    });

    ok(
      'all geographic WOs assigned before recommendation',
      beforeWorkOrders.length === 3 &&
        beforeWorkOrders.every((wo) => wo.status === WoStatus.ASSIGNED),
    );

    console.log('');
    console.log('=== 6. SMART NEXT RECOMMENDATION ===');

    const suggestion = await smartNext.suggestNextJob(
      freshTech.id,
      originLat,
      originLng,
    );

    ok(
      'Smart Next is advisory only',
      suggestion.advisoryOnly === true,
    );

    ok(
      'Smart Next requires management approval',
      suggestion.requiresManagementApproval === true,
    );

    ok(
      'Smart Next returned three geographic suggestions',
      suggestion.suggestions.length === 3,
    );

    ok(
      'Smart Next recommended a work order',
      !!suggestion.recommended,
    );

    const expectedNearWo = `${tag}-near-wo`;

    ok(
      'nearest geographic work order recommended first',
      suggestion.recommended?.woNumber === expectedNearWo,
    );

    ok(
      'recommended job sequence is 1',
      suggestion.recommended?.sequence === 1,
    );

    const distances = suggestion.suggestions.map(
      (item: any) => item.distance_m,
    );

    ok(
      'geographic suggestions sorted nearest to farthest',
      distances.every(
        (distance: number, index: number) =>
          index === 0 || distances[index - 1] <= distance,
      ),
    );

    ok(
      'sequence numbers are geographic order',
      suggestion.suggestions.every(
        (item: any, index: number) =>
          item.sequence === index + 1,
      ),
    );

    console.log('');
    console.log('Smart Next geographic sequence:');

    for (const item of suggestion.suggestions) {
      console.log(
        `  ${item.sequence}. ${item.woNumber} — ${item.distance_m} m`,
      );
    }

    console.log('');
    console.log('=== 7. VERIFY SMART NEXT DID NOT MUTATE STATE ===');

    const afterAssignments = await prisma.assignment.findMany({
      where: {
        workOrderId: {
          in: workOrderIds,
        },
      },
      orderBy: [
        { workOrderId: 'asc' },
        { assignedAt: 'asc' },
      ],
      select: {
        id: true,
        workOrderId: true,
        teamId: true,
        assignedBy: true,
      },
    });

    const afterWorkOrders = await prisma.workOrder.findMany({
      where: {
        id: {
          in: workOrderIds,
        },
      },
      orderBy: {
        woNumber: 'asc',
      },
      select: {
        id: true,
        woNumber: true,
        status: true,
        priority: true,
      },
    });

    ok(
      'Smart Next did not alter assignments',
      JSON.stringify(beforeAssignments) ===
        JSON.stringify(afterAssignments),
    );

    ok(
      'Smart Next did not alter work-order state/order data',
      JSON.stringify(beforeWorkOrders) ===
        JSON.stringify(afterWorkOrders),
    );

    ok(
      'no work order automatically started',
      afterWorkOrders.every(
        (wo) => wo.status === WoStatus.ASSIGNED,
      ),
    );

    console.log('');
    console.log('=== 8. UNRELATED DATA SAFETY ===');

    const taggedUsers = await prisma.user.count({
      where: {
        name: {
          startsWith: tag,
        },
      },
    });

    const taggedWorkOrders = await prisma.workOrder.count({
      where: {
        woNumber: {
          startsWith: tag,
        },
      },
    });

    ok('only expected test users exist', taggedUsers === 4);
    ok('only expected test work orders exist', taggedWorkOrders === 3);

    console.log('');
    console.log('=== GEOGRAPHIC DATABASE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');

    try {
      if (workOrderIds.length) {
        await prisma.assignment.deleteMany({
          where: {
            workOrderId: {
              in: workOrderIds,
            },
          },
        });

        await prisma.auditLog.deleteMany({
          where: {
            workOrderId: {
              in: workOrderIds,
            },
          },
        });

        await prisma.workOrder.deleteMany({
          where: {
            id: {
              in: workOrderIds,
            },
          },
        });
      }

      if (subscriberIds.length) {
        await prisma.subscriber.deleteMany({
          where: {
            id: {
              in: subscriberIds,
            },
          },
        });
      }

      const userIds = [
        controllerId,
        freshTechId,
        staleTechId,
        offlineTechId,
      ].filter((id): id is string => Boolean(id));

      if (userIds.length) {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: userIds,
            },
          },
        });
      }

      if (teamId) {
        await prisma.team.delete({
          where: {
            id: teamId,
          },
        });
      }

      const remainingWorkOrders = await prisma.workOrder.count({
        where: {
          woNumber: {
            startsWith: tag,
          },
        },
      });

      const remainingUsers = await prisma.user.count({
        where: {
          name: {
            startsWith: tag,
          },
        },
      });

      const remainingSubscribers = await prisma.subscriber.count({
        where: {
          accountNumber: {
            startsWith: tag,
          },
        },
      });

      ok(
        'cleanup removed test work orders',
        remainingWorkOrders === 0,
      );

      ok(
        'cleanup removed test users',
        remainingUsers === 0,
      );

      ok(
        'cleanup removed test subscribers',
        remainingSubscribers === 0,
      );

      console.log('PASS: isolated geographic fixture removed.');
    } catch (cleanupError) {
      console.error('FAIL: geographic E2E cleanup failed.');
      console.error(cleanupError);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    console.error('');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
