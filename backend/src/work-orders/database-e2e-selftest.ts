import { PrismaClient, UserRole, UserStatus, WoStatus, WoType } from '@prisma/client';

const prisma = new PrismaClient();
const tag = `db-e2e-${Date.now()}`;

function ok(name: string, condition: unknown) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  const team = await prisma.team.create({ data: { name: `${tag}-team` } });
  const controller = await prisma.user.create({ data: { role: UserRole.JOB_CONTROLLER, name: `${tag}-controller`, email: `${tag}-controller@example.invalid`, status: UserStatus.ONLINE } });
  const technician = await prisma.user.create({ data: { role: UserRole.TECHNICIAN, teamId: team.id, name: `${tag}-tech`, email: `${tag}-tech@example.invalid`, status: UserStatus.AVAILABLE } });
  const subscriber = await prisma.subscriber.create({ data: { accountNumber: `${tag}-acct`, name: 'E2E Subscriber', address: 'Operational E2E Test Address', contactNumber: '0000000000', plan: 'E2E' } });
  const wo = await prisma.workOrder.create({ data: { woNumber: `${tag}-wo`, type: WoType.REPAIR, status: WoStatus.DRAFT, subscriberId: subscriber.id, createdBy: controller.id } });
  await prisma.auditLog.create({ data: { workOrderId: wo.id, actorId: controller.id, action: 'WORK_ORDER_IMPORTED', details: { source: 'database-e2e' } } });
  ok('DB E2E creates imported DRAFT work order', wo.status === WoStatus.DRAFT);

  await prisma.$transaction(async tx => {
    const claimed = await tx.workOrder.updateMany({ where: { id: wo.id, status: WoStatus.DRAFT }, data: { status: WoStatus.ASSIGNED } });
    if (claimed.count !== 1) throw new Error('assignment claim failed');
    await tx.assignment.create({ data: { workOrderId: wo.id, teamId: team.id, assignedBy: controller.id } });
    await tx.auditLog.create({ data: { workOrderId: wo.id, actorId: controller.id, action: 'WORK_ORDER_ASSIGNED', details: { teamId: team.id } } });
  });
  const assigned = await prisma.workOrder.findUnique({ where: { id: wo.id }, include: { assignments: true } });
  ok('DB E2E persists assignment and ASSIGNED state', assigned?.status === WoStatus.ASSIGNED && assigned.assignments.length === 1);

  const execution = await prisma.$transaction(async tx => {
    const claimed = await tx.workOrder.updateMany({ where: { id: wo.id, status: WoStatus.ASSIGNED }, data: { status: WoStatus.WORKING } });
    if (claimed.count !== 1) throw new Error('start claim failed');
    await tx.user.update({ where: { id: technician.id }, data: { status: UserStatus.WORKING } });
    const ex = await tx.jobExecution.create({ data: { workOrderId: wo.id, technicianId: technician.id } });
    await tx.auditLog.create({ data: { workOrderId: wo.id, actorId: technician.id, action: 'WORK_ORDER_STARTED', details: { executionId: ex.id } } });
    return ex;
  });
  ok('DB E2E creates active execution', !!execution.id);

  const ticket = await prisma.evidenceUploadTicket.create({ data: {
    workOrderId: wo.id, executionId: execution.id, technicianId: technician.id,
    evidenceType: 'WORK_RESULT', storageKey: `${tag}/work-result.jpg`, contentType: 'image/jpeg', sizeBytes: 1024,
    provider: 'database-e2e', status: 'ISSUED', expiresAt: new Date(Date.now() + 300000)
  }});
  const photo = await prisma.$transaction(async tx => {
    const p = await tx.photo.create({ data: { executionId: execution.id, type: 'WORK_RESULT', s3Key: ticket.storageKey, capturedAt: new Date(), isRequired: true } });
    await tx.evidenceUploadTicket.update({ where: { id: ticket.id }, data: { status: 'CONSUMED', consumedAt: new Date(), photoId: p.id } });
    await tx.auditLog.create({ data: { workOrderId: wo.id, actorId: technician.id, action: 'EVIDENCE_REGISTERED', details: { ticketId: ticket.id, photoId: p.id } } });
    return p;
  });
  const persistedTicket = await prisma.evidenceUploadTicket.findUnique({ where: { id: ticket.id }, include: { photo: true } });
  ok('DB E2E persists consumed evidence ticket linked to photo', persistedTicket?.status === 'CONSUMED' && persistedTicket.photo?.id === photo.id);

  await prisma.$transaction(async tx => {
    const currentExecution = await tx.jobExecution.findUnique({ where: { id: execution.id } });
    if (!currentExecution || currentExecution.completedAt) throw new Error('execution no longer active');
    const evidence = await tx.evidenceUploadTicket.findFirst({ where: { id: ticket.id, status: 'CONSUMED', photoId: photo.id, workOrderId: wo.id, executionId: execution.id, technicianId: technician.id } });
    if (!evidence) throw new Error('verified evidence missing');
    const claimed = await tx.workOrder.updateMany({ where: { id: wo.id, status: WoStatus.WORKING }, data: { status: WoStatus.COMPLETED } });
    if (claimed.count !== 1) throw new Error('finish claim failed');
    await tx.jobExecution.update({ where: { id: execution.id }, data: { completedAt: new Date(), findings: 'Database-backed E2E completed successfully', status: WoStatus.COMPLETED } });
    await tx.user.update({ where: { id: technician.id }, data: { status: UserStatus.AVAILABLE } });
    await tx.auditLog.create({ data: { workOrderId: wo.id, actorId: technician.id, action: 'WORK_ORDER_FINISHED', details: { executionId: execution.id, finalStatus: WoStatus.COMPLETED } } });
  });

  const finalWo = await prisma.workOrder.findUnique({ where: { id: wo.id } });
  const finalExecution = await prisma.jobExecution.findUnique({ where: { id: execution.id } });
  const finalTech = await prisma.user.findUnique({ where: { id: technician.id } });
  const audits = await prisma.auditLog.findMany({ where: { workOrderId: wo.id }, orderBy: { createdAt: 'asc' } });
  ok('DB E2E persists COMPLETED work order', finalWo?.status === WoStatus.COMPLETED);
  ok('DB E2E persists completed execution findings', !!finalExecution?.completedAt && finalExecution.findings === 'Database-backed E2E completed successfully');
  ok('DB E2E returns technician to AVAILABLE', finalTech?.status === UserStatus.AVAILABLE);
  ok('DB E2E preserves operational audit chain', ['WORK_ORDER_IMPORTED','WORK_ORDER_ASSIGNED','WORK_ORDER_STARTED','EVIDENCE_REGISTERED','WORK_ORDER_FINISHED'].every(action => audits.some(a => a.action === action)));

  const duplicate = await prisma.workOrder.create({ data: { woNumber: `${tag}-duplicate`, type: WoType.REPAIR, subscriberId: subscriber.id } });
  let duplicateBlocked = false;
  try { await prisma.workOrder.create({ data: { woNumber: duplicate.woNumber, type: WoType.REPAIR, subscriberId: subscriber.id } }); } catch { duplicateBlocked = true; }
  ok('DB E2E database unique constraint blocks duplicate WO number', duplicateBlocked);
  await prisma.workOrder.delete({ where: { id: duplicate.id } });

  console.log('Database-backed operational E2E gate passed.');
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
