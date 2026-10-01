import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EvidenceStorageService } from './evidence-storage.service';

@Injectable()
export class EvidenceRegistrationService {
  constructor(private prisma:PrismaService,private evidenceStorage:EvidenceStorageService) {}

  async register(input:{workOrderId:string;executionId:string;technicianId:string;ticketId:string;type:string;capturedAt:Date;lat:number|null;lng:number|null;url?:string|null}) {
    const ticket=await this.prisma.evidenceUploadTicket.findUnique({where:{id:input.ticketId}});
    if(!ticket)throw new BadRequestException('Evidence upload ticket not found');
    if(ticket.status!=='ISSUED'||ticket.consumedAt)throw new BadRequestException('Evidence upload ticket has already been consumed');
    if(ticket.expiresAt.getTime()<Date.now()){await this.prisma.evidenceUploadTicket.updateMany({where:{id:ticket.id,status:'ISSUED'},data:{status:'EXPIRED'}});throw new BadRequestException('Evidence upload ticket has expired');}
    if(ticket.workOrderId!==input.workOrderId||ticket.executionId!==input.executionId||ticket.technicianId!==input.technicianId)throw new BadRequestException('Evidence upload ticket does not belong to this work execution');
    if(ticket.evidenceType!==input.type)throw new BadRequestException('Evidence type does not match the authorized upload ticket');

    await this.evidenceStorage.verifyTicketObject(ticket);

    return this.prisma.$transaction(async tx=>{
      const current=await tx.evidenceUploadTicket.findUnique({where:{id:ticket.id}});
      if(!current||current.status!=='ISSUED'||current.consumedAt)throw new BadRequestException('Evidence upload ticket has already been consumed');
      if(current.expiresAt.getTime()<Date.now())throw new BadRequestException('Evidence upload ticket has expired');
      const photo=await tx.photo.create({data:{executionId:input.executionId,type:input.type,s3Key:current.storageKey,url:input.url||null,lat:input.lat,lng:input.lng,capturedAt:input.capturedAt,isRequired:true}});
      const consumed=await tx.evidenceUploadTicket.updateMany({where:{id:current.id,status:'ISSUED',consumedAt:null},data:{status:'CONSUMED',consumedAt:new Date(),photoId:photo.id}});
      if(consumed.count!==1)throw new BadRequestException('Evidence upload ticket could not be consumed');
      await tx.auditLog.create({data:{workOrderId:input.workOrderId,actorId:input.technicianId,action:'WORK_ORDER_EVIDENCE_ADDED',details:{executionId:input.executionId,photoId:photo.id,ticketId:current.id,type:photo.type,storageKey:current.storageKey,captureSource:'CAMERA',capturedAt:input.capturedAt.toISOString(),storageVerified:true}}});
      return{evidence:photo,ticket:{id:current.id,status:'CONSUMED'},storageVerified:true};
    });
  }
}
