import { BadRequestException } from '@nestjs/common';
import { WoStatus, WoType } from '@prisma/client';

export const SPEED_RESULT_CODES=new Set(['SLOW_BROWSING','SPEED_NOT_MET','INTERMITTENT_SPEED']);
export type FinishGatePhoto={id:string;type:string;isRequired:boolean};
export type FinishGateTicket={photoId:string|null;evidenceType:string;executionId:string;workOrderId:string;technicianId:string;status:string;consumedAt:Date|null};

export function requiredFinishEvidence(workOrderType:WoType,finalStatus:WoStatus,resultCode:string){
 const required=new Set<string>();
 if(finalStatus===WoStatus.COMPLETED){
  if(workOrderType===WoType.INSTALLATION)required.add('INSTALLATION');
  else if(workOrderType===WoType.TRANSFER){required.add('TRANSFER_REMOVAL');required.add('TRANSFER_INSTALL');}
  else required.add('WORK_RESULT');
 }else if(finalStatus===WoStatus.FB_ISSUE)required.add('FB_ISSUE');
 else if(finalStatus===WoStatus.CUST_ISSUE)required.add('CUST_ISSUE');
 else throw new BadRequestException('Final status must be COMPLETED, FB_ISSUE, or CUST_ISSUE');
 if(finalStatus===WoStatus.COMPLETED&&SPEED_RESULT_CODES.has(resultCode))required.add('SPEEDTEST');
 return required;
}

export function validateFinishGate(input:{workOrderType:WoType;finalStatus:WoStatus;resultCode:string;photos:FinishGatePhoto[];tickets:FinishGateTicket[];workOrderId:string;executionId:string;technicianId:string}){
 const required=requiredFinishEvidence(input.workOrderType,input.finalStatus,input.resultCode);
 const active=input.photos.filter(p=>p.isRequired), activeTypes=new Set(active.map(p=>p.type));
 for(const type of required)if(!activeTypes.has(type))throw new BadRequestException(`${type} active verified camera evidence is required before setting status to ${input.finalStatus}`);
 const requiredPhotos=active.filter(p=>required.has(p.type));
 const verifiedPhotoIds=new Set(input.tickets.filter(t=>t.photoId&&t.status==='CONSUMED'&&t.consumedAt&&t.workOrderId===input.workOrderId&&t.executionId===input.executionId&&t.technicianId===input.technicianId&&required.has(t.evidenceType)).map(t=>t.photoId as string));
 for(const photo of requiredPhotos)if(!verifiedPhotoIds.has(photo.id))throw new BadRequestException(`${photo.type} evidence is not backed by a consumed verified upload ticket`);
 return{required,requiredPhotos,verifiedPhotoIds,speedRequired:input.finalStatus===WoStatus.COMPLETED&&SPEED_RESULT_CODES.has(input.resultCode)};
}
