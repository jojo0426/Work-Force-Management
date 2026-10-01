import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const compact = (value: string) => value.replace(/\s+/g, '');
function expect(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const env = read('backend/.env.example');
const main = compact(read('backend/src/main.ts'));
const gitignore = read('.gitignore');
const runbook = read('docs/PRODUCTION_READINESS.md');
const packageJson = JSON.parse(read('backend/package.json'));

expect('production: environment files are ignored', /^\.env$/m.test(gitignore) && /^\.env\.local$/m.test(gitignore));
expect('production: example uses placeholders rather than real credentials', env.includes('CHANGE_ME') && !env.includes('NODE_ENV=production'));
expect('production: database and JWT configuration are documented', env.includes('DATABASE_URL=') && env.includes('JWT_SECRET='));
expect('production: evidence storage configuration is documented', env.includes('S3_BUCKET=') && env.includes('S3_ACCESS_KEY_ID=') && env.includes('S3_SECRET_ACCESS_KEY='));
expect('production: CORS is explicit in production', main.includes("process.env.NODE_ENV==='production'") && main.includes("thrownewError('CORS_ORIGINSmustbeconfiguredinproduction')"));
expect('production: browser origins are allowlisted', main.includes('origin:allowedOrigins()') && !main.includes("origin:'*'"));
expect('production: API has versioned global prefix', main.includes("app.setGlobalPrefix('api/v1')"));
expect('production: request validation uses whitelist', main.includes('newValidationPipe({whitelist:true,transform:true})'));
expect('production: deploy migration command uses prisma migrate deploy', packageJson.scripts['prisma:migrate:deploy'] === 'prisma migrate deploy');
expect('production: runbook requires backup before migration', /backup completed successfully and is restorable/i.test(runbook));
expect('production: runbook prohibits migrate dev in production', /Never run `prisma migrate dev` in production/i.test(runbook));
expect('production: runbook requires HTTPS', /HTTPS\/TLS/i.test(runbook));
expect('production: runbook requires private evidence storage', /private bucket\/container/i.test(runbook));
expect('production: runbook requires restore verification', /periodic restore test/i.test(runbook));
expect('production: runbook defines smoke test', /Release smoke test/i.test(runbook) && /Finish Gate completes exactly once/i.test(runbook));
expect('production: runbook defines rollback strategy', /Rollback procedure/i.test(runbook) && /previously validated application/i.test(runbook));
expect('production: runbook records validated baseline and backup', /successful WFM Baseline Validation run number/i.test(runbook) && /database backup identifier\/time/i.test(runbook));

console.log('Phase 4 production configuration readiness gate passed.');
