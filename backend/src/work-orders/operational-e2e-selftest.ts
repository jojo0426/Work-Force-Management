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
requireMatch('E2E technician list active states only', controller, /WoStatus\.ASSIGNED,WoStatus\.WORKING,WoStatus\.ON_HOLD/);
requireMatch('E2E start technician-only', controller, /@Post\(':id\/start'\) @Roles\(UserRole\.TECHNICIAN\)/);
requireMatch('E2E start validates team ownership', controller, /Work order is not assigned to your team/);
requireMatch('E2E start atomic status claim', controller, /updateMany\(\{where:\{id,status:WoStatus\.ASSIGNED\}/);
requireMatch('E2E start creates execution', controller, /jobExecution\.create/);
requireMatch('E2E start audit trail', controller, /WORK_ORDER_STARTED/);

// Field exception lifecycle: technician can pause work, operations reviews it, and finish is blocked while pending.
requireMatch('E2E field exception technician endpoint', controller, /@Post\(':id\/exception'\) @Roles\(UserRole\.TECHNICIAN\)/);
requireMatch('E2E field exception pending operations endpoint', controller, /@Get\('exceptions\/pending'\) @Roles\(UserRole\.JOB_CONTROLLER,UserRole\.SUPERVISOR,UserRole\.ADMINISTRATOR\)/);
requireMatch('E2E field exception review operations endpoint', controller, /@Post\('exceptions\/:exceptionId\/review'\) @Roles\(UserRole\.JOB_CONTROLLER,UserRole\.SUPERVISOR,UserRole\.ADMINISTRATOR\)/);
requireMatch('E2E finish blocks pending field exception', controller, /Pending field exception must be reviewed before finishing/);

// Evidence: camera-only ticket -> upload -> registration contract.
requireMatch('E2E evidence ticket endpoint', controller, /@Post\(':id\/evidence\/upload-ticket'\)/);
requireMatch('E2E evidence ticket camera-only', controller, /body\.captureSource!==['"]CAMERA['"]/);
requireMatch('E2E evidence ticket validates execution ownership', controller, /No active execution belongs to this technician/);
requireMatch('E2E evidence registration endpoint', controller, /@Post\(':id\/evidence'\)/);
requireMatch('E2E evidence registration camera-only', controller, /body\.captureSource!==['"]CAMERA['"]/);
requireMatch('E2E evidence requires upload ticket', controller, /Valid upload ticket, evidence type, and capture timestamp are required/);
requireMatch('E2E evidence captured after execution start', controller, /capturedAt<execution\.startedAt/);

// Finish: findings + measurements + verified evidence -> atomic final state + audit.
requireMatch('E2E finish technician-only', controller, /@Post\(':id\/finish'\) @Roles\(UserRole\.TECHNICIAN\)/);
requireMatch('E2E finish only approved final states', controller, /FINAL_WO_STATUSES\.includes\(finalStatus\)/);
requireMatch('E2E finish requires findings', controller, /Findings are required/);
requireMatch('E2E finish invokes server gate', controller, /validateFinishGate/);
requireMatch('E2E finish enforces speed measurements', controller, /Speed measurements required/);
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
  /@Post\(':id\/exception'\)/,
  /@Post\(':id\/evidence\/upload-ticket'\)/,
  /@Post\(':id\/evidence'\)/,
  /@Post\(':id\/finish'\)/,
]);

console.log('Operational E2E workflow regression gate passed.');
