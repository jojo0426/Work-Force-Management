import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as ExcelJS from '@andreeewill/exceljs';

type ReportRange = 'daily' | 'weekly' | 'monthly' | 'custom';

@Injectable()
export class ReportsPhase3Service {
  constructor(private prisma: PrismaService) {}

  private resolveRange(range: ReportRange, from?: string, to?: string) {
    const endDate = new Date();
    let startDate = new Date();
    if (range === 'daily') startDate.setHours(0, 0, 0, 0);
    else if (range === 'weekly') startDate.setDate(endDate.getDate() - 7);
    else if (range === 'monthly') startDate.setMonth(endDate.getMonth() - 1);
    else if (range === 'custom') {
      if (!from || !to) throw new BadRequestException('Custom reports require both from and to dates');
      startDate = new Date(from); const customEnd = new Date(to);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(customEnd.getTime())) throw new BadRequestException('Invalid custom report date range');
      if (startDate > customEnd) throw new BadRequestException('Report from date must not be after to date');
      return { startDate, endDate: customEnd };
    }
    return { startDate, endDate };
  }

  async getSummary(range: ReportRange, from?: string, to?: string) {
    const { startDate, endDate } = this.resolveRange(range, from, to);
    const where = { createdAt: { gte: startDate, lte: endDate } };
    const [total,draft,assigned,working,onHold,completed,fbIssue,custIssue,repair,installation,transfer] = await Promise.all([
      this.prisma.workOrder.count({where}),this.prisma.workOrder.count({where:{...where,status:'DRAFT'}}),this.prisma.workOrder.count({where:{...where,status:'ASSIGNED'}}),this.prisma.workOrder.count({where:{...where,status:'WORKING'}}),this.prisma.workOrder.count({where:{...where,status:'ON_HOLD'}}),this.prisma.workOrder.count({where:{...where,status:'COMPLETED'}}),this.prisma.workOrder.count({where:{...where,status:'FB_ISSUE'}}),this.prisma.workOrder.count({where:{...where,status:'CUST_ISSUE'}}),this.prisma.workOrder.count({where:{...where,type:'REPAIR'}}),this.prisma.workOrder.count({where:{...where,type:'INSTALLATION'}}),this.prisma.workOrder.count({where:{...where,type:'TRANSFER'}}),
    ]);
    const pending=draft+assigned+working+onHold+fbIssue+custIssue;
    const completionRate=total>0?Number(((completed/total)*100).toFixed(2)):0;
    const techPerformance=await this.prisma.jobExecution.groupBy({by:['technicianId'],where:{createdAt:{gte:startDate,lte:endDate}},_count:true,_avg:{downloadMbps:true,uploadMbps:true}});
    const avgCompletion=await this.prisma.$queryRaw`SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/3600) as avg_hours FROM job_executions WHERE completed_at IS NOT NULL AND started_at IS NOT NULL AND created_at >= ${startDate} AND created_at <= ${endDate}`;
    const rawAverage=(avgCompletion as any)[0]?.avg_hours; const avgCompletionHours=rawAverage==null?0:Number(rawAverage);

    // Team reporting uses the latest assignment per work order so reassignment history cannot double-count workload.
    const [teams, periodWorkOrders, periodExecutions] = await Promise.all([
      this.prisma.team.findMany({select:{id:true,name:true,users:{where:{role:'TECHNICIAN',isActive:true},select:{id:true,status:true}}},orderBy:{name:'asc'}}),
      this.prisma.workOrder.findMany({where,select:{id:true,status:true,assignments:{select:{teamId:true,assignedAt:true},orderBy:{assignedAt:'desc'},take:1}}}),
      this.prisma.jobExecution.findMany({where:{createdAt:{gte:startDate,lte:endDate}},select:{technicianId:true,startedAt:true,completedAt:true}}),
    ]);
    const teamByTechnician=new Map<string,string>();
    for(const team of teams) for(const user of team.users) teamByTechnician.set(user.id,team.id);
    const teamPerformance=teams.map(team=>{
      const teamWos=periodWorkOrders.filter(w=>w.assignments[0]?.teamId===team.id);
      const executions=periodExecutions.filter(e=>teamByTechnician.get(e.technicianId)===team.id);
      const durations=executions.filter(e=>e.completedAt&&e.startedAt).map(e=>(e.completedAt!.getTime()-e.startedAt.getTime())/3600000);
      const count=(status:string)=>teamWos.filter(w=>w.status===status).length;
      const backlog=teamWos.filter(w=>['DRAFT','ASSIGNED','WORKING','ON_HOLD','FB_ISSUE','CUST_ISSUE'].includes(w.status)).length;
      return {teamId:team.id,teamName:team.name,workOrders:teamWos.length,completed:count('COMPLETED'),backlog,onHold:count('ON_HOLD'),fbIssue:count('FB_ISSUE'),custIssue:count('CUST_ISSUE'),activeTechnicians:team.users.length,availableTechnicians:team.users.filter(u=>u.status==='AVAILABLE').length,workingTechnicians:team.users.filter(u=>u.status==='WORKING').length,executions:executions.length,completedExecutions:durations.length,avgCompletionHours:durations.length?Number((durations.reduce((a,b)=>a+b,0)/durations.length).toFixed(2)):0};
    });
    return {range,from:startDate,to:endDate,totals:{total,draft,assigned,working,onHold,completed,pending,fbIssue,custIssue},byType:{repair,installation,transfer},performance:{techPerformance,teamPerformance,avgCompletionHours,completionRate},generatedAt:new Date()};
  }

  async exportExcel(range:string,from?:string,to?:string){
    const summary=await this.getSummary(range as ReportRange,from,to); const reportWhere={createdAt:{gte:summary.from,lte:summary.to}};
    const[wos,audit]=await Promise.all([this.prisma.workOrder.findMany({where:reportWhere,take:2000,orderBy:{createdAt:'desc'}}),this.prisma.auditLog.findMany({where:reportWhere,take:1000,orderBy:{createdAt:'desc'}})]);
    const wb=new ExcelJS.Workbook(); wb.creator='FiberBlaze WFM'; wb.created=new Date();
    const addObjectRows=(sheet:ExcelJS.Worksheet,headers:string[],rows:Array<Record<string,unknown>>)=>{sheet.addRow(headers);for(const row of rows)sheet.addRow(headers.map(h=>row[h]??''));sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>{c.width=22})};
    const summarySheet=wb.addWorksheet('Summary'); addObjectRows(summarySheet,['Metric','Value'],[{Metric:'Total WO',Value:summary.totals.total},{Metric:'Pending / Backlog',Value:summary.totals.pending},{Metric:'Draft',Value:summary.totals.draft},{Metric:'Assigned',Value:summary.totals.assigned},{Metric:'Working',Value:summary.totals.working},{Metric:'On Hold',Value:summary.totals.onHold},{Metric:'Completed',Value:summary.totals.completed},{Metric:'Completion Rate %',Value:summary.performance.completionRate},{Metric:'Average Completion Hours',Value:summary.performance.avgCompletionHours},{Metric:'FB-Issue',Value:summary.totals.fbIssue},{Metric:'CUST-Issue',Value:summary.totals.custIssue},{Metric:'Repair',Value:summary.byType.repair},{Metric:'Installation',Value:summary.byType.installation},{Metric:'Transfer',Value:summary.byType.transfer}]);
    const teamSheet=wb.addWorksheet('Team Performance'); addObjectRows(teamSheet,['Team','Work Orders','Completed','Backlog','On Hold','FB-Issue','CUST-Issue','Active Techs','Available Techs','Working Techs','Executions','Completed Executions','Avg Completion Hours'],summary.performance.teamPerformance.map(t=>({'Team':t.teamName,'Work Orders':t.workOrders,'Completed':t.completed,'Backlog':t.backlog,'On Hold':t.onHold,'FB-Issue':t.fbIssue,'CUST-Issue':t.custIssue,'Active Techs':t.activeTechnicians,'Available Techs':t.availableTechnicians,'Working Techs':t.workingTechnicians,'Executions':t.executions,'Completed Executions':t.completedExecutions,'Avg Completion Hours':t.avgCompletionHours})));
    const woSheet=wb.addWorksheet('WorkOrders');addObjectRows(woSheet,['WO Number','Type','Status','Created','Remarks'],wos.map((w:any)=>({'WO Number':w.woNumber,'Type':w.type,'Status':w.status,'Created':w.createdAt,'Remarks':w.remarks??''})));
    const auditSheet=wb.addWorksheet('AuditTrail');addObjectRows(auditSheet,['Timestamp','Action','WO ID','Actor','Details'],audit.map((a:any)=>({'Timestamp':a.createdAt,'Action':a.action,'WO ID':a.workOrderId??'','Actor':a.actorId??'','Details':JSON.stringify(a.details)})));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async exportPdfData(range:string,from?:string,to?:string){const summary=await this.getSummary(range as ReportRange,from,to);return{...summary,pdfReady:true,sections:['Daily → Weekly → Monthly → Custom Date Range','WO received, assigned, completed, backlog, ON_HOLD, FB-Issue, CUST-Issue','Technician/team performance, repair/install/transfer counts','Completion rate, completion times, locations and operational measurements']}}
}
