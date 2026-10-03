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
expect('navigation exposes Live GPS Operations route', nav.includes('href:\'/operations\'') && nav.includes("label:'LiveGPSOperations'"));
expect('navigation exposes Reports & KPIs route', nav.includes('href:\'/reports\'') && nav.includes("label:'Reports&KPIs'"));
expect('board uses authenticated API client', board.includes("apiJson<Feed>('/gps/operations-map',{},session)"));
expect('board keeps 15 second operational refresh', board.includes('setInterval(load,15000)'));
expect('board renders free MapLibre/OpenStreetMap operations map', board.includes("import('maplibre-gl')") && board.includes('tile.openstreetmap.org'));
expect('board exposes live technician, subscriber, NAP and work-order layers', board.includes('feed.technicians') && board.includes('feed.subscribers') && board.includes('feed.naps') && board.includes('feed.workOrders'));
expect('board filters offline technicians from online field teams', board.includes("feed.technicians.filter(t=>t.status!=='OFFLINE')"));
expect('board distinguishes fresh and stale technician GPS', board.includes('t.isFresh') && board.includes('t.isStale'));
expect('board uses authenticated Smart Next endpoint', board.includes("apiJson(`/work-orders/smart-next?technicianId=${encodeURIComponent(t.id)}&lat=${t.lat}&lng=${t.lng}`,{},session)"));
expect('Smart Next remains recommendation only', board.includes('Recommendationonly.Noassignment,work-orderorder,orjobstatusischangedfromthismap.'));
expect('geographic queue remains no-auto-reorder', board.includes('NOAUTOREORDER'));
expect('map sequence numbers Smart Next stops', board.includes('wfm-smart-map-stop') && board.includes('x.sequence||i+1'));
expect('selected technician can hand off to controlled dispatch', board.includes('Opencontrolleddispatch→'));
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

console.log('Live GPS Operations and Supervisor KPI web contract gate passed.');
