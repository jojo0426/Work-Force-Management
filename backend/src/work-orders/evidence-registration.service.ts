import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class EvidenceRegistrationService {
  constructor(private prisma: PrismaService) {}

  async register(input: { workOrderId:string; executionId:string; technicianId:string; ticketId:string; type:string; capturedAt:Date; lat:number|null; lng:number|null; url?:string|null }) {
    return this.prisma.$transaction(async tx => {
      const ticket = await tx.evidenceUploadTicket.findUnique({ where:{ id:input.ticketId } });
      if (!ticket) throw new BadRequestException('Evidence upload ticket not found');
      if (ticket.status !== 'ISSUED' || ticket.consumedAt) throw new BadRequestException('Evidence upload ticket has already been consumed');
      if (ticket.expiresAt.getTime() < Date.now()) { await tx.evidenceUploadTicket.update({where:{id:ticket.id},data:{status:'EXPIRED'}}); throw new BadRequestException('Evidence upload ticket has expired'); }
      if (ticket.workOrderId !== input.workOrderId || ticket.executionId !== input.executionId || ticket.technicianId !== input.technicianId) throw new BadRequestException('Evidence upload ticket does not belong to this work execution');
      if (ticket.evidenceType !== input.type) throw new BadRequestException('Evidence type does not match the authorized upload ticket');
      const photo = await tx.photo.create({data:{executionId:input.executionId,type:input.type,s3Key:ticket.storageKey,url:input.url||null,lat:input.lat,lng:input.lng,capturedAt:input.capturedAt,isRequired:true}});
      const consumed = await tx.evidenceUploadTicket.updateMany({where:{id:ticket.id,status:'ISSUED',consumedAt:null},data:{status:'CONSUMED',consumedAt:new Date(),photoId:photo.id}});
      if (consumed.count !== 1) throw new BadRequestException('Evidence upload ticket could not be consumed');
      await tx.auditLog.create({data:{workOrderId:input.workOrderId,actorId:input.technicianId,action:'WORK_ORDER_EVIDENCE_ADDED',details:{executionId:input.executionId,photoId:photo.id,ticketId:ticket.id,type:photo.type,storageKey:ticket.storageKey,captureSource:'CAMERA',capturedAt:input.capturedAt.toISOString()}}});
      return { evidence:photo, ticket:{id:ticket.id,status:'CONSUMED'} };
    });
  }
}
