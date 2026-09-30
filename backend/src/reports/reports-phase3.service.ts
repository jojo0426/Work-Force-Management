import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

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

    // Technician performance
    const techPerformance = await this.prisma.jobExecution.groupBy({
      by: ['technicianId'],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: true,
      _avg: { downloadMbps: true, uploadMbps: true }
    });

    // Average completion time from audit logs
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

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: 'Total WO', Value: summary.totals.total },
      { Metric: 'Completed', Value: summary.totals.completed },
      { Metric: 'FB-Issue', Value: summary.totals.fbIssue },
      { Metric: 'CUST-Issue', Value: summary.totals.custIssue },
      { Metric: 'Repair', Value: summary.byType.repair },
      { Metric: 'Installation', Value: summary.byType.installation },
      { Metric: 'Transfer', Value: summary.byType.transfer },
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Sheet 2: Work Orders
    const woSheet = XLSX.utils.json_to_sheet(wos.map((w:any)=>({
      'WO Number': w.woNumber,
      'Type': w.type,
      'Status': w.status,
      'Created': w.createdAt,
      'Remarks': w.remarks
    })));
    XLSX.utils.book_append_sheet(wb, woSheet, 'WorkOrders');

    // Sheet 3: Audit Trail
    const auditSheet = XLSX.utils.json_to_sheet(audit.map((a:any)=>({
      'Timestamp': a.createdAt,
      'Action': a.action,
      'WO ID': a.workOrderId,
      'Actor': a.actorId,
      'Details': JSON.stringify(a.details)
    })));
    XLSX.utils.book_append_sheet(wb, auditSheet, 'AuditTrail');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  async exportPdfData(range: string, from?: string, to?: string) {
    // For Phase 3: return data for PDF generation (frontend will use jsPDF or backend uses PDFKit)
    // Here we return structured data that frontend can print
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
