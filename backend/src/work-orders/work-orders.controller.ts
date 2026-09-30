import { BadRequestException, Controller, ForbiddenException, NotFoundException, Post, Get, Query, Param, Body, UploadedFile, UseInterceptors, UseGuards, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole, WoStatus } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersPhase2Service } from './work-orders-phase2.service';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkOrdersController {
  constructor(private svc: WorkOrdersService, private phase2: WorkOrdersPhase2Service, private prisma: PrismaService) {}

  @Post('upload')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Excel file is required');
    const result = this.svc.parseExcel(file.buffer);
    return { message: 'Excel parsed. Review rows, then call /work-orders/import-preview before confirmation.', filename: file.originalname, ...result };
  }

  @Post('import-preview')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async importPreview(@Body() body: any) { return this.svc.prepareImportPreview(body.workOrders); }

  @Post('confirm')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async confirm(@Body() body: any, @Req() req: any) {
    if (!Array.isArray(body.workOrders)) throw new BadRequestException('workOrders must be an array');
    const result = await this.svc.bulkCreateFromParsed(body.workOrders, req.user.id);
    return { message: 'Excel import confirmation processed', ...result };
  }

  @Get()
  @Roles(UserRole.TECHNICIAN, UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async list(@Req() req: any, @Query('status') status?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (req.user.role === UserRole.TECHNICIAN) {
      const technician = await this.prisma.user.findUnique({ where: { id: req.user.id }, select: { teamId: true, isActive: true } });
      if (!technician?.isActive) throw new ForbiddenException('Technician account is inactive');
      if (!technician.teamId) return { data: [] };
      where.assignments = { some: { teamId: technician.teamId } };
      where.status = status || { in: [WoStatus.ASSIGNED, WoStatus.WORKING] };
    }
    const data = await this.prisma.workOrder.findMany({ where, include: { assignments: true }, take: 100, orderBy: { createdAt: 'desc' } });
    return { data };
  }

  @Post(':id/start')
  @Roles(UserRole.TECHNICIAN)
  async startWork(@Req() req: any, @Param('id') id: string) {
    const technician = await this.prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, teamId: true, isActive: true } });
    if (!technician?.isActive) throw new ForbiddenException('Technician account is inactive');
    if (!technician.teamId) throw new ForbiddenException('Technician is not assigned to a team');
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id }, include: { assignments: true } });
    if (!workOrder) throw new NotFoundException('Work order not found');
    if (!workOrder.assignments.some((assignment) => assignment.teamId === technician.teamId)) throw new ForbiddenException('Work order is not assigned to your team');
    if (workOrder.status !== WoStatus.ASSIGNED) throw new BadRequestException(`Work order must be assigned before starting; current status is ${workOrder.status}`);
    return this.prisma.$transaction(async (tx) => {
      const activeExecution = await tx.jobExecution.findFirst({ where: { workOrderId: id, completedAt: null } });
      if (activeExecution) throw new BadRequestException('Work order already has an active execution');
      const execution = await tx.jobExecution.create({ data: { workOrderId: id, technicianId: technician.id, status: WoStatus.WORKING } });
      const updated = await tx.workOrder.update({ where: { id }, data: { status: WoStatus.WORKING } });
      await tx.user.update({ where: { id: technician.id }, data: { status: 'WORKING' } });
      await tx.auditLog.create({ data: { workOrderId: id, actorId: technician.id, action: 'WORK_ORDER_STARTED', details: { teamId: technician.teamId, executionId: execution.id } } });
      return { workOrder: updated, execution };
    });
  }

  @Post(':id/evidence')
  @Roles(UserRole.TECHNICIAN)
  async addEvidence(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const execution = await this.prisma.jobExecution.findFirst({ where: { workOrderId: id, technicianId: req.user.id, completedAt: null }, orderBy: { startedAt: 'desc' } });
    if (!execution) throw new BadRequestException('No active execution found for this technician and work order');
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!workOrder || workOrder.status !== WoStatus.WORKING) throw new BadRequestException('Evidence can only be added to a working work order');
    if (body.captureSource !== 'CAMERA') throw new BadRequestException('Evidence must be captured using the in-app camera');
    if (!body.s3Key || !body.type) throw new BadRequestException('Evidence type and uploaded storage key are required');
    const allowedTypes = ['WORK_RESULT', 'SPEEDTEST', 'FB_ISSUE', 'CUST_ISSUE', 'INSTALLATION', 'TRANSFER_REMOVAL', 'TRANSFER_INSTALL'];
    if (!allowedTypes.includes(String(body.type))) throw new BadRequestException('Unsupported evidence type');
    const photo = await this.prisma.photo.create({ data: { executionId: execution.id, type: String(body.type), s3Key: String(body.s3Key), url: body.url || null, lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : null, lng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : null, isRequired: true } });
    await this.prisma.auditLog.create({ data: { workOrderId: id, actorId: req.user.id, action: 'WORK_ORDER_EVIDENCE_ADDED', details: { executionId: execution.id, photoId: photo.id, type: photo.type, captureSource: 'CAMERA' } } });
    return { evidence: photo };
  }

  @Post(':id/finish')
  @Roles(UserRole.TECHNICIAN)
  async finishWork(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const finalStatus = String(body.status || '') as WoStatus;
    const allowedFinalStatuses: WoStatus[] = [WoStatus.COMPLETED, WoStatus.FB_ISSUE, WoStatus.CUST_ISSUE];
    if (!allowedFinalStatuses.includes(finalStatus)) throw new BadRequestException('Final status must be COMPLETED, FB_ISSUE, or CUST_ISSUE');
    const execution = await this.prisma.jobExecution.findFirst({ where: { workOrderId: id, technicianId: req.user.id, completedAt: null }, include: { photos: true }, orderBy: { startedAt: 'desc' } });
    if (!execution) throw new BadRequestException('No active execution found for this technician and work order');
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id }, include: { assignments: true } });
    if (!workOrder) throw new NotFoundException('Work order not found');
    if (workOrder.status !== WoStatus.WORKING) throw new BadRequestException(`Work order must be WORKING before it can be finished; current status is ${workOrder.status}`);
    const technician = await this.prisma.user.findUnique({ where: { id: req.user.id }, select: { teamId: true, isActive: true } });
    if (!technician?.isActive || !technician.teamId || !workOrder.assignments.some((a) => a.teamId === technician.teamId)) throw new ForbiddenException('Technician is not authorized to finish this work order');
    if (!String(body.findings || '').trim()) throw new BadRequestException('Findings are required before finishing a work order');
    const evidenceTypes = new Set(execution.photos.map((p) => p.type));
    const requiredEvidenceType = finalStatus === WoStatus.COMPLETED ? 'WORK_RESULT' : finalStatus;
    if (!evidenceTypes.has(requiredEvidenceType)) throw new BadRequestException(`${requiredEvidenceType} camera evidence is required before setting status to ${finalStatus}`);
    if (body.requiresSpeedTest === true && !evidenceTypes.has('SPEEDTEST')) throw new BadRequestException('SPEEDTEST camera evidence is required for this result');

    return this.prisma.$transaction(async (tx) => {
      const finishedExecution = await tx.jobExecution.update({ where: { id: execution.id }, data: { completedAt: new Date(), findings: String(body.findings).trim(), rxPower: body.rxPower == null ? null : Number(body.rxPower), downloadMbps: body.downloadMbps == null ? null : Number(body.downloadMbps), uploadMbps: body.uploadMbps == null ? null : Number(body.uploadMbps), pingMs: body.pingMs == null ? null : Number(body.pingMs), napCodeReported: body.napCodeReported || null, portReported: body.portReported == null ? null : Number(body.portReported), status: finalStatus } });
      const updated = await tx.workOrder.update({ where: { id }, data: { status: finalStatus } });
      await tx.user.update({ where: { id: req.user.id }, data: { status: 'AVAILABLE' } });
      await tx.auditLog.create({ data: { workOrderId: id, actorId: req.user.id, action: 'WORK_ORDER_FINISHED', details: { executionId: execution.id, finalStatus, evidenceTypes: [...evidenceTypes], requiresSpeedTest: body.requiresSpeedTest === true } } });
      return { workOrder: updated, execution: finishedExecution, evidenceCount: execution.photos.length };
    });
  }

  @Get('dispatch/teams')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async dispatchTeams() { return { teams: await this.svc.listEligibleTeams() }; }

  @Post(':id/assign')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async assign(@Req() req: any, @Param('id') id: string, @Body() body: { teamId: string }) {
    if (!body.teamId) throw new BadRequestException('teamId is required');
    return this.svc.assignToTeam(id, body.teamId, req.user.id);
  }

  @Get('nearby')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async nearby(@Query('lat') lat: string, @Query('lng') lng: string, @Query('radius') radius?: string) {
    const r = radius ? parseInt(radius) : 3000;
    return this.svc.findNearbyTechnicians(parseFloat(lat), parseFloat(lng), r);
  }

  @Get('smart-next')
  @Roles(UserRole.TECHNICIAN, UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async smartNext(@Req() req: any, @Query('technicianId') techId: string, @Query('lat') lat: string, @Query('lng') lng: string) {
    const technicianId = req.user.role === UserRole.TECHNICIAN ? req.user.id : techId;
    if (!technicianId) throw new BadRequestException('technicianId is required for management requests');
    const currentLat = Number(lat); const currentLng = Number(lng);
    if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) throw new BadRequestException('Current technician latitude and longitude are required');
    return this.phase2.suggestNextJob(technicianId, currentLat, currentLng);
  }

  @Get('nap/:code/location')
  @Roles(UserRole.TECHNICIAN, UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async napLocation(@Param('code') code: string) { return this.phase2.getVerifiedLocation(code); }

  @Post('transfer')
  @Roles(UserRole.TECHNICIAN, UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async createTransfer(@Body() body: any) { return this.phase2.createTransfer(body); }

  @Get('mismatches/pending')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async pendingMismatches() {
    const data = await this.prisma.mismatch.findMany({ where: { status: 'PENDING' }, take: 50 });
    return { data, workflow: 'REPORT MISMATCH -> Supervisor Review -> Verify -> Approve/Reject' };
  }

  @Post('mismatches/:id/review')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async reviewMismatch(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.phase2.reviewMismatch(id, body.decision, req.user.id); }
}
