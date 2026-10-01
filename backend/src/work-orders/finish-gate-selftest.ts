import { WoStatus, WoType } from '@prisma/client';
import { validateFinishGate } from './finish-gate-policy';
function assert(v:any,m:string){if(!v)throw new Error(`FAIL: ${m}`);console.log(`PASS: ${m}`)}
function reject(fn:()=>any,text:string){try{fn();throw new Error('expected rejection')}catch(e:any){if(e.message==='expected rejection')throw e;assert(String(e.message).includes(text),`rejects ${text}`)}}
const photo=(id:string,type:string,isRequired=true)=>({id,type,isRequired});
const ticket=(photoId:string,evidenceType:string,x:any={})=>({photoId,evidenceType,executionId:'exec-1',workOrderId:'wo-1',technicianId:'tech-1',status:'CONSUMED',consumedAt:new Date(),...x});
const run=(x:any={})=>validateFinishGate({workOrderType:WoType.REPAIR,finalStatus:WoStatus.COMPLETED,resultCode:'NORMAL',photos:[photo('p1','WORK_RESULT')],tickets:[ticket('p1','WORK_RESULT')],workOrderId:'wo-1',executionId:'exec-1',technicianId:'tech-1',...x});

reject(()=>run({photos:[]}), 'WORK_RESULT active verified camera evidence is required');
reject(()=>run({photos:[photo('p1','WORK_RESULT',false)]}), 'WORK_RESULT active verified camera evidence is required');
reject(()=>run({tickets:[]}), 'not backed by a consumed verified upload ticket');
reject(()=>run({tickets:[ticket('p1','WORK_RESULT',{status:'ISSUED',consumedAt:null})]}), 'not backed by a consumed verified upload ticket');
reject(()=>run({tickets:[ticket('p1','WORK_RESULT',{workOrderId:'wo-X'})]}), 'not backed by a consumed verified upload ticket');
reject(()=>run({tickets:[ticket('p1','WORK_RESULT',{executionId:'exec-X'})]}), 'not backed by a consumed verified upload ticket');
reject(()=>run({tickets:[ticket('p1','WORK_RESULT',{technicianId:'tech-X'})]}), 'not backed by a consumed verified upload ticket');
reject(()=>run({resultCode:'SPEED_NOT_MET'}), 'SPEEDTEST active verified camera evidence is required');
const speed=run({resultCode:'SPEED_NOT_MET',photos:[photo('p1','WORK_RESULT'),photo('p2','SPEEDTEST')],tickets:[ticket('p1','WORK_RESULT'),ticket('p2','SPEEDTEST')]});assert(speed.speedRequired&&speed.required.has('SPEEDTEST'),'speed result requires verified speed-test evidence');
reject(()=>run({workOrderType:WoType.TRANSFER,photos:[photo('p1','TRANSFER_REMOVAL')],tickets:[ticket('p1','TRANSFER_REMOVAL')]}),'TRANSFER_INSTALL active verified camera evidence is required');
const transfer=run({workOrderType:WoType.TRANSFER,photos:[photo('p1','TRANSFER_REMOVAL'),photo('p2','TRANSFER_INSTALL')],tickets:[ticket('p1','TRANSFER_REMOVAL'),ticket('p2','TRANSFER_INSTALL')]});assert(transfer.required.size===2,'transfer requires both removal and installation evidence');
const install=run({workOrderType:WoType.INSTALLATION,photos:[photo('p1','INSTALLATION')],tickets:[ticket('p1','INSTALLATION')]});assert(install.verifiedPhotoIds.has('p1'),'installation accepts verified installation evidence');
const fb=run({finalStatus:WoStatus.FB_ISSUE,photos:[photo('p1','FB_ISSUE')],tickets:[ticket('p1','FB_ISSUE')]});assert(fb.required.has('FB_ISSUE'),'FB issue requires FB issue evidence');
const cust=run({finalStatus:WoStatus.CUST_ISSUE,photos:[photo('p1','CUST_ISSUE')],tickets:[ticket('p1','CUST_ISSUE')]});assert(cust.required.has('CUST_ISSUE'),'customer issue requires customer issue evidence');
const valid=run();assert(valid.verifiedPhotoIds.has('p1'),'valid repair finish passes with active ticket-backed evidence');
console.log('Finish Gate regression suite passed.');
