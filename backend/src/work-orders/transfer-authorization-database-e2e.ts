import { strict as assert } from 'assert';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient, UserRole, WoStatus, WoType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { WorkOrdersPhase2Service } from './work-orders-phase2.service';
async function main() {
  const url = process.env.DATABASE_URL || '';
  const parsed = new URL(url);
  if (parsed.pathname !== '/wfm_ci' || !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('Disposable local wfm_ci database required');
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tag = 'transfer-auth-' + randomUUID();
  const teamId = tag + '-team', techId = tag + '-tech', napId = tag + '-nap', workOrderId = tag + '-wo';
  const svc = new WorkOrdersPhase2Service(db as any);
  try {
    await db.team.create({ data: { id: teamId, name: tag } });
    await db.user.create({ data: { id: techId, name: tag, role: UserRole.TECHNICIAN, teamId } });
    await db.nap.create({ data: { id: napId, napCode: tag, portCount: 8 } });
    await db.workOrder.create({ data: { id: workOrderId, woNumber: tag, type: WoType.TRANSFER, status: WoStatus.WORKING } });
    const payload = { workOrderId, newNapId: napId, newPort: 2, newLat: 14.3, newLng: 120.9, actorId: 'spoofed' };
    await assert.rejects(svc.createTransfer(payload, techId), ForbiddenException);
    await db.assignment.create({ data: { workOrderId, teamId } });
    await assert.rejects(svc.createTransfer(payload, techId), ForbiddenException);
    await db.jobExecution.create({ data: { workOrderId, technicianId: techId } });
    const saved = await svc.createTransfer(payload, techId);
    assert.equal(saved.transfer.workOrderId, workOrderId);
    assert.equal(await db.transfer.count({ where: { workOrderId } }), 1);
    const audit = await db.auditLog.findFirst({ where: { workOrderId, action: 'TRANSFER_RECORDED' } });
    assert.equal(audit?.actorId, techId);
    // Revocation is committed by a separate client before the next mutation.
    const revoker = new PrismaClient({ datasources: { db: { url } } });
    try { await revoker.user.update({ where: { id: techId }, data: { isActive: false } }); }
    finally { await revoker.$disconnect(); }
    await assert.rejects(svc.createTransfer(payload, techId), ForbiddenException);
    assert.equal(await db.transfer.count({ where: { workOrderId } }), 1);
    assert.equal(await db.auditLog.count({ where: { workOrderId, action: 'TRANSFER_RECORDED' } }), 1);
    console.log('PASS: database transfer authorization checks assignment/execution, binds audit actor, and observes committed revocation');
  } finally {
    await db.auditLog.deleteMany({ where: { workOrderId } });
    await db.transfer.deleteMany({ where: { workOrderId } });
    await db.jobExecution.deleteMany({ where: { workOrderId } });
    await db.assignment.deleteMany({ where: { workOrderId } });
    await db.workOrder.deleteMany({ where: { id: workOrderId } });
    await db.user.deleteMany({ where: { id: techId } });
    await db.team.deleteMany({ where: { id: teamId } });
    await db.nap.deleteMany({ where: { id: napId } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
