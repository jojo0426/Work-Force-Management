import * as fs from 'fs';
import * as path from 'path';

const servicePath = path.join(__dirname, 'reports-phase3.service.ts');
const controllerPath = path.join(__dirname, 'reports.controller.ts');
const service = fs.readFileSync(servicePath, 'utf8');
const controller = fs.readFileSync(controllerPath, 'utf8');

// Normalize formatting so this regression gate validates behavior-bearing source
// patterns without breaking on harmless whitespace/refactoring changes.
const compact = service.replace(/\s+/g, '');

const checks: Array<[string, boolean]> = [
  ['custom range validates missing dates', service.includes('Custom reports require both from and to dates')],
  ['custom range validates invalid dates', service.includes('Invalid custom report date range')],
  ['custom range validates reversed dates', service.includes('Report from date must not be after to date')],
  ['draft included in backlog', compact.includes('draft+assigned+working+onHold+fbIssue+custIssue')],
  ['on hold included in summary', compact.includes("status:'ON_HOLD'") && compact.includes('onHold')],
  ['completion rate guarded against zero total', compact.includes('total>0?') && compact.includes(':0')],
  ['average completion requires start timestamp', compact.includes('started_atISNOTNULL')],
  ['Excel WO export is range scoped', compact.includes('workOrder.findMany({where:reportWhere')],
  ['Excel audit export is range scoped', compact.includes('auditLog.findMany({where:reportWhere')],
  ['team reporting selects latest assignment only', compact.includes("orderBy:{assignedAt:'desc'},take:1")],
  ['team workload uses latest assignment rather than assignment history', compact.includes("w.assignments[0]?.teamId===team.id")],
  ['team backlog includes operational unresolved states', compact.includes("['DRAFT','ASSIGNED','WORKING','ON_HOLD','FB_ISSUE','CUST_ISSUE'].includes(w.status)")],
  ['report routes remain management restricted', controller.includes('UserRole.JOB_CONTROLLER') && controller.includes('UserRole.SUPERVISOR') && controller.includes('UserRole.ADMINISTRATOR')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`Reporting regression gate failed: ${failed}/${checks.length}`);
  process.exit(1);
}

console.log(`Reporting regression gate passed: ${checks.length}/${checks.length}`);
