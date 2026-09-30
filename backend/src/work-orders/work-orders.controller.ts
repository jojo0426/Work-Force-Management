import { BadRequestException, Controller, Post, Get, Query, Param, Body, UploadedFile, UseInterceptors, UseGuards, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
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
  async importPreview(@Body() body: any) {
    return this.svc.prepareImportPreview(body.workOrders);
  }

  @Post('confirm')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async confirm(@Body() body: any, @Req() req: any) {
    if (!Array.isArray(body.workOrders)) throw new BadRequestException('workOrders must be an array');
    const result = await this.svc.bulkCreateFromParsed(body.workOrders, req.user.id);
    return { message: 'Excel import confirmation processed', ...result };
  }

  @Get()
  @Roles(UserRole.TECHNICIAN, UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async list(@Query('status') status?: string) {
    const where: any = {}; if (status) where.status = status;
    const data = await this.prisma.workOrder.findMany({ where, take: 100, orderBy: { createdAt: 'desc' } });
    return { data };
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
  async reviewMismatch(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.phase2.reviewMismatch(id, body.decision, req.user.id);
  }
}
