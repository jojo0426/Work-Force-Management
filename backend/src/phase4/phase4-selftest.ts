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
requireMatch('Signature requires work order', controller, /Signature work order is required/);
requireMatch('Signature requires payload', controller, /Signature data is required/);
requireMatch('Signature requires signer name', controller, /Signed-by name is required/);
requireMatch('Route technician is self-scoped', controller, /req\.user\.role === UserRole\.TECHNICIAN \? req\.user\.id : techId/);
requireMatch('Workflow creation supervisor/admin only', controller, /@Post\('workflows\/rules'\)[\s\S]*?@Roles\(UserRole\.SUPERVISOR, UserRole\.ADMINISTRATOR\)/);

// Signature integrity
requireMatch('Signature size limit', service, /MAX_SIGNATURE_CHARS/);
requireMatch('Signature signer length limit', service, /MAX_SIGNER_NAME_CHARS/);
requireMatch('Signature validates active execution', service, /jobExecution\.findFirst/);
requireMatch('Signature validates working work order', service, /status: 'WORKING'/);
requireMatch('Signature duplicate is idempotent', service, /customerSignature\.findFirst/);
requireMatch('Signature audit records technician', service, /actorId: technicianId/);

// Route optimization must be deterministic and scoped
requireMatch('Route uses assignment team scope', service, /assignments: \{ some: \{ teamId: technician\.teamId \} \}/);
requireMatch('Route uses subscriber coordinates', service, /subscriber: \{ select: \{ lat: true, lng: true/);
requireMatch('Route uses haversine distance', service, /haversineMeters/);
requireMatch('Route remains suggestion only', service, /suggestion only/i);
forbidMatch('No random route or network values', service, /Math\.random\s*\(/);
forbidMatch('No fixed 95.5 optimization score', service, /optimizationScore:\s*95\.5/);

// Analytics and network intelligence must be data-backed
requireMatch('Analytics validates range', service, /VALID_ANALYTICS_RANGES/);
requireMatch('Analytics uses requested date window', service, /createdAt: \{ gte: fromDate, lte: toDate \}/);
forbidMatch('No fake weekly growth string', service, /\+12% vs last week/);
forbidMatch('No fake monthly growth string', service, /\+8% vs last month/);
requireMatch('Network reads persisted health', service, /napHealth\.findMany/);
requireMatch('Network reads unresolved alerts', service, /networkAlert\.findMany/);

// Workflow hardening
requireMatch('Workflow trigger allow-list', service, /WORKFLOW_TRIGGERS/);
requireMatch('Workflow action allow-list', service, /WORKFLOW_ACTIONS/);
requireMatch('Workflow verifies work order', service, /workOrder\.findUnique/);
requireMatch('External workflow action remains queued', service, /QUEUED_FOR_INTEGRATION/);

console.log('Phase 4 hardening self-test passed.');
