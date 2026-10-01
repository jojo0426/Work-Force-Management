import { Camera } from 'expo-camera';

export type EvidenceType = 'WORK_RESULT'|'SPEEDTEST'|'FB_ISSUE'|'CUST_ISSUE'|'INSTALLATION'|'TRANSFER_REMOVAL'|'TRANSFER_INSTALL';
export type WorkOrderType = 'REPAIR'|'INSTALLATION'|'TRANSFER';
export type FinalStatus = 'COMPLETED'|'FB_ISSUE'|'CUST_ISSUE';
export type ResultCode = 'NORMAL'|'SLOW_BROWSING'|'SPEED_NOT_MET'|'INTERMITTENT_SPEED';
export type CapturedEvidence = { localUri:string; type:EvidenceType; capturedAt:string; captureSource:'CAMERA' };
const SPEED_RESULT_CODES=new Set<ResultCode>(['SLOW_BROWSING','SPEED_NOT_MET','INTERMITTENT_SPEED']);

export function getRequiredEvidenceTypes(workOrderType:WorkOrderType,finalStatus:FinalStatus,resultCode:ResultCode):EvidenceType[]{
  if(finalStatus==='FB_ISSUE')return['FB_ISSUE']; if(finalStatus==='CUST_ISSUE')return['CUST_ISSUE'];
  const required:EvidenceType[]=workOrderType==='INSTALLATION'?['INSTALLATION']:workOrderType==='TRANSFER'?['TRANSFER_REMOVAL','TRANSFER_INSTALL']:['WORK_RESULT'];
  if(SPEED_RESULT_CODES.has(resultCode))required.push('SPEEDTEST'); return required;
}
export function getMissingEvidenceTypes(required:EvidenceType[],captured:EvidenceType[]){const set=new Set(captured);return required.filter(type=>!set.has(type));}
export function requiresSpeedMeasurements(resultCode:ResultCode){return SPEED_RESULT_CODES.has(resultCode);}
export async function captureWorkOrderEvidence(camera:Camera,type:EvidenceType):Promise<CapturedEvidence>{const permission=await Camera.requestCameraPermissionsAsync();if(!permission.granted)throw new Error('Camera permission is required to capture work-order evidence.');const photo=await camera.takePictureAsync({quality:0.8,skipProcessing:false});if(!photo?.uri)throw new Error('Camera capture did not produce a photo.');return{localUri:photo.uri,type,capturedAt:new Date().toISOString(),captureSource:'CAMERA'};}

export function buildEvidenceRegistrationPayload(evidence:CapturedEvidence,uploaded:{ticketId:string},gps?:{lat:number;lng:number}|null){
  if(!uploaded.ticketId.trim())throw new Error('Upload ticket ID is required.');
  return{ticketId:uploaded.ticketId,type:evidence.type,captureSource:evidence.captureSource,capturedAt:evidence.capturedAt,lat:gps?.lat,lng:gps?.lng};
}
