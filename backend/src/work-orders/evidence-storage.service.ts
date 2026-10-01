import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type EvidenceUploadRequest = {
  workOrderId: string;
  executionId: string;
  technicianId: string;
  evidenceType: string;
  contentType: string;
  sizeBytes: number;
  originalName?: string;
};

export type EvidenceUploadTicket = {
  storageKey: string;
  provider: string;
  uploadMode: 'PROVIDER_PENDING';
  maxBytes: number;
  allowedContentTypes: string[];
};

export interface EvidenceStorageProvider {
  readonly name: string;
  createUploadTicket(request: EvidenceUploadRequest, storageKey: string): Promise<EvidenceUploadTicket>;
}

@Injectable()
export class EvidenceStorageService {
  static readonly MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  static readonly ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  private provider: EvidenceStorageProvider | null = null;

  registerProvider(provider: EvidenceStorageProvider) {
    this.provider = provider;
  }

  async createUploadTicket(request: EvidenceUploadRequest): Promise<EvidenceUploadTicket> {
    this.validateImage(request.contentType, request.sizeBytes);
    const storageKey = this.buildStorageKey(request);
    if (!this.provider) {
      // Foundation is intentionally fail-closed until an object-storage adapter is configured.
      throw new NotImplementedException({
        message: 'Evidence storage provider is not configured',
        storageKey,
        provider: 'UNCONFIGURED',
        maxBytes: EvidenceStorageService.MAX_IMAGE_BYTES,
        allowedContentTypes: EvidenceStorageService.ALLOWED_CONTENT_TYPES,
      });
    }
    return this.provider.createUploadTicket(request, storageKey);
  }

  validateImage(contentType: string, sizeBytes: number) {
    const normalized = String(contentType || '').toLowerCase();
    if (!EvidenceStorageService.ALLOWED_CONTENT_TYPES.includes(normalized)) {
      throw new BadRequestException('Evidence upload must be JPEG, PNG, or WEBP');
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > EvidenceStorageService.MAX_IMAGE_BYTES) {
      throw new BadRequestException(`Evidence image must be between 1 byte and ${EvidenceStorageService.MAX_IMAGE_BYTES} bytes`);
    }
  }

  private buildStorageKey(request: EvidenceUploadRequest) {
    const extension = request.contentType === 'image/png' ? 'png' : request.contentType === 'image/webp' ? 'webp' : 'jpg';
    const safeType = String(request.evidenceType || 'EVIDENCE').replace(/[^A-Z0-9_-]/gi, '_').toUpperCase();
    return `work-orders/${request.workOrderId}/executions/${request.executionId}/${safeType}/${randomUUID()}.${extension}`;
  }
}
