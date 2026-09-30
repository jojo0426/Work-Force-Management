import { Controller, Get, Query, Res } from '@nestjs/common';
import { ReportsPhase3Service } from './reports-phase3.service';

@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsPhase3Service) {}

  @Get('summary')
  async summary(@Query('range') range: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getSummary((range as any) || 'monthly', from, to);
  }

  @Get('export')
  async export(@Query('format') format: string, @Query('range') range: string, @Query('from') from?: string, @Query('to') to?: string, @Res() res: any) {
    if (format === 'excel' || format === 'xlsx') {
      const buf = await this.reports.exportExcel(range || 'monthly', from, to);
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="fiberblaze-report-'+range+'.xlsx"' });
      return res.send(buf);
    }
    if (format === 'pdf') {
      const data = await this.reports.exportPdfData(range || 'monthly', from, to);
      return res.json({ message: 'PDF data ready — frontend generates PDF with jsPDF or print', data });
    }
    return res.json({ error: 'Use format=excel or format=pdf' });
  }

  @Get('audit/:workOrderId')
  async auditTrail(@Query('workOrderId') workOrderId: string) {
    // 09:03 assigned, 09:27 started, 09:29 GPS, 09:42 photo, 09:51 measurement, 10:05 completed
    // Important activities should have history + who changed verified info, when, why
    return { workOrderId, message: 'Use /audit/:id endpoint from field controller for now' };
  }
}
