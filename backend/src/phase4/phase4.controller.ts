import { BadRequestException, Controller, Get, Post, Body, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Phase4Service } from './phase4.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('phase4')
@UseGuards(JwtAuthGuard, RolesGuard)
export class Phase4Controller {
  constructor(private phase4: Phase4Service) {}

  @Post('signature')
  @Roles(UserRole.TECHNICIAN)
  async saveSignature(@Req() req:any,@Body() body:any){
    if(!body.workOrderId||!body.signatureData||!String(body.signedByName||'').trim())throw new BadRequestException('Work order, signature, and signer name are required');
    return this.phase4.saveSignature({...body,technicianId:req.user.id});
  }

  @Get('route/optimize')
  @Roles(UserRole.TECHNICIAN,UserRole.JOB_CONTROLLER,UserRole.SUPERVISOR,UserRole.ADMINISTRATOR)
  async optimizeRoute(@Req() req:any,@Query('technicianId') techId:string,@Query('date') date:string){
    const technicianId=req.user.role===UserRole.TECHNICIAN?req.user.id:techId;
    if(!technicianId)throw new ForbiddenException('Technician is required');
    return this.phase4.optimizeRoute(technicianId,date||new Date().toISOString().split('T')[0]);
  }

  @Get('analytics/advanced')
  @Roles(UserRole.JOB_CONTROLLER,UserRole.SUPERVISOR,UserRole.ADMINISTRATOR)
  async advancedAnalytics(@Query('range') range:string,@Query('from') from?:string,@Query('to') to?:string){return this.phase4.getAdvancedAnalytics(range||'monthly',from,to);}

  @Post('workflows/rules')
  @Roles(UserRole.SUPERVISOR,UserRole.ADMINISTRATOR)
  async createRule(@Body() body:any){return this.phase4.createWorkflowRule(body);}

  @Post('workflows/trigger')
  @Roles(UserRole.JOB_CONTROLLER,UserRole.SUPERVISOR,UserRole.ADMINISTRATOR)
  async trigger(@Body() body:{event:string,workOrderId:string}){if(!body?.event||!body?.workOrderId)throw new BadRequestException('event and workOrderId are required');return this.phase4.triggerWorkflow(body.event,body.workOrderId);}

  @Get('network/health')
  @Roles(UserRole.JOB_CONTROLLER,UserRole.SUPERVISOR,UserRole.ADMINISTRATOR)
  async napHealth(){return this.phase4.getNapHealth();}
}
