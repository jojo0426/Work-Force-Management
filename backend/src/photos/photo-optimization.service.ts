import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PhotoOptimizationService {
  constructor(private prisma: PrismaService) {}

  // Photo Evidence — camera-only, optimization for storage
  // UPLOAD PHOTO -> OPEN CAMERA -> CAPTURE -> PREVIEW -> RETAKE / USE PHOTO
  // No gallery upload for required field evidence
  async optimizePhoto(photoId: string) {
    // In production: generate thumbnail via Sharp, compress, upload to S3 with lifecycle
    // For Phase 3: mark as compressed, generate thumbnail key
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) return null;

    const thumbnailKey = photo.s3Key.replace(/\.(jpg|jpeg|png)$/i, '-thumb.jpg');

    const optimized = await this.prisma.photo.update({
      where: { id: photoId },
      data: {
        thumbnailS3Key: thumbnailKey,
        compressed: true,
        fileSize: 1024 * 500 // mock 500KB
      } as any
    });

    return {
      original: photo.s3Key,
      thumbnail: thumbnailKey,
      optimized: true,
      storage: 'S3 with lifecycle: 30 days standard, 90 days IA, 1 year Glacier',
      evidenceTypes: {
        REPAIR: ['modem/ONT condition', 'NAP work', 'fiber repair', 'signal measurement', 'after-repair condition', 'speed-test result for slow browsing'],
        INSTALLATION: ['installed modem/ONT', 'cable routing', 'NAP connection', 'signal level', 'subscriber premises', 'completed installation'],
        TRANSFER: ['old location removal evidence', 'new location installation evidence'],
        FB_ISSUE_CUST_ISSUE: ['photos supporting why not completed', 'signed hard-copy WO during beta']
      }
    };
  }

  async getRequiredEvidence(workOrderType: string) {
    const matrix: any = {
      REPAIR: ['MODEM_ONT', 'NAP_WORK', 'FIBER_REPAIR', 'SIGNAL_MEASUREMENT', 'AFTER_REPAIR', 'SPEEDTEST'],
      INSTALLATION: ['MODEM_ONT', 'CABLE_ROUTING', 'NAP_CONNECTION', 'SIGNAL_LEVEL', 'PREMISES', 'COMPLETED'],
      TRANSFER: ['OLD_REMOVAL', 'OLD_NAP', 'NEW_INSTALL', 'NEW_NAP', 'NEW_SIGNAL', 'NEW_PREMISES'],
      FB_ISSUE: ['ISSUE_EVIDENCE', 'NAP_CONDITION', 'HARD_COPY_WO'],
      CUST_ISSUE: ['ISSUE_EVIDENCE', 'PREMISES_CONDITION', 'HARD_COPY_WO']
    };
    return { workOrderType, required: matrix[workOrderType] || matrix['REPAIR'], cameraOnly: true };
  }
}
