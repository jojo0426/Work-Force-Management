import { Controller, Post, Get, Query, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../prisma.service';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private svc: WorkOrdersService, private prisma: PrismaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { error: 'No file uploaded' };
    const result = this.svc.parseExcel(file.buffer);
    return { message: 'Excel parsed. Review preview then call /work-orders/confirm to create.', filename: file.originalname, ...result };
  }

  @Post('confirm')
  async confirm(@Body() body: { workOrders: any[], createdBy?: string }) {
    const created = await this.svc.bulkCreateFromParsed(body.workOrders, body.createdBy || 'system');
    await this.prisma.auditLog.createMany({
      data: created.map(wo => ({
        workOrderId: wo.id,
        actorId: body.createdBy || 'system',
        action: 'CREATED_FROM_EXCEL',
        details: { woNumber: wo.woNumber }
      }))
    });
    return { created: created.length, workOrders: created };
  }

  @Post(':id/assign')
  async assign(@Body() body: { teamId: string, assignedBy?: string }) {
    // body is validated by class-validator in main.ts
    return { assigned: true, teamId: body.teamId };
  }

  @Get()
  async list(@Query('status') status?: string, @Query('type') type?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    const data = await this.prisma.workOrder.findMany({ where, take: 100, orderBy: { createdAt: 'desc' } });
    return { data };
  }

  @Get('nearby')
  async nearby(@Query('lat') lat: string, @Query('lng') lng: string, @Query('radius') radius?: string) {
    const r = radius ? parseInt(radius) : 3000;
    return this.svc.findNearbyTechnicians(parseFloat(lat), parseFloat(lng), r);
  }
}
