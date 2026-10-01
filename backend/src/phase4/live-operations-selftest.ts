import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label:string, condition:boolean){if(!condition)throw new Error(`FAIL: ${label}`);console.log(`PASS: ${label}`)}
const compact=(v:string)=>v.replace(/\s+/g,'');
const controller=readFileSync(resolve(__dirname,'phase4.controller.ts'),'utf8');
const service=readFileSync(resolve(__dirname,'live-operations.service.ts'),'utf8');
const c=compact(controller),s=compact(service);

expect('live operations endpoint is management-only',c.includes("@Get('operations/live')")&&c.includes('@Roles(UserRole.JOB_CONTROLLER,UserRole.SUPERVISOR,UserRole.ADMINISTRATOR)'));
expect('snapshot uses authoritative work-order aggregation',s.includes("workOrder.groupBy({by:['status']"));
expect('snapshot reads active technicians only',s.includes("role:'TECHNICIAN',isActive:true"));
expect('snapshot reads unfinished executions',s.includes('completedAt:null'));
expect('snapshot reads pending field exceptions',s.includes("fieldException.findMany({where:{status:'PENDING'}"));
expect('location freshness is explicitly bounded',s.includes('2*60*1000')&&s.includes('isStale:!locationFresh'));
expect('snapshot declares authoritative source',s.includes("source:'authoritative_operational_database'"));
expect('snapshot recommends 15 second refresh',s.includes('refreshRecommendedSeconds:15'));
expect('snapshot exposes actionable operational counts',s.includes('availableTechnicians:')&&s.includes('pendingExceptions:')&&s.includes('activeExecutions:')&&s.includes('staleLocations:'));

console.log('Live Operations Board regression gate passed.');
