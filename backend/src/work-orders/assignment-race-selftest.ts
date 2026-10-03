import { BadRequestException } from '@nestjs/common';
import { WoStatus } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';

const assert=(ok:boolean,msg:string)=>{if(!ok)throw new Error(`FAIL: ${msg}`);console.log(`PASS: ${msg}`)};

type State={status:WoStatus;teamId:string|null;activeExecution:boolean;audits:any[]};
function harness(initial:Partial<State>={}){
 const s:State={status:WoStatus.DRAFT,teamId:null,activeExecution:false,audits:[],...initial};
 const tx:any={
  workOrder:{findUnique:async()=>({id:'wo1',status:s.status}),updateMany:async({where,data}:any)=>{if(s.status!==where.status)return{count:0};s.status=data.status;return{count:1}}},
  jobExecution:{findFirst:async()=>s.activeExecution?{id:'exec1'}:null},
  assignment:{findMany:async()=>s.teamId?[{id:'a1',teamId:s.teamId,assignedAt:new Date()}]:[],deleteMany:async()=>{s.teamId=null;return{count:1}},create:async({data}:any)=>{s.teamId=data.teamId;return{id:'a-new',...data}}},
  auditLog:{create:async({data}:any)=>{s.audits.push(data);return data}}
 };
 const prisma:any={team:{findUnique:async({where}:any)=>({id:where.id,users:[{id:'tech'}]})},$transaction:async(fn:any)=>fn(tx)};
 return{s,service:new WorkOrdersService(prisma),tx};
}
async function rejects(p:Promise<any>,text:string){try{await p;throw new Error('expected rejection')}catch(e:any){assert(e instanceof BadRequestException&&String(e.message).includes(text),`rejects ${text}`)}}

async function main(){
 {const{s,service}=harness();await service.assignToTeam('wo1','teamA','admin',null);assert(s.status===WoStatus.ASSIGNED&&s.teamId==='teamA','first assignment claims DRAFT and assigns one team');assert(s.audits.length===1&&s.audits[0].action==='WORK_ORDER_ASSIGNED','first assignment writes one assignment audit');}
 {const{s,service}=harness({status:WoStatus.ASSIGNED,teamId:'teamA'});const r=await service.assignToTeam('wo1','teamA','admin','teamA');assert(r.idempotent===true,'same-team retry is idempotent');assert(s.audits.length===0,'same-team retry creates no duplicate audit');}
 {const{s,service}=harness({status:WoStatus.ASSIGNED,teamId:'teamA'});await service.assignToTeam('wo1','teamB','admin','teamA');assert(s.teamId==='teamB','reassignment before start changes team');assert(s.audits.length===1&&s.audits[0].action==='WORK_ORDER_REASSIGNED','reassignment writes dedicated audit');assert(s.audits[0].details.previousTeamIds[0]==='teamA','reassignment audit preserves prior team');}
 {const{service}=harness({status:WoStatus.WORKING,teamId:'teamA',activeExecution:true});await rejects(service.assignToTeam('wo1','teamB','admin','teamA'),'Cannot assign a working work order');}
 {const{service}=harness({status:WoStatus.ASSIGNED,teamId:'teamA',activeExecution:true});await rejects(service.assignToTeam('wo1','teamB','admin','teamA'),'active');}
 {const{s,service,tx}=harness();let first=true;tx.workOrder.updateMany=async({where,data}:any)=>{if(first){first=false;s.status=data.status;return{count:1}}return{count:0}};await service.assignToTeam('wo1','teamA','admin',null);await rejects(service.assignToTeam('wo1','teamB','admin',null),'changed since it was loaded');assert(s.teamId==='teamA','stale observed state cannot overwrite winning team');assert(s.audits.length===1,'stale request cannot write duplicate audit');}
 {const{s,service}=harness({status:WoStatus.ASSIGNED,teamId:'teamB'});await rejects(service.assignToTeam('wo1','teamA','admin','teamA'),'changed since it was loaded');assert(s.teamId==='teamB','stale Team A observation cannot overwrite current Team B');assert(s.audits.length===0,'stale expected-state rejection writes no audit');} console.log('Assignment/reassignment concurrency regression suite passed.');
}
main().catch(e=>{console.error(e);process.exit(1)});
