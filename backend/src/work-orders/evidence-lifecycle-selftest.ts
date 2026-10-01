import { EvidenceRegistrationService } from './evidence-registration.service';

type Ticket = any;
function assert(condition:any,message:string){if(!condition)throw new Error(`FAIL: ${message}`);console.log(`PASS: ${message}`);}
async function rejects(fn:()=>Promise<any>,contains:string){try{await fn();throw new Error('expected rejection');}catch(e:any){if(e?.message==='expected rejection')throw e;assert(String(e?.message||e).includes(contains),`rejects: ${contains}`);}}

function harness(overrides:Partial<Ticket>={},objectOverride:any={}){
 const now=Date.now();
 const ticket:Ticket={id:'ticket-1',status:'ISSUED',consumedAt:null,expiresAt:new Date(now+60000),workOrderId:'wo-1',executionId:'exec-1',technicianId:'tech-1',evidenceType:'WORK_RESULT',storageKey:'work-orders/wo-1/e.jpg',provider:'TEST',contentType:'image/jpeg',sizeBytes:123,...overrides};
 const photos:any[]=[]; const audits:any[]=[];
 const prisma:any={
  evidenceUploadTicket:{findUnique:async({where}:any)=>where.id===ticket.id?ticket:null,updateMany:async({where,data}:any)=>{if(where.id!==ticket.id||ticket.status!==where.status)return{count:0};Object.assign(ticket,data);return{count:1};}},
  $transaction:async(fn:any)=>fn({
   evidenceUploadTicket:{findUnique:async()=>ticket,updateMany:async({where,data}:any)=>{if(ticket.status!==where.status||ticket.consumedAt!==null)return{count:0};Object.assign(ticket,data);return{count:1};}},
   photo:{findFirst:async()=>{const matches=photos.filter(p=>p.executionId==='exec-1'&&p.type==='WORK_RESULT'&&p.isRequired);return matches.length?matches[matches.length-1]:null;},create:async({data}:any)=>{const p={id:`photo-${photos.length+1}`,...data};photos.push(p);return p;},update:async({where,data}:any)=>{const p=photos.find(x=>x.id===where.id);Object.assign(p,data);return p;}},
   auditLog:{create:async({data}:any)=>{audits.push(data);return data;}}
  })
 };
 const expected={exists:true,sizeBytes:ticket.sizeBytes,contentType:ticket.contentType,metadata:{'work-order-id':ticket.workOrderId,'execution-id':ticket.executionId,'technician-id':ticket.technicianId,'evidence-type':ticket.evidenceType},...objectOverride};
 const storage:any={verifyTicketObject:async(t:any)=>{if(!expected.exists)throw new Error('Uploaded evidence object was not found in storage');if(expected.sizeBytes!==t.sizeBytes)throw new Error('Uploaded evidence size does not match the authorized upload');if(expected.contentType!==t.contentType)throw new Error('Uploaded evidence content type does not match the authorized upload');const m=expected.metadata;if(m['work-order-id']!==t.workOrderId||m['execution-id']!==t.executionId||m['technician-id']!==t.technicianId||m['evidence-type']!==t.evidenceType)throw new Error('Uploaded evidence metadata does not match the authorized work execution');return expected;}};
 return{service:new EvidenceRegistrationService(prisma,storage),ticket,photos,audits};
}
const input=(x:any={})=>({workOrderId:'wo-1',executionId:'exec-1',technicianId:'tech-1',ticketId:'ticket-1',type:'WORK_RESULT',capturedAt:new Date(),lat:14.3,lng:120.9,...x});

async function main(){
 await rejects(()=>harness({expiresAt:new Date(Date.now()-1000)}).service.register(input()),'expired');
 await rejects(()=>harness({status:'CONSUMED',consumedAt:new Date()}).service.register(input()),'already been consumed');
 await rejects(()=>harness().service.register(input({technicianId:'tech-2'})),'does not belong');
 await rejects(()=>harness().service.register(input({executionId:'exec-2'})),'does not belong');
 await rejects(()=>harness().service.register(input({workOrderId:'wo-2'})),'does not belong');
 await rejects(()=>harness().service.register(input({type:'SPEEDTEST'})),'type does not match');
 await rejects(()=>harness({}, {exists:false}).service.register(input()),'not found');
 await rejects(()=>harness({}, {sizeBytes:124}).service.register(input()),'size does not match');
 await rejects(()=>harness({}, {contentType:'image/png'}).service.register(input()),'content type does not match');
 await rejects(()=>harness({}, {metadata:{'work-order-id':'wo-X','execution-id':'exec-1','technician-id':'tech-1','evidence-type':'WORK_RESULT'}}).service.register(input()),'metadata does not match');
 const ok=harness();const first=await ok.service.register(input());assert(first.storageVerified===true,'successful registration is storage verified');assert(ok.ticket.status==='CONSUMED','successful registration consumes ticket');assert(ok.photos.length===1&&ok.photos[0].isRequired===true,'successful registration creates active evidence');await rejects(()=>ok.service.register(input()),'already been consumed');
 const replacement=harness();await replacement.service.register(input());replacement.ticket.status='ISSUED';replacement.ticket.consumedAt=null;replacement.ticket.id='ticket-1';const second=await replacement.service.register(input({capturedAt:new Date(Date.now()+1000)}));assert(replacement.photos.length===2,'replacement preserves both evidence records');assert(replacement.photos[0].isRequired===false&&replacement.photos[1].isRequired===true,'replacement activates only latest evidence');assert(second.replacedEvidence?.id===replacement.photos[0].id,'replacement response identifies prior evidence');assert(replacement.audits.some(a=>a.action==='WORK_ORDER_EVIDENCE_REPLACED'),'replacement writes dedicated audit history');
 console.log('Evidence lifecycle security regression suite passed.');
}
main().catch(e=>{console.error(e);process.exit(1);});
