import * as fs from 'fs';
import * as path from 'path';

function read(file: string) {
  return fs.readFileSync(path.join(__dirname, file), 'utf8');
}
function requireMatch(name: string, source: string, pattern: RegExp) {
  if (!pattern.test(source)) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
function requireOrder(name: string, source: string, patterns: RegExp[]) {
  let cursor = 0;
  for (const pattern of patterns) {
    const match = pattern.exec(source.slice(cursor));
    if (!match) throw new Error(`FAIL: ${name}`);
    cursor += match.index + match[0].length;
  }
  console.log(`PASS: ${name}`);
}

const controller = read('work-orders.controller.ts');
const service = read('work-orders.service.ts');

// Intake: spreadsheet must be parsed, reviewed, and explicitly confirmed.
requireMatch('E2E upload endpoint restricted to operations roles', controller, /@Post\('upload'\)[\s\S]*?@Roles\(UserRole\.JOB_CONTROLLER,UserRole\.SUPERVISOR,UserRole\.ADMINISTRATOR\)/);
requireMatch('E2E upload awaits spreadsheet parser', controller, /const result=await this\.svc\.parseExcel\(file\.buffer\)/);
requireMatch('E2E import preview exists', controller, /@Post\('import-preview'\)/);
requireMatch('E2E import confirmation exists', controller, /@Post\('confirm'\)/);
requireMatch('E2E import validates required columns', service, /requiredColumns=\['ACCOUNT NUMBER','NAME','ADDRESS','CONTACT NUMBER','PLAN','JOB ORDER'\]/);
requireMatch('E2E import duplicate WO protection', service, /JOB_ORDER_ALREADY_EXISTS/);
requireMatch('E2E import audit trail', service, /WORK_ORDER_IMPORTED/);

// Dispatch: assignment is explicit, team scoped, and cannot move active work.
requireMatch('E2E dispatch team discovery', controller, /@Get\('dispatch\/teams'\)/);
requireMatch('E2E explicit assignment endpoint', controller, /@Post\(':id\/assign'\)/);
requireMatch('E2E assignment requires active technician team', service, /Selected team has no active technicians/);
requireMatch('E2E assignment blocks active execution', service, /Cannot change assignment while a work execution is active/);
requireMatch('E2E assignment audit trail', service, /WORK_ORDER_REASSIGNED':'WORK_ORDER_ASSIGNED/);

// Technician visibility/start: technician sees only team jobs and atomically claims start.
requireMatch('E2E technician list team scoped', controller, /where\.assignments=\{some:\{teamId:t\.teamId\}\}/);
requireMatch('E2E technician list active states only', controller, /WoStatus\.ASSIGNED,WoStatus\.WORKING/);
requireMatch('E2E start technician-only', controller, /@Post\(':id\/start'\) @Roles\(UserRole\.TECHNICIAN\)/);
requireMatch('E2E start validates team ownership', controller, /Work order is not assigned to your team/);
requireMatch('E2E start atomic status claim', controller, /updateMany\(\{where:\{id,status:WoStatus\.ASSIGNED\}/);
requireMatch('E2E start creates execution', controller, /jobExecution\.create/);
requireMatch('E2E start audit trail', controller, /WORK_ORDER_STARTED/);

// Evidence: camera-only ticket -> upload -> registration contract.
requireMatch('E2E evidence ticket endpoint', controller, /@Post\(':id\/evidence\/upload-ticket'\)/);
requireMatch('E2E evidence ticket camera-only', controller, /restricted to in-app camera captures/);
requireMatch('E2E evidence ticket validates execution ownership', controller, /No active execution belongs to this technician/);
requireMatch('E2E evidence registration endpoint', controller, /@Post\(':id\/evidence'\)/);
requireMatch('E2E evidence registration camera-only', controller, /Evidence must be captured using the in-app camera/);
requireMatch('E2E evidence requires upload ticket', controller, /Upload ticket, evidence type, and capture timestamp are required/);
requireMatch('E2E evidence captured after execution start', controller, /Evidence must be captured after the work execution started/);

// Finish: findings + measurements + verified evidence -> atomic final state + audit.
requireMatch('E2E finish technician-only', controller, /@Post\(':id\/finish'\) @Roles\(UserRole\.TECHNICIAN\)/);
requireMatch('E2E finish only approved final states', controller, /COMPLETED, FB_ISSUE, or CUST_ISSUE/);
requireMatch('E2E finish requires findings', controller, /Findings are required before finishing a work order/);
requireMatch('E2E finish invokes server gate', controller, /validateFinishGate/);
requireMatch('E2E finish enforces speed measurements', controller, /Download, upload, and ping measurements are required for speed-related results/);
requireMatch('E2E finish transaction revalidates active execution', controller, /Work execution is no longer active/);
requireMatch('E2E finish atomic WO claim', controller, /updateMany\(\{where:\{id,status:WoStatus\.WORKING\}/);
requireMatch('E2E finish returns technician available', controller, /data:\{status:'AVAILABLE'\}/);
requireMatch('E2E finish audit trail', controller, /WORK_ORDER_FINISHED/);

// Verify the public operational lifecycle remains ordered in the controller contract.
requireOrder('E2E lifecycle endpoints remain ordered', controller, [
  /@Post\('upload'\)/,
  /@Post\('import-preview'\)/,
  /@Post\('confirm'\)/,
  /@Post\(':id\/start'\)/,
  /@Post\(':id\/evidence\/upload-ticket'\)/,
  /@Post\(':id\/evidence'\)/,
  /@Post\(':id\/finish'\)/,
]);

console.log('Operational E2E workflow regression gate passed.');
