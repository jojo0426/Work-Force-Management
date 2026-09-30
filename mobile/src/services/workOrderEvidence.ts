import { Camera } from 'expo-camera';

export type EvidenceType =
  | 'WORK_RESULT'
  | 'SPEEDTEST'
  | 'FB_ISSUE'
  | 'CUST_ISSUE'
  | 'INSTALLATION'
  | 'TRANSFER_REMOVAL'
  | 'TRANSFER_INSTALL';

export type CapturedEvidence = {
  localUri: string;
  type: EvidenceType;
  capturedAt: string;
  captureSource: 'CAMERA';
};

/**
 * Phase 3 evidence guard.
 * Evidence is produced only from an Expo Camera instance. There is intentionally
 * no gallery/media-library picker in this workflow.
 */
export async function captureWorkOrderEvidence(
  camera: Camera,
  type: EvidenceType,
): Promise<CapturedEvidence> {
  const permission = await Camera.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is required to capture work-order evidence.');
  }

  const photo = await camera.takePictureAsync({ quality: 0.8, skipProcessing: false });
  if (!photo?.uri) {
    throw new Error('Camera capture did not produce a photo.');
  }

  return {
    localUri: photo.uri,
    type,
    capturedAt: new Date().toISOString(),
    captureSource: 'CAMERA',
  };
}

export function buildEvidenceRegistrationPayload(
  evidence: CapturedEvidence,
  uploaded: { s3Key: string; url?: string | null },
  gps?: { lat: number; lng: number } | null,
) {
  if (!uploaded.s3Key.trim()) throw new Error('Uploaded storage key is required.');
  return {
    type: evidence.type,
    captureSource: evidence.captureSource,
    capturedAt: evidence.capturedAt,
    s3Key: uploaded.s3Key,
    url: uploaded.url || null,
    lat: gps?.lat,
    lng: gps?.lng,
  };
}
