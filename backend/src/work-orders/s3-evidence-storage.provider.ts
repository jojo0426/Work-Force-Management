import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EvidenceStorageProvider, EvidenceUploadRequest, EvidenceUploadTicket } from './evidence-storage.service';

@Injectable()
export class S3EvidenceStorageProvider implements EvidenceStorageProvider {
  readonly name = 'S3_COMPATIBLE';
  private readonly bucket = process.env.EVIDENCE_S3_BUCKET || '';
  private readonly region = process.env.EVIDENCE_S3_REGION || 'auto';
  private readonly endpoint = process.env.EVIDENCE_S3_ENDPOINT || undefined;
  private readonly accessKeyId = process.env.EVIDENCE_S3_ACCESS_KEY_ID || '';
  private readonly secretAccessKey = process.env.EVIDENCE_S3_SECRET_ACCESS_KEY || '';

  isConfigured() {
    return Boolean(this.bucket && this.accessKeyId && this.secretAccessKey);
  }

  private client() {
    if (!this.isConfigured()) throw new Error('S3-compatible evidence storage is not configured');
    return new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: process.env.EVIDENCE_S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId: this.accessKeyId, secretAccessKey: this.secretAccessKey },
    });
  }

  async createUploadTicket(request: EvidenceUploadRequest, storageKey: string): Promise<Omit<EvidenceUploadTicket, 'ticketId' | 'expiresAt'>> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: request.contentType,
      ContentLength: request.sizeBytes,
      Metadata: {
        'work-order-id': request.workOrderId,
        'execution-id': request.executionId,
        'technician-id': request.technicianId,
        'evidence-type': request.evidenceType,
      },
    });
    const uploadUrl = await getSignedUrl(this.client(), command, { expiresIn: 300 });
    return {
      storageKey,
      provider: this.name,
      uploadMode: 'PRESIGNED_PUT',
      maxBytes: 10 * 1024 * 1024,
      allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': request.contentType },
    };
  }
}
