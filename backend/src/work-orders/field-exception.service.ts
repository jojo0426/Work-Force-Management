import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, WoStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export const FIELD_EXCEPTION_REASONS=['CUSTOMER_UNAVAILABLE','SITE_INACCESSIBLE','UNSAFE_CONDITION','WRONG_ADDRESS_OR_DETAILS','RESCHEDULE_REQUESTED','NEEDS_CONTROLLER_SUPPORT'] as const;
const MANAGEMENT_RESOLUTIONS=['RESUME','KEEP_ON_HOLD','RETURN_TO_ASSIGNED','CANCEL'] as const;
@Injectable()
export class FieldExceptionService{
 constructor(private prisma:PrismaService){}
 async report(workOrderId:string,technicianId:string,body:any){
  const reason=String(body.reason||'').trim().toUpperCase();if(!FIELD_EXCEPTION_REASONS.includes(reason as any))throw new BadRequestException('Unsupported field exception reason');
  const notes=String(body.notes||'').trim();if(['UNSAFE_CONDITION','WRONG_ADDRESS_OR_DETAILS','NEEDS_CONTROLLER_SUPPORT'].includes(reason)&&notes.length<5)throw new BadRequestException('Notes are required for this exception reason');
  const lat=body.lat==null?null:Number(body.lat),lng=body.lng==null?null:Number(body.lng);if(lat!=null&&(!Number.isFinite(lat)||lat< -90||lat>90))throw new BadRequestException('Exception latitude is invalid');if(lng!=null&&(!Number.isFinite(lng)||lng< -180||lng>180))throw new BadRequestException('Exception longitude is invalid');
  return this.prisma.$transaction(async tx=>{const wo=await tx.workOrder.findUnique({where:{id:workOrderId},include:{assignments:true}});if(!wo)throw new NotFoundException('Work order not found');if(wo.status!==WoStatus.WORKING)throw new BadRequestException('Only a working work order can be placed on hold');const tech=await tx.user.findUnique({where:{id:technicianId},select:{teamId:true,isActive:true}});if(!tech?.isActive||!tech.teamId||!wo.assignments.some(a=>a.teamId===tech.teamId))throw new ForbiddenException('Technician is not authorized for this work order');const execution=await tx.jobExecution.findFirst({where:{workOrderId,technicianId,completedAt:null},orderBy:{startedAt:'desc'}});if(!execution)throw new BadRequestException('No active execution belongs to this technician');const pending=await tx.fieldException.findFirst({where:{workOrderId,status:'PENDING'}});if(pending)return{exception:pending,idempotent:true};const claimed=await tx.workOrder.updateMany({where:{id:workOrderId,status:WoStatus.WORKING},data:{status:WoStatus.ON_HOLD}});if(claimed.count!==1)throw new BadRequestException('Work order state changed by another request');const exception=await tx.fieldException.create({data:{workOrderId,executionId:execution.id,technicianId,reason,notes:notes||null,lat,lng}});await tx.user.update({where:{id:technicianId},data:{status:UserStatus.AVAILABLE}});await tx.auditLog.create({data:{workOrderId,actorId:technicianId,action:'FIELD_EXCEPTION_REPORTED',details:{exceptionId:exception.id,reason,notesProvided:!!notes,lat,lng,workOrderPlacedOnHold:true}}});return{exception,idempotent:false,workOrderStatus:WoStatus.ON_HOLD};});
 }
 async pending(){return{data:await this.prisma.fieldException.findMany({where:{status:'PENDING'},include:{workOrder:{include:{assignments:true}}},orderBy:{reportedAt:'asc'},take:100})};}
 async review(id:string,reviewerId:string,reviewerRole:UserRole,body:any){
  const resolution=String(body.resolution||'').trim().toUpperCase();if(!MANAGEMENT_RESOLUTIONS.includes(resolution as any))throw new BadRequestException('Unsupported exception resolution');
  const note=String(body.note||'').trim();if((resolution==='CANCEL'||resolution==='KEEP_ON_HOLD')&&note.length<5)throw new BadRequestException('Management note is required for this resolution');
  return this.prisma.$transaction(async tx=>{
   const ex=await tx.fieldException.findUnique({where:{id},include:{workOrder:true}});if(!ex)throw new NotFoundException('Field exception not found');if(ex.status!=='PENDING')throw new BadRequestException('Field exception was already reviewed');if(ex.workOrder.status!==WoStatus.ON_HOLD)throw new BadRequestException('Work order is no longer on hold');
   if(resolution==='KEEP_ON_HOLD'){
    await tx.auditLog.create({data:{workOrderId:ex.workOrderId,actorId:reviewerId,action:'FIELD_EXCEPTION_KEPT_ON_HOLD',details:{exceptionId:id,resolution,note,workOrderStatus:WoStatus.ON_HOLD,reviewerRole}}});
    return{exceptionId:id,resolution,workOrderStatus:WoStatus.ON_HOLD,pending:true};
   }
   let next:WoStatus=WoStatus.ON_HOLD;if(resolution==='RESUME')next=WoStatus.WORKING;if(resolution==='RETURN_TO_ASSIGNED')next=WoStatus.ASSIGNED;if(resolution==='CANCEL')next=WoStatus.CANCELLED;
   if(resolution==='RESUME'){
    const execution=await tx.jobExecution.findUnique({where:{id:ex.executionId}});if(!execution||execution.completedAt)throw new BadRequestException('Original execution is no longer active');
    const competing=await tx.jobExecution.findFirst({where:{technicianId:ex.technicianId,completedAt:null,NOT:{id:ex.executionId}}});if(competing)throw new BadRequestException('Technician already has another active work order');
   }
   const claimedWo=await tx.workOrder.updateMany({where:{id:ex.workOrderId,status:WoStatus.ON_HOLD},data:{status:next}});if(claimedWo.count!==1)throw new BadRequestException('Work order state changed by another request');
   const claimed=await tx.fieldException.updateMany({where:{id,status:'PENDING'},data:{status:'REVIEWED',reviewedBy:reviewerId,reviewedAt:new Date(),resolution:resolution+(note?`: ${note}`:''),resumeAt:resolution==='RESUME'?new Date():null}});if(claimed.count!==1)throw new BadRequestException('Field exception was reviewed by another request');
   if(resolution==='RETURN_TO_ASSIGNED'||resolution==='CANCEL'){const closed=await tx.jobExecution.updateMany({where:{id:ex.executionId,completedAt:null},data:{completedAt:new Date(),status:next,findings:`Field exception: ${ex.reason}. ${note}`.trim()}});if(closed.count!==1)throw new BadRequestException('Original execution is no longer active');}
   if(resolution==='RESUME')await tx.user.update({where:{id:ex.technicianId},data:{status:UserStatus.WORKING}});
   await tx.auditLog.create({data:{workOrderId:ex.workOrderId,actorId:reviewerId,action:'FIELD_EXCEPTION_REVIEWED',details:{exceptionId:id,resolution,note:note||null,nextWorkOrderStatus:next,reviewerRole}}});return{exceptionId:id,resolution,workOrderStatus:next};
  });
 }
}
