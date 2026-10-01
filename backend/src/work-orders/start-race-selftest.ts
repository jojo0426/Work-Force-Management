import { BadRequestException } from '@nestjs/common';
import { WoStatus } from '@prisma/client';

function assert(value:any,message:string){if(!value)throw new Error(`FAIL: ${message}`);console.log(`PASS: ${message}`);}
async function rejects(fn:()=>Promise<any>,contains:string){try{await fn();throw new Error('expected rejection');}catch(e:any){if(e.message==='expected rejection')throw e;assert(String(e.message).includes(contains),`rejects ${contains}`);}}
type State={status:WoStatus;executionIds:string[];auditCount:number;techniciansWorking:Set<string>};
function state():State{return{status:WoStatus.ASSIGNED,executionIds:[],auditCount:0,techniciansWorking:new Set()};}
async function start(s:State,technicianId:string,beforeClaim?:()=>void){
 if(s.status!==WoStatus.ASSIGNED)throw new BadRequestException(`Work order must be assigned before starting; current status is ${s.status}`);
 beforeClaim?.();
 // Models updateMany({where:{id,status:ASSIGNED},data:{status:WORKING}}) as atomic compare-and-set.
 if(s.status!==WoStatus.ASSIGNED)throw new BadRequestException('Work order was already started or changed by another request');
 s.status=WoStatus.WORKING;
 const executionId=`exec-${s.executionIds.length+1}`;s.executionIds.push(executionId);s.techniciansWorking.add(technicianId);s.auditCount++;
 return executionId;
}
async function main(){
 const duplicate=state();await start(duplicate,'tech-1');await rejects(()=>start(duplicate,'tech-1'),'must be assigned');assert(duplicate.executionIds.length===1&&duplicate.auditCount===1,'duplicate start creates exactly one active execution and audit');
 const competing=state();await rejects(()=>start(competing,'tech-1',()=>{competing.status=WoStatus.WORKING;}),'already started or changed');assert(competing.executionIds.length===0&&competing.auditCount===0,'lost ASSIGNED claim cannot create execution or audit');
 const twoTechs=state();await start(twoTechs,'tech-1');await rejects(()=>start(twoTechs,'tech-2'),'must be assigned');assert(twoTechs.executionIds.length===1&&twoTechs.techniciansWorking.has('tech-1')&&!twoTechs.techniciansWorking.has('tech-2'),'two technicians cannot both start the same work order');
 const valid=state();const id=await start(valid,'tech-1');assert(id==='exec-1'&&valid.status===WoStatus.WORKING&&valid.auditCount===1,'successful claimant starts exactly one execution');
 console.log('Start concurrency regression suite passed.');
}
main().catch(e=>{console.error(e);process.exit(1);});
