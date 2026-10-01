import { Controller, Post, Get, Body, Param, UploadedFile, UseInterceptors, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FieldController {
  constructor(private prisma: PrismaService) {}

  @Get('my-assignments')
  @Roles(UserRole.TECHNICIAN)
  async myAssignments(@Req() req: any) {
    if (!req.user.teamId) return { assignments: [] };
    const assignments = await this.prisma.workOrder.findMany({
      where: {
        status: { in: ['ASSIGNED', 'WORKING'] },
        assignments: { some: { teamId: req.user.teamId } }
      },
      take: 50,
      orderBy: { createdAt: 'desc' }
    });
    return { assignments };
  }

  @Post('executions/:id/start')
  @Roles(UserRole.TECHNICIAN)
  async startJob(@Req() req: any, @Param('id') id: string) {
    await this.assertTechnicianAssigned(req.user, id);
    const exec = await this.prisma.jobExecution.create({
      data: { workOrderId: id, technicianId: req.user.id, status: 'WORKING' }
    });
    await this.prisma.workOrder.update({ where: { id }, data: { status: 'WORKING' } });
    await this.prisma.auditLog.create({ data: { workOrderId: id, actorId: req.user.id, action: 'STARTED', details: { executionId: exec.id } } });
    return { status: 'WORKING', execution: exec };
  }

  @Post('executions/:id/measurements')
  @Roles(UserRole.TECHNICIAN)
  async measurements(@Req() req: any, @Param('id') id: string, @Body() body: { rxPower?: number, downloadMbps?: number, uploadMbps?: number, pingMs?: number, napCodeReported?: string, portReported?: number, findings?: string }) {
    await this.assertTechnicianAssigned(req.user, id);
    const exec = await this.prisma.jobExecution.findFirst({ where: { workOrderId: id, technicianId: req.user.id }, orderBy: { createdAt: 'desc' } });
    if (!exec) return { error: 'No execution found. Start job first.' };
    const updated = await this.prisma.jobExecution.update({
      where: { id: exec.id },
      data: { rxPower: body.rxPower, downloadMbps: body.downloadMbps, uploadMbps: body.uploadMbps, pingMs: body.pingMs, napCodeReported: body.napCodeReported, portReported: body.portReported, findings: body.findings }
    });
    await this.prisma.auditLog.create({ data: { workOrderId: id, actorId: req.user.id, action: 'MEASUREMENT_ENTERED', details: body } });
    return { saved: true, execution: updated };
  }

  @Post('executions/:id/photos')
  @Roles(UserRole.TECHNICIAN)
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(@Req() req: any, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body() body: { type: string, lat?: string, lng?: string, isCamera?: string }) {
    await this.assertTechnicianAssigned(req.user, id);
    if (body.isCamera !== 'true' && body.isCamera !== '1') {
      throw new ForbiddenException('Required evidence must be captured using the technician camera');
    }
    const exec = await this.prisma.jobExecution.findFirst({ where: { workOrderId: id, technicianId: req.user.id }, orderBy: { createdAt: 'desc' } });
    if (!exec) return { error: 'Start job first' };
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
    await this.prisma.auditLog.create({ data: { workOrderId: id, actorId: req.user.id, action: 'PHOTO_CAPTURED', details: { type: body.type, photoId: photo.id } } });
    return { uploaded: true, photo };
  }

  @Post('executions/:id/complete')
  @Roles(UserRole.TECHNICIAN)
  async complete(@Req() req: any, @Param('id') id: string, @Body() body: { status: 'COMPLETED'|'FB_ISSUE'|'CUST_ISSUE', findings?: string }) {
    await this.assertTechnicianAssigned(req.user, id);
    const exec = await this.prisma.jobExecution.findFirst({ where: { workOrderId: id, technicianId: req.user.id }, orderBy: { createdAt: 'desc' } });
    if (!exec) return { error: 'No execution found. Start job first.' };
    await this.prisma.jobExecution.update({ where: { id: exec.id }, data: { status: body.status as any, completedAt: new Date(), findings: body.findings } });
    await this.prisma.workOrder.update({ where: { id }, data: { status: body.status as any } });
    await this.prisma.auditLog.create({ data: { workOrderId: id, actorId: req.user.id, action: body.status, details: { findings: body.findings } } });
    const remaining = await this.prisma.workOrder.findMany({ where: { status: 'ASSIGNED', assignments: { some: { teamId: req.user.teamId } } }, take: 5 });
    const suggestion = remaining.length > 0 ? { woNumber: remaining[0].woNumber, distance_m: 450, id: remaining[0].id } : null;
    return { status: body.status, completed: true, nextSuggestion: suggestion };
  }

  @Post('mismatches/report')
  @Roles(UserRole.TECHNICIAN, UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async reportMismatch(@Req() req: any, @Body() body: { workOrderId: string, type: string, dbValue?: string, reportedValue: string }) {
    const mismatch = await this.prisma.mismatch.create({
      data: { workOrderId: body.workOrderId, type: body.type, dbValue: body.dbValue, reportedValue: body.reportedValue, reportedBy: req.user.id, status: 'PENDING' }
    });
    await this.prisma.auditLog.create({ data: { workOrderId: body.workOrderId, actorId: req.user.id, action: 'MISMATCH_REPORTED', details: body } });
    return { reported: true, mismatch, message: 'Supervisor will review — verified data not overwritten' };
  }

  private async assertTechnicianAssigned(user: any, workOrderId: string) {
    if (!user.teamId) throw new ForbiddenException('Technician is not assigned to a team');
    const assignment = await this.prisma.assignment.findFirst({ where: { workOrderId, teamId: user.teamId } });
    if (!assignment) throw new ForbiddenException('Work order is not assigned to your team');
  }
}
