import { WorkOrdersService } from './work-orders.service';

const assert=(ok:boolean,msg:string)=>{if(!ok)throw new Error(`FAIL: ${msg}`);console.log(`PASS: ${msg}`)};
const row=(wo='JO-100',account='ACC-100')=>({row:2,accountNumber:account,name:'Subscriber',address:'Address',contactNumber:'09170000000',plan:'100 Mbps',jobOrder:wo,valid:true,errors:[]});

function harness(){
 const subscribers=new Map<string,any>(),workOrders=new Map<string,any>(),audits:any[]=[];let failNext=false;
 const tx:any={
  workOrder:{findUnique:async({where}:any)=>workOrders.get(where.woNumber)||null,create:async({data}:any)=>{if(failNext){failNext=false;throw new Error('simulated create failure')}if(workOrders.has(data.woNumber)){const e:any=new Error('Unique constraint');e.code='P2002';throw e}const v={id:`wo-${workOrders.size+1}`,...data};workOrders.set(data.woNumber,v);return v}},
  subscriber:{upsert:async({where,create,update}:any)=>{const current=subscribers.get(where.accountNumber);const v=current?{...current,...update}:{id:`sub-${subscribers.size+1}`,...create};subscribers.set(where.accountNumber,v);return v}},
  auditLog:{create:async({data}:any)=>{audits.push(data);return data}}
 };
 const prisma:any={
  workOrder:{findMany:async()=>[]},subscriber:{findMany:async()=>[]},
  auditLog:{create:async({data}:any)=>{audits.push(data);return data}},
  $transaction:async(fn:any)=>{const subSnapshot=new Map(subscribers),woSnapshot=new Map(workOrders),auditLen=audits.length;try{return await fn(tx)}catch(e){subscribers.clear();for(const[k,v]of subSnapshot)subscribers.set(k,v);workOrders.clear();for(const[k,v]of woSnapshot)workOrders.set(k,v);audits.splice(auditLen);throw e}}
 };
 return{service:new WorkOrdersService(prisma),subscribers,workOrders,audits,fail:()=>{failNext=true}};
}

async function main(){
 {const h=harness();const first=await h.service.bulkCreateFromParsed([row()],'admin');assert(first.created===1&&first.failed===0,'first import creates one work order');const retry=await h.service.bulkCreateFromParsed([row()],'admin');assert(retry.created===0&&retry.skipped===1,'retry is idempotent and skips existing job order');assert(h.workOrders.size===1&&h.subscribers.size===1,'retry creates no duplicate work order or subscriber');assert(h.audits.filter(a=>a.action==='WORK_ORDER_IMPORTED').length===1,'retry creates no duplicate success audit');}
 {const h=harness();await h.service.bulkCreateFromParsed([row('JO-A','ACC-X')],'admin');const second=await h.service.bulkCreateFromParsed([row('JO-B','ACC-X')],'admin');assert(second.created===1&&h.subscribers.size===1&&h.workOrders.size===2,'same account safely reuses subscriber for another job order');}
 {const h=harness();h.fail();const r=await h.service.bulkCreateFromParsed([row()],'admin');assert(r.failed===1&&r.created===0,'row failure is returned explicitly');assert(h.workOrders.size===0&&h.subscribers.size===0,'failed row transaction leaves no partial subscriber or work order');assert(h.audits.some(a=>a.action==='WORK_ORDER_IMPORT_FAILED'),'failed row creates failure audit');}
 {const h=harness();const r=await h.service.bulkCreateFromParsed([{...row(),valid:false,errors:['bad']}],'admin');assert(r.invalid===1&&r.created===0,'invalid preview row is never imported');assert(h.workOrders.size===0,'invalid row creates no work order');}
 console.log('Excel import concurrency/idempotency regression suite passed.');
}
main().catch(e=>{console.error(e);process.exit(1)});
