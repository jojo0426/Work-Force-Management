import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as ExcelJS from '@andreeewill/exceljs';

@Injectable()
export class ReportsPhase3Service {
  constructor(private prisma: PrismaService) {}

  // Reporting: Daily -> Weekly -> Monthly -> Custom Date Range
  // Includes WO received, assigned, completed, pending, FB-Issue, CUST-Issue, performance, counts, locations, completion times
  async getSummary(range: 'daily'|'weekly'|'monthly'|'custom', from?: string, to?: string) {
    let startDate: Date, endDate: Date = new Date();

    if (range === 'daily') {
      startDate = new Date(); startDate.setHours(0,0,0,0);
    } else if (range === 'weekly') {
      startDate = new Date(); startDate.setDate(endDate.getDate() - 7);
    } else if (range === 'monthly') {
      startDate = new Date(); startDate.setMonth(endDate.getMonth() - 1);
    } else if (range === 'custom' && from && to) {
      startDate = new Date(from); endDate = new Date(to);
    } else {
      startDate = new Date('2020-01-01');
    }

    const where = { createdAt: { gte: startDate, lte: endDate } };

    const [total, assigned, working, completed, fbIssue, custIssue, repair, installation, transfer] = await Promise.all([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.count({ where: { ...where, status: 'ASSIGNED' } }),
      this.prisma.workOrder.count({ where: { ...where, status: 'WORKING' } }),
      this.prisma.workOrder.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.workOrder.count({ where: { ...where, status: 'FB_ISSUE' } }),
      this.prisma.workOrder.count({ where: { ...where, status: 'CUST_ISSUE' } }),
      this.prisma.workOrder.count({ where: { ...where, type: 'REPAIR' } }),
      this.prisma.workOrder.count({ where: { ...where, type: 'INSTALLATION' } }),
      this.prisma.workOrder.count({ where: { ...where, type: 'TRANSFER' } }),
    ]);

    const techPerformance = await this.prisma.jobExecution.groupBy({
      by: ['technicianId'],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: true,
      _avg: { downloadMbps: true, uploadMbps: true }
    });

    const avgCompletion = await this.prisma.$queryRaw`
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/3600) as avg_hours
      FROM job_executions WHERE completed_at IS NOT NULL AND created_at >= ${startDate} AND created_at <= ${endDate}
    `;

    return {
      range, from: startDate, to: endDate,
      totals: { total, assigned, working, completed, pending: assigned+working, fbIssue, custIssue },
      byType: { repair, installation, transfer },
      performance: { techPerformance, avgCompletionHours: (avgCompletion as any)[0]?.avg_hours || 0 },
      generatedAt: new Date()
    };
  }

  // Output: On-screen Dashboard, Excel, PDF, Print
  async exportExcel(range: string, from?: string, to?: string) {
    const summary = await this.getSummary(range as any, from, to);
    const wos = await this.prisma.workOrder.findMany({ take: 2000, orderBy: { createdAt: 'desc' } });
    const audit = await this.prisma.auditLog.findMany({ take: 1000, orderBy: { createdAt: 'desc' } });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FiberBlaze WFM';
    wb.created = new Date();

    const addObjectRows = (sheet: ExcelJS.Worksheet, headers: string[], rows: Array<Record<string, unknown>>) => {
      sheet.addRow(headers);
      for (const row of rows) sheet.addRow(headers.map(header => row[header] ?? ''));
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach(column => { column.width = 22; });
    };

    const summarySheet = wb.addWorksheet('Summary');
    addObjectRows(summarySheet, ['Metric', 'Value'], [
      { Metric: 'Total WO', Value: summary.totals.total },
      { Metric: 'Completed', Value: summary.totals.completed },
      { Metric: 'FB-Issue', Value: summary.totals.fbIssue },
      { Metric: 'CUST-Issue', Value: summary.totals.custIssue },
      { Metric: 'Repair', Value: summary.byType.repair },
      { Metric: 'Installation', Value: summary.byType.installation },
      { Metric: 'Transfer', Value: summary.byType.transfer },
    ]);

    const woSheet = wb.addWorksheet('WorkOrders');
    addObjectRows(woSheet, ['WO Number', 'Type', 'Status', 'Created', 'Remarks'], wos.map((w:any)=>({
      'WO Number': w.woNumber,
      'Type': w.type,
      'Status': w.status,
      'Created': w.createdAt,
      'Remarks': w.remarks ?? ''
    })));

    const auditSheet = wb.addWorksheet('AuditTrail');
    addObjectRows(auditSheet, ['Timestamp', 'Action', 'WO ID', 'Actor', 'Details'], audit.map((a:any)=>({
      'Timestamp': a.createdAt,
      'Action': a.action,
      'WO ID': a.workOrderId ?? '',
      'Actor': a.actorId ?? '',
      'Details': JSON.stringify(a.details)
    })));

    const output = await wb.xlsx.writeBuffer();
    return Buffer.from(output);
  }

  async exportPdfData(range: string, from?: string, to?: string) {
    const summary = await this.getSummary(range as any, from, to);
    return {
      ...summary,
      pdfReady: true,
      sections: [
        'Daily → Weekly → Monthly → Custom Date Range',
        'WO received, assigned, completed, pending, FB-Issue, CUST-Issue',
        'Technician/team performance, repair/install/transfer counts',
        'Locations, completion times, operational measurements'
      ]
    };
  }
}
