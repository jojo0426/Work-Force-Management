import { strict as assert } from 'assert';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, UserRole, WoStatus, WoType } from '@prisma/client';
import { WorkOrdersPhase2Service } from './work-orders-phase2.service';
import { WorkOrdersController } from './work-orders.controller';
async function main() {
  let forwardedActor = '';
  const controller = new WorkOrdersController(null as any, { createTransfer: async (_body: any, id: string) => { forwardedActor = id; } } as any, null as any, null as any, null as any, null as any);
  await controller.createTransfer({ user: { id: 'verified-session-user' } }, { actorId: 'spoofed', technicianId: 'spoofed' });
  assert.equal(forwardedActor, 'verified-session-user');
  let actor: any = { id: 'tech', isActive: true, role: UserRole.TECHNICIAN, teamId: 'team-a' };
  let workOrder: any = { id: 'transfer-wo', type: WoType.TRANSFER, status: WoStatus.WORKING, assignments: [{ teamId: 'team-a' }] };
  let execution: any = { id: 'execution' }, writes = 0, audits = 0;
  const tx: any = {
    user: { findUnique: async ({ where }: any) => { assert.equal(where.id, 'tech'); return actor; } },
    workOrder: { findUnique: async () => workOrder },
    jobExecution: { findFirst: async ({ where }: any) => { assert.equal(where.technicianId, 'tech'); assert.equal(where.completedAt, null); return execution; } },
    nap: { findUnique: async () => ({ id: 'nap', portCount: 8 }) },
    transfer: { create: async ({ data }: any) => { writes++; return { id: 'record', ...data }; } },
    auditLog: { create: async ({ data }: any) => { assert.equal(data.actorId, 'tech'); audits++; } },
  };
  const prisma: any = { $transaction: async (callback: any, options: any) => {
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable); return callback(tx);
  } };
  const svc = new WorkOrdersPhase2Service(prisma);
  const request = { workOrderId: 'transfer-wo', newNapId: 'nap', newPort: 1, newLat: 14.3, newLng: 120.9, actorId: 'spoofed', technicianId: 'spoofed' };
  await svc.createTransfer(request, 'tech'); assert.equal(writes, 1); assert.equal(audits, 1);
  actor.isActive = false;
  await assert.rejects(svc.createTransfer(request, 'tech'), ForbiddenException);
  actor.isActive = true; actor.teamId = 'another-team';
  await assert.rejects(svc.createTransfer(request, 'tech'), ForbiddenException);
  actor.teamId = 'team-a'; execution = null;
  await assert.rejects(svc.createTransfer(request, 'tech'), ForbiddenException);
  execution = { id: 'execution' }; workOrder.status = WoStatus.ASSIGNED;
  await assert.rejects(svc.createTransfer(request, 'tech'), ForbiddenException);
  workOrder.status = WoStatus.COMPLETED;
  await assert.rejects(svc.createTransfer(request, 'tech'), BadRequestException);
  workOrder.status = WoStatus.WORKING; workOrder.type = WoType.REPAIR;
  await assert.rejects(svc.createTransfer(request, 'tech'), BadRequestException);
  workOrder.type = WoType.TRANSFER;
  await assert.rejects(svc.createTransfer({ ...request, newLat: 91 }, 'tech'), BadRequestException);
  await assert.rejects(svc.createTransfer({ ...request, newPort: 9 }, 'tech'), BadRequestException);
  await assert.rejects(svc.createTransfer({ ...request, oldLat: 0 }, 'tech'), BadRequestException);
  await assert.rejects(svc.createTransfer(request, ''), BadRequestException);
  assert.equal(writes, 1); assert.equal(audits, 1);
  actor.role = UserRole.JOB_CONTROLLER; actor.teamId = null; workOrder.status = WoStatus.DRAFT;
  await svc.createTransfer(request, 'tech'); assert.equal(writes, 2); assert.equal(audits, 2);
  console.log('PASS: transfer writes require current account role, assignment and active technician execution');
  console.log('PASS: invalid GPS/NAP ports and closed/non-transfer orders cause no writes; actor comes from authenticated request');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
