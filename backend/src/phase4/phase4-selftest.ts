import * as fs from 'fs';
import * as path from 'path';

function read(file: string) {
  return fs.readFileSync(path.join(__dirname, file), 'utf8');
}

function requireMatch(name: string, source: string, pattern: RegExp) {
  if (!pattern.test(source)) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function forbidMatch(name: string, source: string, pattern: RegExp) {
  if (pattern.test(source)) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

const controller = read('phase4.controller.ts');
const service = read('phase4.service.ts');

// Controller / authorization contracts
requireMatch('Signature endpoint technician-only', controller, /@Post\('signature'\)[\s\S]*?@Roles\(UserRole\.TECHNICIAN\)/);
requireMatch('Signature requires complete payload', controller, /!body\.workOrderId\s*\|\|\s*!body\.signatureData\s*\|\|\s*!String\(body\.signedByName\s*\|\|\s*''\)\.trim\(\)/);
requireMatch('Signature validation returns bad request', controller, /BadRequestException\('Work order, signature, and signer name are required'\)/);
requireMatch('Route technician is self-scoped', controller, /req\.user\.role\s*===\s*UserRole\.TECHNICIAN\s*\?\s*req\.user\.id\s*:\s*techId/);
requireMatch('Workflow creation supervisor/admin only', controller, /@Post\('workflows\/rules'\)[\s\S]*?@Roles\(UserRole\.SUPERVISOR,UserRole\.ADMINISTRATOR\)/);

// Signature integrity: verify actual limits and lifecycle checks rather than implementation constant names.
requireMatch('Signature minimum payload enforced', service, /signature\.length\s*<\s*20/);
requireMatch('Signature maximum payload enforced', service, /signature\.length\s*>\s*1_500_000/);
requireMatch('Signature signer length limit', service, /signedByName\.length\s*>\s*120/);
requireMatch('Signature validates active execution', service, /jobExecution\.findFirst/);
requireMatch('Signature validates working work order', service, /wo\.status\s*!==\s*WoStatus\.WORKING/);
requireMatch('Signature transaction revalidates working state', service, /currentWo\?\.status\s*!==\s*WoStatus\.WORKING/);
requireMatch('Signature duplicate is idempotent', service, /customerSignature\.findFirst/);
requireMatch('Signature audit records technician', service, /actorId:\s*data\.technicianId/);

// Route optimization must be deterministic, team scoped, and never mutate assignment ordering.
requireMatch('Route uses assignment team scope', service, /assignments:\s*\{\s*some:\s*\{\s*teamId:\s*tech\.teamId\s*\}\s*\}/);
requireMatch('Route reads subscriber coordinates', service, /select:\s*\{\s*lat:\s*true,\s*lng:\s*true,\s*address:\s*true\s*\}/);
requireMatch('Route uses haversine distance', service, /this\.haversine\(/);
requireMatch('Route remains suggestion only', service, /suggestion only, never auto-rearranges assignments/i);
forbidMatch('No random route or network values', service, /Math\.random\s*\(/);
forbidMatch('No fixed 95.5 optimization score', service, /optimizationScore:\s*95\.5/);

// Analytics and network intelligence must be data-backed.
requireMatch('Analytics range allow-list exists', service, /\['daily','weekly','monthly','custom'\]/);
requireMatch('Analytics rejects unsupported range', service, /range must be daily, weekly, monthly, or custom/);
requireMatch('Analytics uses requested date window', service, /const createdAt=\{gte:start,lte:end\}/);
forbidMatch('No fake weekly growth string', service, /\+12% vs last week/);
forbidMatch('No fake monthly growth string', service, /\+8% vs last month/);
requireMatch('Network reads persisted health', service, /napHealth\.findMany/);
requireMatch('Network reads unresolved alerts', service, /networkAlert\.findMany\(\{where:\{isResolved:false\}/);
requireMatch('Network explicitly reports persisted source', service, /source:'persisted_network_health'/);

// Workflow hardening.
requireMatch('Workflow trigger allow-list', service, /events=\['WO_COMPLETED','FB_ISSUE','CUST_ISSUE','MISMATCH_REPORTED'\]/);
requireMatch('Workflow action allow-list', service, /actions=\['NOTIFY','ASSIGN','ESCALATE','INTEGRATE'\]/);
requireMatch('Workflow verifies work order', service, /workOrder\.findUnique/);
requireMatch('External workflow action remains queued', service, /executionMode:'queued-placeholder'/);
requireMatch('Workflow does not claim external execution', service, /externalActionsExecuted:false/);

console.log('Phase 4 hardening self-test passed.');
