import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const nav = readFileSync(resolve(process.cwd(), 'app/ManagementQuickNav.tsx'), 'utf8').replace(/\s+/g, '');
const board = readFileSync(resolve(process.cwd(), 'app/operations/page.tsx'), 'utf8').replace(/\s+/g, '');
const layout = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8').replace(/\s+/g, '');

expect('management layout mounts quick navigation', layout.includes('<ManagementQuickNav/>'));
expect('navigation is hidden without an authorized session', nav.includes("if(!authorized)returnnull"));
expect('navigation restricts management roles', nav.includes("['JOB_CONTROLLER','SUPERVISOR','ADMINISTRATOR'].includes(session.user.role)"));
expect('navigation exposes Live Operations route', nav.includes('href="/operations"') && nav.includes('LiveOperations'));
expect('board uses authenticated API client', board.includes("apiJson<Snapshot>('/phase4/operations/live',{},active)"));
expect('board keeps 15 second operational refresh', board.includes('setInterval(()=>refresh(session),15000)'));
expect('board returns to management portal', board.includes('href="/"') && board.includes('ManagementPortal'));

console.log('Live Operations web contract gate passed.');
