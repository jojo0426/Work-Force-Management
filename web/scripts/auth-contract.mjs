import fs from 'node:fs';

const api = fs.readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

const checks = [
  ['Bearer authorization', /Authorization.*Bearer/si.test(api)],
  ['management role allow-list', /JOB_CONTROLLER.*SUPERVISOR.*ADMINISTRATOR/s.test(api)],
  ['session-scoped token storage', /sessionStorage/.test(api)],
  ['401 clears session', /res\.status === 401[\s\S]*clearSession/.test(api)],
  ['authenticated JSON client', /apiJson/.test(page)],
  ['management login gate', /submitLogin/.test(page) && /Management Portal/.test(page)],
  ['explicit sign out', /clearSession/.test(page) && /Sign out/.test(page)],
  ['authenticated report download', /downloadAuthenticated/.test(page)],
  ['real technician selector', /Select technician/.test(page) && /technicianId/.test(page)],
  ['demo technician removed', !/demo-tech-1/i.test(page)],
  ['direct unauthenticated dashboard fetch removed', !/fetch\(`\$\{API\}\/(reports|phase4|work-orders)/.test(page)]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`Management web auth contract failed: ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`Management web auth contract passed: ${checks.length}/${checks.length}`);
