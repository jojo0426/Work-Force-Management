import {
  PrismaClient,
  UserRole,
  UserStatus,
  WoStatus,
  WoType,
} from '@prisma/client';

import { WorkOrdersService } from '../work-orders/work-orders.service';

const prisma = new PrismaClient();
const service = new WorkOrdersService(prisma as any);

const tag = `dispatch-e2e-${Date.now()}`;

function ok(name: string, condition: unknown) {
  if (!condition) {
    throw new Error(`FAIL: ${name}`);
  }

  console.log(`PASS: ${name}`);
}

async function rejects(
  name: string,
  fn: () => Promise<unknown>,
  expected: string,
) {
  try {
    await fn();
    throw new Error(`FAIL: ${name} — expected rejection`);
  } catch (error: any) {
    const message = String(error?.message ?? error);

    if (!message.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(
        `FAIL: ${name} — expected "${expected}", received "${message}"`,
      );
    }

    console.log(`PASS: ${name}`);
  }
}

async function main() {
  console.log('');
  console.log('=== PHASE 4 CONTROLLED DISPATCH DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  let actorId: string | null = null;
  let techAId: string | null = null;
  let techBId: string | null = null;
  let teamAId: string | null = null;
  let teamBId: string | null = null;

  const workOrderIds: string[] = [];

  try {
    console.log('');
    console.log('=== 1. CREATE ISOLATED FIXTURE ===');

    const actor = await prisma.user.create({
      data: {
        name: `${tag}-controller`,
        email: `${tag}-controller@example.invalid`,
        role: UserRole.JOB_CONTROLLER,
        status: UserStatus.ONLINE,
        isActive: true,
      },
    });

    actorId = actor.id;
    ok('management actor created', !!actorId);

    const teamA = await prisma.team.create({
      data: {
        name: `${tag}-team-a`,
      },
    });

    const teamB = await prisma.team.create({
      data: {
        name: `${tag}-team-b`,
      },
    });

    teamAId = teamA.id;
    teamBId = teamB.id;

    ok('Team A created', !!teamAId);
    ok('Team B created', !!teamBId);

    const techA = await prisma.user.create({
      data: {
        name: `${tag}-technician-a`,
        email: `${tag}-technician-a@example.invalid`,
        role: UserRole.TECHNICIAN,
        status: UserStatus.AVAILABLE,
        isActive: true,
        teamId: teamA.id,
      },
    });

    const techB = await prisma.user.create({
      data: {
        name: `${tag}-technician-b`,
        email: `${tag}-technician-b@example.invalid`,
        role: UserRole.TECHNICIAN,
        status: UserStatus.AVAILABLE,
        isActive: true,
        teamId: teamB.id,
      },
    });

    techAId = techA.id;
    techBId = techB.id;

    ok('Team A has an active technician', !!techAId);
    ok('Team B has an active technician', !!techBId);

    async function createWorkOrder(suffix: string) {
      const wo = await prisma.workOrder.create({
        data: {
          woNumber: `${tag}-${suffix}`,
          type: WoType.REPAIR,
          status: WoStatus.DRAFT,
          priority: 3,
          remarks: `${tag} isolated controlled-dispatch fixture`,
          createdBy: actor.id,
        },
      });

      workOrderIds.push(wo.id);
      return wo;
    }

    const primary = await createWorkOrder('primary');
    const workingGuard = await createWorkOrder('working-guard');
    const activeExecutionGuard = await createWorkOrder('active-execution-guard');
    const race = await createWorkOrder('race');

    ok('four isolated work orders created', workOrderIds.length === 4);

    console.log('');
    console.log('=== 2. INITIAL ASSIGNMENT — TEAM A ===');

    const first = await service.assignToTeam(
      primary.id,
      teamA.id,
      actor.id,
      null,
    );

    ok('initial assignment is not idempotent', first.idempotent === false);
    ok(
      'initial assignment claims work order as ASSIGNED',
      first.workOrder.status === WoStatus.ASSIGNED,
    );

    let assignments = await prisma.assignment.findMany({
      where: { workOrderId: primary.id },
    });

    ok('exactly one current assignment exists', assignments.length === 1);
    ok('current assignment is Team A', assignments[0]?.teamId === teamA.id);

    let audits = await prisma.auditLog.findMany({
      where: { workOrderId: primary.id },
      orderBy: { createdAt: 'asc' },
    });

    ok('initial assignment writes one audit', audits.length === 1);
    ok(
      'initial audit is WORK_ORDER_ASSIGNED',
      audits[0]?.action === 'WORK_ORDER_ASSIGNED',
    );

    console.log('');
    console.log('=== 3. SAME-TEAM IDEMPOTENCY ===');

    const retry = await service.assignToTeam(
      primary.id,
      teamA.id,
      actor.id,
      teamA.id,
    );

    ok('same-team retry is idempotent', retry.idempotent === true);

    assignments = await prisma.assignment.findMany({
      where: { workOrderId: primary.id },
    });

    audits = await prisma.auditLog.findMany({
      where: { workOrderId: primary.id },
    });

    ok(
      'same-team retry does not duplicate assignment',
      assignments.length === 1,
    );

    ok(
      'same-team retry does not create duplicate audit',
      audits.length === 1,
    );

    console.log('');
    console.log('=== 4. CONTROLLED REASSIGNMENT — TEAM A TO TEAM B ===');

    const reassigned = await service.assignToTeam(
      primary.id,
      teamB.id,
      actor.id,
      teamA.id,
    );

    ok('reassignment is not idempotent', reassigned.idempotent === false);

    assignments = await prisma.assignment.findMany({
      where: { workOrderId: primary.id },
    });

    ok(
      'reassignment retains exactly one current assignment',
      assignments.length === 1,
    );

    ok(
      'current assignment changed to Team B',
      assignments[0]?.teamId === teamB.id,
    );

    audits = await prisma.auditLog.findMany({
      where: { workOrderId: primary.id },
      orderBy: { createdAt: 'asc' },
    });

    ok('assignment plus reassignment produce two audits', audits.length === 2);

    const reassignmentAudit = audits.find(
      (entry) => entry.action === 'WORK_ORDER_REASSIGNED',
    );

    ok('dedicated reassignment audit exists', !!reassignmentAudit);

    const details = reassignmentAudit?.details as any;

    ok(
      'reassignment audit preserves Team A',
      Array.isArray(details?.previousTeamIds) &&
        details.previousTeamIds.length === 1 &&
        details.previousTeamIds[0] === teamA.id,
    );

    ok(
      'reassignment audit records Team B',
      details?.teamId === teamB.id,
    );

    console.log('');
    console.log('=== 5. WORKING STATUS PROTECTION ===');

    await prisma.workOrder.update({
      where: { id: workingGuard.id },
      data: { status: WoStatus.WORKING },
    });

    await rejects(
      'WORKING work order cannot be assigned/reassigned',
      () => service.assignToTeam(workingGuard.id, teamB.id, actor.id, null),
      'Cannot assign a working work order',
    );

    const workingAssignments = await prisma.assignment.count({
      where: { workOrderId: workingGuard.id },
    });

    ok(
      'WORKING rejection creates no assignment',
      workingAssignments === 0,
    );

    console.log('');
    console.log('=== 6. ACTIVE EXECUTION PROTECTION ===');

    await service.assignToTeam(
      activeExecutionGuard.id,
      teamA.id,
      actor.id,
      null,
    );

    await prisma.jobExecution.create({
      data: {
        workOrderId: activeExecutionGuard.id,
        technicianId: techA.id,
        status: WoStatus.WORKING,
      },
    });

    await rejects(
      'active execution prevents reassignment',
      () =>
        service.assignToTeam(
          activeExecutionGuard.id,
          teamB.id,
          actor.id,
          teamA.id,
        ),
      'active',
    );

    const activeAssignment = await prisma.assignment.findMany({
      where: { workOrderId: activeExecutionGuard.id },
    });

    ok(
      'active-execution rejection preserves Team A',
      activeAssignment.length === 1 &&
        activeAssignment[0]?.teamId === teamA.id,
    );

    console.log('');
    console.log('=== 7. DATABASE CONCURRENCY PROTECTION ===');

    const raceResults = await Promise.allSettled([
      service.assignToTeam(race.id, teamA.id, actor.id, null),
      service.assignToTeam(race.id, teamB.id, actor.id, null),
    ]);

    const fulfilled = raceResults.filter(
      (result) => result.status === 'fulfilled',
    );

    const rejected = raceResults.filter(
      (result) => result.status === 'rejected',
    );

    console.log(`Race fulfilled: ${fulfilled.length}`);
    console.log(`Race rejected : ${rejected.length}`);

    raceResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(
          `Race request ${index + 1}: FULFILLED — team=${result.value.assignment?.teamId ?? 'unknown'} idempotent=${result.value.idempotent}`,
        );
      } else {
        console.log(
          `Race request ${index + 1}: REJECTED — ${String(result.reason?.message ?? result.reason)}`,
        );
      }
    });

    ok(
      'concurrent dispatch produces exactly one successful claimant',
      fulfilled.length === 1,
    );

    ok(
      'concurrent dispatch rejects exactly one losing claimant',
      rejected.length === 1,
    );

    const raceAssignments = await prisma.assignment.findMany({
      where: { workOrderId: race.id },
    });

    ok(
      'concurrent dispatch leaves exactly one current assignment',
      raceAssignments.length === 1,
    );

    const raceAudits = await prisma.auditLog.findMany({
      where: { workOrderId: race.id },
    });

    ok(
      'losing concurrent dispatch creates no duplicate audit',
      raceAudits.length === 1,
    );

    console.log('');
    console.log('=== 8. ISOLATION SAFETY ===');

    const taggedUsers = await prisma.user.count({
      where: {
        email: {
          startsWith: tag,
        },
      },
    });

    const taggedTeams = await prisma.team.count({
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

    ok('only expected fixture users exist', taggedUsers === 3);
    ok('only expected fixture teams exist', taggedTeams === 2);
    ok('only expected fixture work orders exist', taggedWorkOrders === 4);

    console.log('');
    console.log('=== CONTROLLED DISPATCH DATABASE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');

    if (workOrderIds.length) {
      await prisma.auditLog.deleteMany({
        where: {
          workOrderId: {
            in: workOrderIds,
          },
        },
      });

      await prisma.jobExecution.deleteMany({
        where: {
          workOrderId: {
            in: workOrderIds,
          },
        },
      });

      await prisma.assignment.deleteMany({
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

    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: tag,
        },
      },
    });

    await prisma.team.deleteMany({
      where: {
        name: {
          startsWith: tag,
        },
      },
    });

    const remainingUsers = await prisma.user.count({
      where: {
        email: {
          startsWith: tag,
        },
      },
    });

    const remainingTeams = await prisma.team.count({
      where: {
        name: {
          startsWith: tag,
        },
      },
    });

    const remainingWorkOrders = await prisma.workOrder.count({
      where: {
        woNumber: {
          startsWith: tag,
        },
      },
    });

    ok('cleanup removed fixture users', remainingUsers === 0);
    ok('cleanup removed fixture teams', remainingTeams === 0);
    ok('cleanup removed fixture work orders', remainingWorkOrders === 0);

    console.log('PASS: isolated Controlled Dispatch fixture removed.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
