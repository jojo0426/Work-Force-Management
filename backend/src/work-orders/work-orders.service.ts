import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, WoStatus } from '@prisma/client';
import * as ExcelJS from '@andreeewill/exceljs';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WorkOrdersService {
  constructor(private prisma: PrismaService) {}

  async parseExcel(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS currently declares its input Buffer against an older Node Buffer generic.
    // The runtime value from Multer is valid; isolate the compatibility cast here.
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('Excel workbook does not contain a worksheet');
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = String(cell.text || cell.value || '').trim().toUpperCase();
    });
    const rows: any[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, any> = {};
      let hasValue = false;
      headers.forEach((header, colNumber) => {
        if (!header || colNumber === 0) return;
        const cell = row.getCell(colNumber);
        const value = cell.text || (cell.value == null ? '' : String(cell.value));
        if (String(value).trim()) hasValue = true;
        record[header] = value;
      });
      if (hasValue) rows.push(record);
    });
    const requiredColumns=['ACCOUNT NUMBER','NAME','ADDRESS','CONTACT NUMBER','PLAN','JOB ORDER'];
    const actualColumns=headers.filter(Boolean);
    const missingColumns=requiredColumns.filter(c=>!actualColumns.includes(c));
    if(missingColumns.length)return{total:rows.length,valid:0,invalid:rows.length,requiredColumns,missingColumns,templateValid:false,preview:[],all:[]};
    const parsed=rows.map((r,idx)=>{const errors:string[]=[];const p:any={row:idx+2,accountNumber:String(r['ACCOUNT NUMBER']??'').trim(),name:String(r['NAME']??'').trim(),address:String(r['ADDRESS']??'').trim(),contactNumber:String(r['CONTACT NUMBER']??'').trim(),plan:String(r['PLAN']??'').trim(),jobOrder:String(r['JOB ORDER']??'').trim(),errors};if(!p.accountNumber)errors.push('Missing account number');if(!p.name)errors.push('Missing name');if(!p.address)errors.push('Missing address');if(!p.contactNumber)errors.push('Missing contact number');if(!p.plan)errors.push('Missing plan');if(!p.jobOrder)errors.push('Missing job order');p.valid=!errors.length;return p;});
    const ac=new Map<string,number>(),jc=new Map<string,number>();for(const p of parsed){if(p.accountNumber)ac.set(p.accountNumber,(ac.get(p.accountNumber)||0)+1);if(p.jobOrder)jc.set(p.jobOrder,(jc.get(p.jobOrder)||0)+1);}for(const p of parsed){if(p.accountNumber&&(ac.get(p.accountNumber)||0)>1)p.errors.push('Duplicate account number in uploaded file');if(p.jobOrder&&(jc.get(p.jobOrder)||0)>1)p.errors.push('Duplicate job order in uploaded file');p.valid=!p.errors.length;}const valid=parsed.filter(p=>p.valid).length;return{total:rows.length,valid,invalid:rows.length-valid,requiredColumns,missingColumns:[],templateValid:true,preview:parsed.slice(0,50),all:parsed};
  }
  async prepareImportPreview(parsed:any[]){if(!Array.isArray(parsed))throw new BadRequestException('workOrders must be an array');const validRows=parsed.filter(p=>p.valid);const jobOrders:string[]=[...new Set<string>(validRows.map(p=>String(p.jobOrder||'')).filter(Boolean))],accountNumbers:string[]=[...new Set<string>(validRows.map(p=>String(p.accountNumber||'')).filter(Boolean))];const[existingWorkOrders,existingSubscribers]=await Promise.all([jobOrders.length?this.prisma.workOrder.findMany({where:{woNumber:{in:jobOrders}},select:{id:true,woNumber:true,status:true}}):[],accountNumbers.length?this.prisma.subscriber.findMany({where:{accountNumber:{in:accountNumbers}},select:{id:true,accountNumber:true,name:true}}):[]]);const wm=new Map(existingWorkOrders.map(wo=>[wo.woNumber,wo] as const)),sm=new Map(existingSubscribers.map(s=>[s.accountNumber,s] as const));const rows=parsed.map(p=>{const ew=p.jobOrder?wm.get(String(p.jobOrder)):undefined,es=p.accountNumber?sm.get(String(p.accountNumber)):undefined;const action=!p.valid?'INVALID':ew?'SKIP_DUPLICATE_JOB_ORDER':es?'UPDATE_SUBSCRIBER_AND_CREATE_WORK_ORDER':'CREATE_SUBSCRIBER_AND_WORK_ORDER';return{...p,action,existingWorkOrder:ew||null,existingSubscriber:es||null};});return{summary:{totalRows:rows.length,invalidRows:rows.filter(r=>r.action==='INVALID').length,duplicateJobOrders:rows.filter(r=>r.action==='SKIP_DUPLICATE_JOB_ORDER').length,subscribersToUpdate:rows.filter(r=>r.action==='UPDATE_SUBSCRIBER_AND_CREATE_WORK_ORDER').length,subscribersToCreate:rows.filter(r=>r.action==='CREATE_SUBSCRIBER_AND_WORK_ORDER').length,workOrdersToCreate:rows.filter(r=>r.action==='UPDATE_SUBSCRIBER_AND_CREATE_WORK_ORDER'||r.action==='CREATE_SUBSCRIBER_AND_WORK_ORDER').length},rows};}

  async bulkCreateFromParsed(parsed:any[],createdBy:string){
    const preview=await this.prepareImportPreview(parsed),eligible=preview.rows.filter(p=>p.action==='UPDATE_SUBSCRIBER_AND_CREATE_WORK_ORDER'||p.action==='CREATE_SUBSCRIBER_AND_WORK_ORDER'),results:any[]=[];
    for(const p of eligible){
      try{
        const result=await this.prisma.$transaction(async tx=>{
          const existingWo=await tx.workOrder.findUnique({where:{woNumber:p.jobOrder}});
          if(existingWo)return{skipped:true,reason:'JOB_ORDER_ALREADY_EXISTS',workOrder:existingWo};
          const sub=await tx.subscriber.upsert({where:{accountNumber:p.accountNumber},create:{accountNumber:p.accountNumber,name:p.name,address:p.address,contactNumber:p.contactNumber,plan:p.plan},update:{name:p.name,address:p.address,contactNumber:p.contactNumber,plan:p.plan}});
          try{
            const wo=await tx.workOrder.create({data:{woNumber:p.jobOrder,type:'REPAIR',status:'DRAFT',subscriberId:sub.id,createdBy}});
            await tx.auditLog.create({data:{workOrderId:wo.id,actorId:createdBy,action:'WORK_ORDER_IMPORTED',details:{accountNumber:p.accountNumber,source:'EXCEL_IMPORT',row:p.row,atomicImport:true}}});
            return{skipped:false,workOrder:wo};
          }catch(e:any){
            if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002'){
              const winner=await tx.workOrder.findUnique({where:{woNumber:p.jobOrder}});
              if(winner)return{skipped:true,reason:'JOB_ORDER_ALREADY_EXISTS',workOrder:winner};
            }
            throw e;
          }
        });
        results.push(result);
      }catch(e:any){
        const error={skipped:true,failed:true,reason:'IMPORT_ROW_FAILED',row:p.row,jobOrder:p.jobOrder,accountNumber:p.accountNumber,error:e?.message||'Unknown import error'};
        results.push(error);
        try{await this.prisma.auditLog.create({data:{actorId:createdBy,action:'WORK_ORDER_IMPORT_FAILED',details:{row:p.row,jobOrder:p.jobOrder,accountNumber:p.accountNumber,error:error.error,source:'EXCEL_IMPORT'}}});}catch(auditError){console.error('Failed to audit Excel import error',p.jobOrder,auditError);}
      }
    }
    const created=results.filter(r=>!r.skipped).length,concurrentOrExisting=results.filter(r=>r.skipped&&!r.failed).length,failed=results.filter(r=>r.failed).length;
    return{previewSummary:preview.summary,created,skipped:preview.summary.duplicateJobOrders+concurrentOrExisting,failed,invalid:preview.summary.invalidRows,results};
  }

  async listEligibleTeams(){const teams=await this.prisma.team.findMany({orderBy:{name:'asc'},include:{users:{where:{role:UserRole.TECHNICIAN,isActive:true},select:{id:true,name:true,status:true,lastLat:true,lastLng:true,lastLocationAt:true}}}});return teams.map(team=>({id:team.id,name:team.name,activeTechnicians:team.users.length,technicians:team.users}));}
  async assignToTeam(workOrderId:string,teamId:string,assignedBy:string){const team=await this.prisma.team.findUnique({where:{id:teamId},include:{users:{where:{role:UserRole.TECHNICIAN,isActive:true},select:{id:true}}}});if(!team)throw new NotFoundException('Team not found');if(!team.users.length)throw new BadRequestException('Selected team has no active technicians');return this.prisma.$transaction(async tx=>{const wo=await tx.workOrder.findUnique({where:{id:workOrderId}});if(!wo)throw new NotFoundException('Work order not found');const assignableStatuses:WoStatus[]=[WoStatus.DRAFT,WoStatus.ASSIGNED];if(!assignableStatuses.includes(wo.status))throw new BadRequestException(`Cannot assign a ${wo.status.toLowerCase()} work order`);if(await tx.jobExecution.findFirst({where:{workOrderId,completedAt:null}}))throw new BadRequestException('Cannot change assignment while a work execution is active');const current=await tx.assignment.findMany({where:{workOrderId},orderBy:{assignedAt:'asc'}}),currentTeamIds=current.map(a=>a.teamId);if(wo.status===WoStatus.ASSIGNED&&currentTeamIds.length===1&&currentTeamIds[0]===teamId)return{assignment:current[0],workOrder:wo,idempotent:true};const claimed=await tx.workOrder.updateMany({where:{id:workOrderId,status:wo.status},data:{status:WoStatus.ASSIGNED}});if(claimed.count!==1)throw new BadRequestException('Work order assignment changed by another request');await tx.assignment.deleteMany({where:{workOrderId}});const assignment=await tx.assignment.create({data:{workOrderId,teamId,assignedBy}});await tx.auditLog.create({data:{workOrderId,actorId:assignedBy,action:current.length?'WORK_ORDER_REASSIGNED':'WORK_ORDER_ASSIGNED',details:{teamId,previousTeamIds:currentTeamIds,previousStatus:wo.status,atomicAssignmentClaim:true}}});return{assignment,workOrder:{...wo,status:WoStatus.ASSIGNED},idempotent:false,atomicAssignmentClaim:true};});}
  async findNearbyTechnicians(lat:number,lng:number,radiusMeters=3000){if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new BadRequestException('Valid latitude and longitude are required');const techs=await this.prisma.user.findMany({where:{role:UserRole.TECHNICIAN,isActive:true},take:100});return techs.filter(t=>t.lastLat!=null&&t.lastLng!=null).map(t=>{const distance=this.haversine(lat,lng,t.lastLat!,t.lastLng!);return{id:t.id,name:t.name,team:t.teamId,status:t.status,distance_m:Math.round(distance),lastLocationAt:t.lastLocationAt,isStale:t.lastLocationAt?Date.now()-new Date(t.lastLocationAt).getTime()>5*60*1000:true};}).filter(t=>t.distance_m<=radiusMeters).sort((a,b)=>a.distance_m-b.distance_m);}
  haversine(lat1:number,lon1:number,lat2:number,lon2:number){const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180,a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
}
