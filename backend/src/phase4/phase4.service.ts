import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WoStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class Phase4Service {
  constructor(private prisma:PrismaService){}

  async saveSignature(data:{workOrderId:string,executionId?:string,signatureData:string,signedByName:string,signedByContact?:string,ipAddress?:string,deviceInfo?:any,technicianId:string}){
    const signature=String(data.signatureData||'').trim(),signedByName=String(data.signedByName||'').trim();
    if(!signature||signature.length<20)throw new BadRequestException('Signature data is invalid');
    if(signature.length>1_500_000)throw new BadRequestException('Signature data is too large');
    if(!signedByName||signedByName.length>120)throw new BadRequestException('Signer name is invalid');
    const tech=await this.prisma.user.findUnique({where:{id:data.technicianId},select:{id:true,teamId:true,isActive:true}});
    if(!tech?.isActive||!tech.teamId)throw new ForbiddenException('Technician is inactive or has no team');
    const wo=await this.prisma.workOrder.findUnique({where:{id:data.workOrderId},include:{assignments:true}});
    if(!wo)throw new NotFoundException('Work order not found');
    if(wo.status!==WoStatus.WORKING)throw new BadRequestException('Customer signature can only be captured while work is active');
    if(!wo.assignments.some(a=>a.teamId===tech.teamId))throw new ForbiddenException('Work order is not assigned to your team');
    const execution=await this.prisma.jobExecution.findFirst({where:{workOrderId:data.workOrderId,technicianId:data.technicianId,completedAt:null,...(data.executionId?{id:data.executionId}:{})},orderBy:{startedAt:'desc'}});
    if(!execution)throw new ForbiddenException('No active execution belongs to this technician for the work order');
    return this.prisma.$transaction(async tx=>{
      const current=await tx.jobExecution.findUnique({where:{id:execution.id}});
      const currentWo=await tx.workOrder.findUnique({where:{id:data.workOrderId}});
      if(!current||current.completedAt||currentWo?.status!==WoStatus.WORKING)throw new BadRequestException('Work execution is no longer active');
      const existing=await tx.customerSignature.findFirst({where:{workOrderId:data.workOrderId,executionId:execution.id}});
      if(existing)return{signature:existing,idempotent:true};
      const sig=await tx.customerSignature.create({data:{workOrderId:data.workOrderId,executionId:execution.id,signatureData:signature,signedByName,signedByContact:data.signedByContact?String(data.signedByContact).trim().slice(0,80):undefined,ipAddress:data.ipAddress?String(data.ipAddress).slice(0,64):undefined,deviceInfo:data.deviceInfo||undefined,isVerified:true} as any});
      await tx.auditLog.create({data:{workOrderId:data.workOrderId,actorId:data.technicianId,action:'CUSTOMER_SIGNED',details:{signatureId:sig.id,executionId:execution.id,signedBy:signedByName,verified:true}}});
      return{signature:sig,idempotent:false};
    });
  }

  async optimizeRoute(technicianId:string,date:string){
    const routeDate=new Date(`${date}T00:00:00`);if(Number.isNaN(routeDate.getTime()))throw new BadRequestException('Invalid route date');
    const tech=await this.prisma.user.findUnique({where:{id:technicianId},select:{id:true,teamId:true,isActive:true,lastLat:true,lastLng:true}});
    if(!tech?.isActive)throw new NotFoundException('Active technician not found');if(!tech.teamId)throw new BadRequestException('Technician is not assigned to a team');
    const assignments=await this.prisma.workOrder.findMany({where:{status:WoStatus.ASSIGNED,assignments:{some:{teamId:tech.teamId}}},take:50,orderBy:[{priority:'asc'},{createdAt:'asc'}]});
    const candidates:any[]=[];
    for(const wo of assignments){if(!wo.subscriberId)continue;const sub=await this.prisma.subscriber.findUnique({where:{id:wo.subscriberId},select:{lat:true,lng:true,address:true}});if(sub?.lat==null||sub?.lng==null)continue;candidates.push({woId:wo.id,woNumber:wo.woNumber,type:wo.type,priority:wo.priority,lat:sub.lat,lng:sub.lng,address:sub.address});}
    let lat=tech.lastLat,lng=tech.lastLng;if(lat==null||lng==null){const first=candidates[0];if(first){lat=first.lat;lng=first.lng}else{lat=0;lng=0}}
    const remaining=[...candidates],stops:any[]=[];let totalDistance=0;
    while(remaining.length){let bestIndex=0,bestScore=Infinity,bestDistance=0;remaining.forEach((c,i)=>{const d=this.haversine(lat!,lng!,c.lat,c.lng),priorityWeight=Math.max(1,6-c.priority),score=d/priorityWeight;if(score<bestScore){bestScore=score;bestIndex=i;bestDistance=d}});const next=remaining.splice(bestIndex,1)[0];const estimatedMinutes=Math.max(10,Math.round(bestDistance/350)+30);stops.push({...next,distance_m:Math.round(bestDistance),estimatedMinutes});totalDistance+=bestDistance;lat=next.lat;lng=next.lng;}
    const totalDuration=stops.reduce((s,x)=>s+x.estimatedMinutes,0),located=stops.length,total=assignments.length,score=total?Math.round((located/total)*1000)/10:100;
    const route=await this.prisma.optimizedRoute.create({data:{technicianId,teamId:tech.teamId,date:routeDate,routeOrder:stops as any,totalDistanceMeters:Math.round(totalDistance),totalDurationMinutes:totalDuration,optimizationScore:score} as any});
    return{route,summary:{totalJobs:located,excludedWithoutCoordinates:total-located,totalDistance:`${(totalDistance/1000).toFixed(1)} km`,totalDuration:`${Math.floor(totalDuration/60)}h ${totalDuration%60}m`,optimization:'Deterministic nearest-neighbor + priority weighting; suggestion only, never auto-rearranges assignments',stops}};
  }

  async getAdvancedAnalytics(range:string,from?:string,to?:string){
    const allowed=['daily','weekly','monthly','custom'];if(!allowed.includes(range))throw new BadRequestException('range must be daily, weekly, monthly, or custom');
    const now=new Date(),start=from?new Date(from):new Date(now),end=to?new Date(to):now;if(!from){if(range==='daily')start.setHours(0,0,0,0);else if(range==='weekly')start.setDate(start.getDate()-7);else start.setMonth(start.getMonth()-1)}if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||start>end)throw new BadRequestException('Invalid analytics date range');end.setHours(23,59,59,999);const createdAt={gte:start,lte:end};
    const [summary,byType,executions,napHealth,alerts]=await Promise.all([this.prisma.workOrder.groupBy({by:['status'],where:{createdAt},_count:true}),this.prisma.workOrder.groupBy({by:['type'],where:{createdAt},_count:true}),this.prisma.jobExecution.findMany({where:{startedAt:createdAt,completedAt:{not:null}},select:{technicianId:true,startedAt:true,completedAt:true,downloadMbps:true,rxPower:true}}),this.prisma.napHealth.findMany({take:50,orderBy:{healthScore:'asc'}}),this.prisma.networkAlert.findMany({where:{isResolved:false},take:50,orderBy:{createdAt:'desc'}})]);
    const perf=new Map<string,{count:number,dl:number[],rx:number[]}>();let totalMinutes=0;for(const e of executions){const p=perf.get(e.technicianId)||{count:0,dl:[],rx:[]};p.count++;if(e.downloadMbps!=null)p.dl.push(e.downloadMbps);if(e.rxPower!=null)p.rx.push(e.rxPower);perf.set(e.technicianId,p);if(e.completedAt)totalMinutes+=(e.completedAt.getTime()-e.startedAt.getTime())/60000}
    const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;const technicianPerformance=[...perf.entries()].map(([technicianId,p])=>({technicianId,count:p.count,avgDownloadMbps:avg(p.dl),avgRxPower:avg(p.rx)}));const healthValues=napHealth.map(n=>n.healthScore).filter((n):n is number=>n!=null);return{range:{type:range,from:start,to:end},completion:summary,byType,technicianPerformance,avgCompletionMinutes:executions.length?totalMinutes/executions.length:0,network:{napHealth,alerts,healthScoreAvg:avg(healthValues)},trends:{source:'live filtered operational data',placeholder:false}};
  }

  async createWorkflowRule(data:{name:string,triggerEvent:string,conditionJson?:any,actionType:string,actionConfig:any}){const events=['WO_COMPLETED','FB_ISSUE','CUST_ISSUE','MISMATCH_REPORTED'],actions=['NOTIFY','ASSIGN','ESCALATE','INTEGRATE'];const name=String(data?.name||'').trim(),event=String(data?.triggerEvent||'').trim().toUpperCase(),action=String(data?.actionType||'').trim().toUpperCase();if(!name||name.length>120)throw new BadRequestException('Workflow rule name is invalid');if(!events.includes(event))throw new BadRequestException('Unsupported workflow trigger');if(!actions.includes(action))throw new BadRequestException('Unsupported workflow action');if(data.actionConfig==null||typeof data.actionConfig!=='object')throw new BadRequestException('actionConfig is required');return this.prisma.workflowRule.create({data:{name,triggerEvent:event,conditionJson:data.conditionJson||undefined,actionType:action,actionConfig:data.actionConfig} as any});}

  async triggerWorkflow(event:string,workOrderId:string){const normalized=String(event||'').trim().toUpperCase();const wo=await this.prisma.workOrder.findUnique({where:{id:workOrderId},select:{id:true,status:true}});if(!wo)throw new NotFoundException('Work order not found');const rules=await this.prisma.workflowRule.findMany({where:{triggerEvent:normalized,isActive:true}}),executions=[];for(const rule of rules){const exec=await this.prisma.workflowExecution.create({data:{ruleId:rule.id,workOrderId,status:'PENDING',result:{queued:true,actionType:rule.actionType}} as any});executions.push(exec)}return{triggered:rules.length,executions,executionMode:'queued-placeholder',externalActionsExecuted:false};}

  async getNapHealth(){const [health,alerts]=await Promise.all([this.prisma.napHealth.findMany({take:100,orderBy:{healthScore:'asc'}}),this.prisma.networkAlert.findMany({where:{isResolved:false},take:100,orderBy:{createdAt:'desc'}})]);const scores=health.map(h=>h.healthScore).filter((n):n is number=>n!=null),avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;return{health,alerts,summary:{totalNaps:health.length,avgHealth:avg,critical:alerts.filter(a=>a.severity==='CRITICAL').length},source:'persisted_network_health',placeholder:false};}

  private haversine(lat1:number,lon1:number,lat2:number,lon2:number){const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180,a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
}
