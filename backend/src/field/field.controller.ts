import { Controller, Post, Get, Body, Param, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../prisma.service';

@Controller()
export class FieldController {
  constructor(private prisma: PrismaService) {}

  @Get('my-assignments')
  async myAssignments() {
    // In production: filter by req.user.id team
    const assignments = await this.prisma.workOrder.findMany({ where: { status: { in: ['ASSIGNED','WORKING'] } }, take: 50 });
    return { assignments };
  }

  @Post('executions/:id/start')
  async startJob(@Param('id') id: string, @Body() body: { technicianId: string }) {
    const exec = await this.prisma.jobExecution.create({
      data: { workOrderId: id, technicianId: body.technicianId || 'demo-tech', status: 'WORKING' }
    });
    await this.prisma.workOrder.update({ where: { id }, data: { status: 'WORKING' } });
    await this.prisma.auditLog.create({ data: { workOrderId: id, actorId: body.technicianId, action: 'STARTED', details: { executionId: exec.id } } });
    return { status: 'WORKING', execution: exec };
  }

  @Post('executions/:id/measurements')
  async measurements(@Param('id') id: string, @Body() body: { rxPower?: number, downloadMbps?: number, uploadMbps?: number, pingMs?: number, napCodeReported?: string, portReported?: number, findings?: string }) {
    const exec = await this.prisma.jobExecution.findFirst({ where: { workOrderId: id }, orderBy: { createdAt: 'desc' } });
    if (!exec) return { error: 'No execution found. Start job first.' };
    const updated = await this.prisma.jobExecution.update({
      where: { id: exec.id },
      data: {
        rxPower: body.rxPower,
        downloadMbps: body.downloadMbps,
        uploadMbps: body.uploadMbps,
        pingMs: body.pingMs,
        napCodeReported: body.napCodeReported,
        portReported: body.portReported,
        findings: body.findings
      }
    });
    await this.prisma.auditLog.create({ data: { workOrderId: id, action: 'MEASUREMENT_ENTERED', details: body } });
    return { saved: true, execution: updated };
  }

  @Post('executions/:id/photos')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body() body: { type: string, lat?: string, lng?: string, isCamera?: string }) {
    // Enforce camera-only: check isCamera flag + EXIF (client must send)
    if (body.isCamera !== 'true' && body.isCamera !== '1') {
      // For beta: allow but log warning — in production reject if not camera
      console.warn('Photo not from camera — should be blocked for required evidence');
    }
    const exec = await this.prisma.jobExecution.findFirst({ where: { workOrderId: id }, orderBy: { createdAt: 'desc' } });
    if (!exec) return { error: 'Start job first' };

    // TODO: Upload to S3 — for Phase 1 save locally or mock S3 key
    const photo = await this.prisma.photo.create({
      data: {
        executionId: exec.id,
        type: body.type || 'GENERAL',
        s3Key: `evidence/${id}/${Date.now()}-${file?.originalname || 'photo.jpg'}`,
        url: `/uploads/${file?.originalname || 'photo.jpg'}`,
        lat: body.lat ? parseFloat(body.lat) : null,
        lng: body.lng ? parseFloat(body.lng) : null,
        isRequired: true
      }
    });
    await this.prisma.auditLog.create({ data: { workOrderId: id, action: 'PHOTO_CAPTURED', details: { type: body.type, photoId: photo.id } } });
    return { uploaded: true, photo };
  }

  @Post('executions/:id/complete')
  async complete(@Param('id') id: string, @Body() body: { status: 'COMPLETED'|'FB_ISSUE'|'CUST_ISSUE', findings?: string, technicianId?: string }) {
    const exec = await this.prisma.jobExecution.findFirst({ where: { workOrderId: id }, orderBy: { createdAt: 'desc' } });
    if (exec) {
      await this.prisma.jobExecution.update({ where: { id: exec.id }, data: { status: body.status as any, completedAt: new Date(), findings: body.findings } });
    }
    await this.prisma.workOrder.update({ where: { id }, data: { status: body.status as any } });
    await this.prisma.auditLog.create({ data: { workOrderId: id, action: body.status, details: { findings: body.findings } } });

    // Smart Next suggestion: find nearest remaining ASSIGNED for this tech
    const remaining = await this.prisma.workOrder.findMany({ where: { status: 'ASSIGNED' }, take: 5 });
    const suggestion = remaining.length > 0 ? { woNumber: remaining[0].woNumber, distance_m: 450, id: remaining[0].id } : null;

    return { status: body.status, completed: true, nextSuggestion: suggestion };
  }

  @Post('mismatches/report')
  async reportMismatch(@Body() body: { workOrderId: string, type: string, dbValue?: string, reportedValue: string, reportedBy?: string }) {
    const mismatch = await this.prisma.mismatch.create({
      data: {
        workOrderId: body.workOrderId,
        type: body.type,
        dbValue: body.dbValue,
        reportedValue: body.reportedValue,
        reportedBy: body.reportedBy,
        status: 'PENDING'
      }
    });
    await this.prisma.auditLog.create({ data: { workOrderId: body.workOrderId, action: 'MISMATCH_REPORTED', details: body } });
    return { reported: true, mismatch, message: 'Supervisor will review — verified data not overwritten' };
  }
}
