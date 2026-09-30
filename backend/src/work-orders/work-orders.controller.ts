import { Controller, Post, Get, Query, Param, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersPhase2Service } from './work-orders-phase2.service';
import { PrismaService } from '../prisma.service';
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private svc: WorkOrdersService, private phase2: WorkOrdersPhase2Service, private prisma: PrismaService) {}
  @Post('upload') @UseInterceptors(FileInterceptor('file')) async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { error: 'No file' };
    const result = this.svc.parseExcel(file.buffer);
    return { message: 'Excel parsed. Call /work-orders/confirm', filename: file.originalname, ...result };
  }
  @Post('confirm') async confirm(@Body() body: any) {
    const created = await this.svc.bulkCreateFromParsed(body.workOrders, body.createdBy || 'system');
    return { created: created.length, workOrders: created };
  }
  @Get() async list(@Query('status') status?: string) {
    const where: any = {}; if (status) where.status = status;
    const data = await this.prisma.workOrder.findMany({ where, take: 100, orderBy: { createdAt: 'desc' } });
    return { data };
  }
  @Get('nearby') async nearby(@Query('lat') lat: string, @Query('lng') lng: string, @Query('radius') radius?: string) {
    const r = radius ? parseInt(radius) : 3000;
    return this.svc.findNearbyTechnicians(parseFloat(lat), parseFloat(lng), r);
  }
  @Get('smart-next') async smartNext(@Query('technicianId') techId: string, @Query('lat') lat: string, @Query('lng') lng: string) {
    return this.phase2.suggestNextJob(techId || 'demo-tech-1', parseFloat(lat) || 14.2995, parseFloat(lng) || 120.9580);
  }
  @Get('nap/:code/location') async napLocation(@Param('code') code: string) { return this.phase2.getVerifiedLocation(code); }
  @Post('transfer') async createTransfer(@Body() body: any) { return this.phase2.createTransfer(body); }
  @Get('mismatches/pending') async pendingMismatches() {
    const data = await this.prisma.mismatch.findMany({ where: { status: 'PENDING' }, take: 50 });
    return { data, workflow: 'REPORT MISMATCH -> Supervisor Review -> Verify -> Approve/Reject' };
  }
  @Post('mismatches/:id/review') async reviewMismatch(@Param('id') id: string, @Body() body: any) { return this.phase2.reviewMismatch(id, body.decision, body.reviewedBy); }
}
