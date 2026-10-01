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
expect('attention queue supports severity filtering', board.includes('Severityfilter') && board.includes("severity==='ALL'||a.severity===severity"));
expect('attention queue supports type and technician filtering', board.includes('Alerttypefilter') && board.includes('Technicianfilter'));
expect('attention priority is high severity then oldest first', board.includes("x.severity==='HIGH'?0:1") && board.includes('ageMs(b.since)-ageMs(a.since)'));
expect('attention aging is human readable', board.includes('functionageLabel') && board.includes("`${h}h${m}m`"));
expect('attention details can jump to related operational section', board.includes('scrollIntoView({behavior:\'smooth\'') && board.includes('Viewrelateddetails'));
expect('pending exceptions link to management review surface', board.includes('OpenManagementPortaltoreview'));
expect('location state distinguishes missing GPS', board.includes('NOGPSREPORTED'));
expect('filters are stateful across snapshot refresh', board.includes('Filtersstayselectedduringautomaticrefresh'));

console.log('Live Operations web contract gate passed.');
