import { Controller, Get, Query, Param, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ReportsPhase3Service } from './reports-phase3.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
export class ReportsController {
  constructor(private reports: ReportsPhase3Service) {}

  @Get('summary')
  async summary(@Query('range') range: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getSummary((range as any) || 'monthly', from, to);
  }

  @Get('export')
  async export(@Res() res: any, @Query('format') format: string, @Query('range') range: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (format === 'excel' || format === 'xlsx') {
      const buf = await this.reports.exportExcel(range || 'monthly', from, to);
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="fiberblaze-report-'+range+'.xlsx"' });
      return res.send(buf);
    }
    if (format === 'pdf') {
      const data = await this.reports.exportPdfData(range || 'monthly', from, to);
      return res.json({ message: 'PDF data ready — frontend generates PDF with jsPDF or print', data });
    }
    return res.status(400).json({ error: 'Use format=excel or format=pdf' });
  }

  @Get('audit/:workOrderId')
  async auditTrail(@Param('workOrderId') workOrderId: string) {
    return { workOrderId, message: 'Use /audit/:id endpoint for the full work-order timeline' };
  }
}
