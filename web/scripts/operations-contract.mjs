import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const nav = readFileSync(resolve(process.cwd(), 'app/ManagementQuickNav.tsx'), 'utf8').replace(/\s+/g, '');
const board = readFileSync(resolve(process.cwd(), 'app/operations/page.tsx'), 'utf8').replace(/\s+/g, '');
const reports = readFileSync(resolve(process.cwd(), 'app/reports/page.tsx'), 'utf8').replace(/\s+/g, '');
const layout = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8').replace(/\s+/g, '');

expect('management layout mounts quick navigation', layout.includes('<ManagementQuickNav/>'));
expect('navigation is hidden without an authorized session', nav.includes("if(!authorized)returnnull"));
expect('navigation restricts management roles', nav.includes("['JOB_CONTROLLER','SUPERVISOR','ADMINISTRATOR'].includes(session.user.role)"));
expect('navigation exposes Live Operations route', nav.includes('href="/operations"') && nav.includes('LiveOperations'));
expect('navigation exposes Supervisor KPI route', nav.includes('href="/reports"') && nav.includes('SupervisorKPIs'));
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
expect('reports use authenticated summary endpoint', reports.includes('apiJson<Summary>(`/reports/summary?range=${range}`,{},session)'));
expect('reports expose daily weekly monthly periods', reports.includes("['daily','weekly','monthly']"));
expect('reports expose corrected backlog KPI', reports.includes('label="Backlog"') && reports.includes('data.totals.pending'));
expect('reports expose completion rate and average completion', reports.includes('label="CompletionRate"') && reports.includes('label="AvgCompletion"'));
expect('reports expose on hold and issue KPIs', reports.includes('label="OnHold"') && reports.includes('label="FB-Issue"') && reports.includes('label="CUST-Issue"'));
expect('reports retain Excel and print output', reports.includes('ExportExcel') && reports.includes('window.print()'));
expect('reports expose team operational performance', reports.includes('TeamOperationalPerformance') && reports.includes('teamPerformance:TeamPerf[]'));
expect('team view exposes workload and capacity metrics', reports.includes('WOLoad') && reports.includes('availableTechnicians') && reports.includes('workingTechnicians') && reports.includes('AvgCompletion'));
expect('team view documents latest-assignment semantics', reports.includes('latestassignmentonly') && reports.includes('reassignmenthistoryisnotdouble-counted'));
expect('team and technician views avoid automatic personnel ranking', reports.includes('doesnotscoreorautomaticallyrankemployees') && reports.includes('notanautomaticpersonnelranking'));
expect('reports expose technician execution performance without auto ranking', reports.includes('TechnicianExecutionPerformance'));

console.log('Live Operations and Supervisor KPI web contract gate passed.');
