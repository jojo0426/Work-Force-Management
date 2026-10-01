import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const compact = (value: string) => value.replace(/\s+/g, '');
function expect(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const workOrdersController = compact(read('work-orders/work-orders.controller.ts'));
const phase4Service = compact(read('phase4/phase4.service.ts'));
const live = compact(read('phase4/live-operations.service.ts'));
const escalation = compact(read('phase4/escalation-policy.ts'));
const reports = compact(read('reports/reports-phase3.service.ts'));

// Core field lifecycle remains atomic and human-controlled.
expect('release: start uses atomic ASSIGNED claim', workOrdersController.includes("updateMany({where:{id,status:WoStatus.ASSIGNED}"));
expect('release: finish uses atomic WORKING claim', workOrdersController.includes("updateMany({where:{id,status:WoStatus.WORKING}"));
expect('release: finish blocks pending exception', workOrdersController.includes('Pendingfieldexceptionmustbereviewedbeforefinishing'));
expect('release: evidence remains camera-only', workOrdersController.includes("body.captureSource!=='CAMERA'"));
expect('release: finish returns technician AVAILABLE', workOrdersController.includes("data:{status:'AVAILABLE'}"));

// Smart Next remains advisory and deterministic.
expect('release: route optimization remains suggestion-only', /suggestiononly,neverauto-rearrangesassignments/i.test(phase4Service));
expect('release: route optimization has no random ordering', !phase4Service.includes('Math.random('));

// Live Operations and escalation are read-only advisory surfaces.
expect('release: live snapshot is authoritative', live.includes("source:'authoritative_operational_database'"));
expect('release: live refresh recommendation remains 15 seconds', live.includes('refreshRecommendedSeconds:15'));
expect('release: escalation requires human action', escalation.includes('requiresHumanAction:true'));
expect('release: escalation dedupe is stable', escalation.includes("signal.kind,signal.technicianId||'none',signal.workOrderNumber||'none'"));
expect('release: escalation cooldown prevents refresh spam', escalation.includes('cooldownSeconds:15*60'));
expect('release: live monitoring performs no mutations', !live.includes('.update(') && !live.includes('.updateMany(') && !live.includes('.create(') && !live.includes('.delete('));

// Reporting remains range-scoped and reassignment-safe.
expect('release: backlog includes all unresolved operational states', reports.includes('draft+assigned+working+onHold+fbIssue+custIssue'));
expect('release: exports use selected report range', reports.includes('workOrder.findMany({where:reportWhere') && reports.includes('auditLog.findMany({where:reportWhere'));
expect('release: team workload uses latest assignment only', reports.includes("orderBy:{assignedAt:'desc'},take:1") && reports.includes("w.assignments[0]?.teamId===team.id"));
expect('release: completion rate is zero-safe', reports.includes('total>0?') && reports.includes(':0'));

// Workflow integrations must never falsely claim external execution.
expect('release: external workflow actions remain queued placeholders', phase4Service.includes("executionMode:'queued-placeholder'"));
expect('release: external workflow execution is explicitly false', phase4Service.includes('externalActionsExecuted:false'));

console.log('Phase 4 release readiness regression gate passed.');
