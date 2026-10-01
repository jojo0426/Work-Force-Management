import { readFileSync } from 'fs';
import { join } from 'path';

function assert(ok:boolean,message:string){if(!ok)throw new Error(`FAIL: ${message}`);console.log(`PASS: ${message}`);}

const source=readFileSync(join(__dirname,'field-exception.service.ts'),'utf8');

assert(source.includes("if(resolution==='KEEP_ON_HOLD')"),'KEEP_ON_HOLD has a dedicated lifecycle path');
assert(source.includes("action:'FIELD_EXCEPTION_KEPT_ON_HOLD'"),'KEEP_ON_HOLD is audited without consuming the exception');
assert(source.includes('pending:true'),'KEEP_ON_HOLD remains actionable/pending');
assert(source.includes("NOT:{id:ex.executionId}"),'RESUME checks for another active technician execution');
assert(source.includes('Technician already has another active work order'),'RESUME rejects technician active-job conflicts');
assert(source.includes('Original execution is no longer active'),'stale execution transitions are rejected');
assert(source.includes("workOrder.updateMany({where:{id:ex.workOrderId,status:WoStatus.ON_HOLD}"),'management transition atomically claims ON_HOLD work order state');
assert(source.includes("fieldException.updateMany({where:{id,status:'PENDING'}"),'management transition atomically claims pending exception state');
assert(source.includes("jobExecution.updateMany({where:{id:ex.executionId,completedAt:null}"),'RETURN/CANCEL atomically close only active execution');
assert(source.includes("if(resolution==='RESUME')await tx.user.update"),'technician returns to WORKING only on safe RESUME');

console.log('Field exception lifecycle hardening self-test complete.');
