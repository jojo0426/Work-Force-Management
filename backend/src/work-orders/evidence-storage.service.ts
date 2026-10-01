import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';

export type EvidenceUploadRequest = { workOrderId:string; executionId:string; technicianId:string; evidenceType:string; contentType:string; sizeBytes:number; originalName?:string };
export type EvidenceUploadTicket = { ticketId:string; storageKey:string; provider:string; uploadMode:string; expiresAt:string; maxBytes:number; allowedContentTypes:string[]; uploadUrl?:string; method?:string; headers?:Record<string,string>; fields?:Record<string,string> };
export type EvidenceStoredObject = { exists:boolean; sizeBytes?:number; contentType?:string; metadata?:Record<string,string> };
export interface EvidenceStorageProvider { readonly name:string; createUploadTicket(request:EvidenceUploadRequest,storageKey:string):Promise<Omit<EvidenceUploadTicket,'ticketId'|'expiresAt'>>; verifyUploadedObject(storageKey:string):Promise<EvidenceStoredObject>; }

@Injectable()
export class EvidenceStorageService {
  static readonly MAX_IMAGE_BYTES=10*1024*1024;
  static readonly ALLOWED_CONTENT_TYPES=['image/jpeg','image/png','image/webp'];
  static readonly TICKET_TTL_MS=5*60*1000;
  private provider:EvidenceStorageProvider|null=null;
  constructor(private prisma:PrismaService) {}
  registerProvider(provider:EvidenceStorageProvider){this.provider=provider;}

  async createUploadTicket(request:EvidenceUploadRequest):Promise<EvidenceUploadTicket>{
    this.validateImage(request.contentType,request.sizeBytes);
    const storageKey=this.buildStorageKey(request), expiresAt=new Date(Date.now()+EvidenceStorageService.TICKET_TTL_MS);
    if(!this.provider) throw new NotImplementedException({message:'Evidence storage provider is not configured',provider:'UNCONFIGURED',maxBytes:EvidenceStorageService.MAX_IMAGE_BYTES,allowedContentTypes:EvidenceStorageService.ALLOWED_CONTENT_TYPES});
    const providerTicket=await this.provider.createUploadTicket(request,storageKey);
    const row=await this.prisma.evidenceUploadTicket.create({data:{workOrderId:request.workOrderId,executionId:request.executionId,technicianId:request.technicianId,evidenceType:request.evidenceType,storageKey,contentType:request.contentType,sizeBytes:request.sizeBytes,provider:this.provider.name,status:'ISSUED',expiresAt}});
    return {...providerTicket,ticketId:row.id,storageKey,provider:this.provider.name,expiresAt:expiresAt.toISOString(),maxBytes:EvidenceStorageService.MAX_IMAGE_BYTES,allowedContentTypes:EvidenceStorageService.ALLOWED_CONTENT_TYPES};
  }

  async verifyTicketObject(ticket:{storageKey:string;provider:string;contentType:string;sizeBytes:number;workOrderId:string;executionId:string;technicianId:string;evidenceType:string}){
    if(!this.provider||this.provider.name!==ticket.provider) throw new NotImplementedException('Evidence storage provider required by this ticket is not configured');
    const object=await this.provider.verifyUploadedObject(ticket.storageKey);
    if(!object.exists) throw new BadRequestException('Uploaded evidence object was not found in storage');
    if(object.sizeBytes!==ticket.sizeBytes) throw new BadRequestException('Uploaded evidence size does not match the authorized upload');
    if(String(object.contentType||'').toLowerCase()!==ticket.contentType.toLowerCase()) throw new BadRequestException('Uploaded evidence content type does not match the authorized upload');
    const metadata=object.metadata||{};
    if(metadata['work-order-id']!==ticket.workOrderId||metadata['execution-id']!==ticket.executionId||metadata['technician-id']!==ticket.technicianId||metadata['evidence-type']!==ticket.evidenceType) throw new BadRequestException('Uploaded evidence metadata does not match the authorized work execution');
    return object;
  }

  validateImage(contentType:string,sizeBytes:number){const normalized=String(contentType||'').toLowerCase();if(!EvidenceStorageService.ALLOWED_CONTENT_TYPES.includes(normalized))throw new BadRequestException('Evidence upload must be JPEG, PNG, or WEBP');if(!Number.isInteger(sizeBytes)||sizeBytes<=0||sizeBytes>EvidenceStorageService.MAX_IMAGE_BYTES)throw new BadRequestException(`Evidence image must be between 1 byte and ${EvidenceStorageService.MAX_IMAGE_BYTES} bytes`);}
  private buildStorageKey(r:EvidenceUploadRequest){const ext=r.contentType==='image/png'?'png':r.contentType==='image/webp'?'webp':'jpg';const type=String(r.evidenceType||'EVIDENCE').replace(/[^A-Z0-9_-]/gi,'_').toUpperCase();return `work-orders/${r.workOrderId}/executions/${r.executionId}/${type}/${randomUUID()}.${ext}`;}
}
