import { BadRequestException } from '@nestjs/common';
import { WoStatus, WoType } from '@prisma/client';
import { validateFinishGate } from './finish-gate-policy';

function assert(value:any,message:string){if(!value)throw new Error(`FAIL: ${message}`);console.log(`PASS: ${message}`);}
async function rejects(fn:()=>Promise<any>,contains:string){try{await fn();throw new Error('expected rejection');}catch(e:any){if(e.message==='expected rejection')throw e;assert(String(e.message).includes(contains),`rejects ${contains}`);}}

type State={status:WoStatus;completedAt:Date|null;photos:any[];tickets:any[];finishCount:number;auditCount:number};
function state():State{return{status:WoStatus.WORKING,completedAt:null,photos:[{id:'p1',type:'WORK_RESULT',isRequired:true}],tickets:[{photoId:'p1',evidenceType:'WORK_RESULT',executionId:'exec-1',workOrderId:'wo-1',technicianId:'tech-1',status:'CONSUMED',consumedAt:new Date()}],finishCount:0,auditCount:0};}

async function finish(s:State,beforeClaim?:()=>void){
 if(s.completedAt||s.status!==WoStatus.WORKING)throw new BadRequestException('Work execution is no longer active');
 const photos=s.photos.filter(p=>p.isRequired), ids=new Set(photos.map(p=>p.id));
 const tickets=s.tickets.filter(t=>t.photoId&&ids.has(t.photoId));
 const gate=validateFinishGate({workOrderType:WoType.REPAIR,finalStatus:WoStatus.COMPLETED,resultCode:'NORMAL',photos,tickets,workOrderId:'wo-1',executionId:'exec-1',technicianId:'tech-1'});
 beforeClaim?.();
 if(s.status!==WoStatus.WORKING)throw new BadRequestException('Work order was already finished or changed by another request');
 // Models updateMany({ where:{id,status:WORKING} }) as an atomic compare-and-set.
 s.status=WoStatus.COMPLETED;s.completedAt=new Date();s.finishCount++;s.auditCount++;
 return gate;
}

async function main(){
 const duplicate=state();
 const first=finish(duplicate); await first;
 await rejects(()=>finish(duplicate),'no longer active');
 assert(duplicate.finishCount===1&&duplicate.auditCount===1,'duplicate finish creates exactly one completion and one audit');

 const competing=state();
 await rejects(()=>finish(competing,()=>{competing.status=WoStatus.COMPLETED;}),'already finished or changed');
 assert(competing.finishCount===0&&competing.auditCount===0,'lost status claim cannot finalize execution or write finish audit');

 const replaced=state();
 // Evidence replacement before transaction revalidation: old photo becomes inactive and new active photo lacks a consumed ticket.
 replaced.photos[0].isRequired=false;replaced.photos.push({id:'p2',type:'WORK_RESULT',isRequired:true});
 await rejects(()=>finish(replaced),'not backed by a consumed verified upload ticket');
 assert(replaced.status===WoStatus.WORKING&&!replaced.completedAt,'unverified replacement blocks completion');

 const invalidated=state();
 invalidated.tickets[0].status='ISSUED';invalidated.tickets[0].consumedAt=null;
 await rejects(()=>finish(invalidated),'not backed by a consumed verified upload ticket');
 assert(invalidated.status===WoStatus.WORKING,'ticket invalidation before commit blocks completion');

 const removed=state();removed.photos[0].isRequired=false;
 await rejects(()=>finish(removed),'active verified camera evidence is required');
 assert(removed.status===WoStatus.WORKING,'evidence deactivation before commit blocks completion');

 const valid=state();const gate=await finish(valid);
 assert(gate.verifiedPhotoIds.has('p1'),'valid transaction revalidation accepts current verified evidence');
 assert(valid.status===WoStatus.COMPLETED&&valid.finishCount===1&&valid.auditCount===1,'successful claimant alone finalizes and audits work order');
 console.log('Finish concurrency/race regression suite passed.');
}
main().catch(e=>{console.error(e);process.exit(1);});
