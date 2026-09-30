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
    const data = await this.prisma.workOrder.findMany({
      where,
      include: { assignments: true },
      take: 100,
      orderBy: { createdAt: 'desc' }
    });
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
    const currentLat = Number(lat);
    const currentLng = Number(lng);
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
