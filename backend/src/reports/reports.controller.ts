import { Controller, Get, Query, Res } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as XLSX from 'xlsx';

@Controller('reports')
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  @Get('summary')
  async summary(@Query('range') range: string, @Query('from') from?: string, @Query('to') to?: string) {
    const total = await this.prisma.workOrder.count();
    const completed = await this.prisma.workOrder.count({ where: { status: 'COMPLETED' } });
    const fbIssue = await this.prisma.workOrder.count({ where: { status: 'FB_ISSUE' } });
    const custIssue = await this.prisma.workOrder.count({ where: { status: 'CUST_ISSUE' } });
    const assigned = await this.prisma.workOrder.count({ where: { status: 'ASSIGNED' } });
    const working = await this.prisma.workOrder.count({ where: { status: 'WORKING' } });
    const repair = await this.prisma.workOrder.count({ where: { type: 'REPAIR' } });
    const install = await this.prisma.workOrder.count({ where: { type: 'INSTALLATION' } });
    const transfer = await this.prisma.workOrder.count({ where: { type: 'TRANSFER' } });

    return {
      range: range || 'all',
      totals: { total, completed, fbIssue, custIssue, assigned, working },
      byType: { repair, install, transfer },
      generatedAt: new Date()
    };
  }

  @Get('export')
  async exportExcel(@Query('format') format: string, @Res() res: any) {
    const wos = await this.prisma.workOrder.findMany({ take: 1000 });
    if (format === 'excel') {
      const ws = XLSX.utils.json_to_sheet(wos.map(w => ({
        'WO Number': w.woNumber,
        'Type': w.type,
        'Status': w.status,
        'Created': w.createdAt
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'WorkOrders');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="fiberblaze-report.xlsx"' });
      return res.send(buf);
    }
    return res.json({ message: 'Use format=excel for now. PDF coming Phase 3.' });
  }
}
