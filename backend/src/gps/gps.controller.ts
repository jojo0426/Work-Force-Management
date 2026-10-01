import { BadRequestException, Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const FRESH_MS=2*60*1000,STALE_MS=5*60*1000;
@Controller('gps')
@UseGuards(JwtAuthGuard,RolesGuard)
export class GpsController{
 constructor(private prisma:PrismaService){}
 @Get('technicians/locations') @Roles(UserRole.JOB_CONTROLLER,UserRole.SUPERVISOR,UserRole.ADMINISTRATOR)
 async locations(){const now=Date.now();const users=await this.prisma.user.findMany({where:{role:UserRole.TECHNICIAN,isActive:true},select:{id:true,name:true,status:true,lastLat:true,lastLng:true,lastLocationAt:true,teamId:true}});return{freshWithinSeconds:FRESH_MS/1000,staleAfterSeconds:STALE_MS/1000,technicians:users.map(u=>{const age=u.lastLocationAt?now-new Date(u.lastLocationAt).getTime():null;return{id:u.id,name:u.name,teamId:u.teamId,status:u.status,lat:u.lastLat,lng:u.lastLng,lastLocationAt:u.lastLocationAt,locationAgeSeconds:age==null?null:Math.max(0,Math.round(age/1000)),isFresh:age!=null&&age<=FRESH_MS,isStale:age==null||age>STALE_MS,canUseForProximity:u.lastLat!=null&&u.lastLng!=null&&age!=null&&age<=STALE_MS&&u.status!==UserStatus.OFFLINE}})}}
 @Post('location/update') @Roles(UserRole.TECHNICIAN)
 async update(@Req() req:any,@Body() body:{lat:number,lng:number,status?:UserStatus}){if(!Number.isFinite(body.lat)||!Number.isFinite(body.lng)||body.lat < -90||body.lat > 90||body.lng < -180||body.lng > 180)throw new BadRequestException('Valid latitude and longitude are required');const allowed=[UserStatus.ONLINE,UserStatus.WORKING,UserStatus.AVAILABLE];const status=body.status&&allowed.includes(body.status)?body.status:UserStatus.ONLINE;const now=new Date();const updated=await this.prisma.user.update({where:{id:req.user.id},data:{lastLat:body.lat,lastLng:body.lng,lastLocationAt:now,status}});await this.prisma.locationLog.create({data:{userId:req.user.id,lat:body.lat,lng:body.lng,status,isStale:false}});return{updated:true,location:{lat:updated.lastLat,lng:updated.lastLng,status:updated.status,lastLocationAt:updated.lastLocationAt}}}
 @Post('location/offline') @Roles(UserRole.TECHNICIAN)
 async offline(@Req() req:any){const updated=await this.prisma.user.update({where:{id:req.user.id},data:{status:UserStatus.OFFLINE}});await this.prisma.auditLog.create({data:{actorId:req.user.id,action:'TECHNICIAN_LOCATION_SESSION_ENDED',details:{lastLocationAt:updated.lastLocationAt,coordinatesRetainedForAudit:true,excludedFromProximity:true}}});return{updated:true,status:updated.status,lastLocationAt:updated.lastLocationAt}}
}
