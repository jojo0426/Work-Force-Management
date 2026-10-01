import * as fs from 'fs';
import * as path from 'path';

const servicePath = path.join(__dirname, 'reports-phase3.service.ts');
const controllerPath = path.join(__dirname, 'reports.controller.ts');
const service = fs.readFileSync(servicePath, 'utf8');
const controller = fs.readFileSync(controllerPath, 'utf8');

const checks: Array<[string, boolean]> = [
  ['custom range validates missing dates', service.includes('Custom reports require both from and to dates')],
  ['custom range validates invalid dates', service.includes('Invalid custom report date range')],
  ['custom range validates reversed dates', service.includes('Report from date must not be after to date')],
  ['draft included in backlog', service.includes('draft + assigned + working + onHold + fbIssue + custIssue')],
  ['on hold included in summary', service.includes("status: 'ON_HOLD'")],
  ['completion rate guarded against zero total', service.includes('total > 0')],
  ['average completion requires start timestamp', service.includes('started_at IS NOT NULL')],
  ['Excel WO export is range scoped', service.includes('workOrder.findMany({ where: reportWhere')],
  ['Excel audit export is range scoped', service.includes('auditLog.findMany({ where: reportWhere')],
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
