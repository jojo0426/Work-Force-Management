import { BadRequestException, Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('gps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GpsController {
  constructor(private prisma: PrismaService) {}

  @Get('technicians/locations')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async locations() {
    const users = await this.prisma.user.findMany({
      where: { role: UserRole.TECHNICIAN, isActive: true },
      select: { id: true, name: true, status: true, lastLat: true, lastLng: true, lastLocationAt: true, teamId: true }
    });
    return { technicians: users.map(u => ({
      id: u.id,
      name: u.name,
      teamId: u.teamId,
      status: u.status,
      lat: u.lastLat,
      lng: u.lastLng,
      lastLocationAt: u.lastLocationAt,
      isStale: u.lastLocationAt ? (Date.now() - new Date(u.lastLocationAt).getTime()) > 5 * 60 * 1000 : true
    })) };
  }

  @Post('location/update')
  @Roles(UserRole.TECHNICIAN)
  async update(@Req() req: any, @Body() body: { lat: number, lng: number, status?: UserStatus }) {
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng) || body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
      throw new BadRequestException('Valid latitude and longitude are required');
    }
    const status = body.status && Object.values(UserStatus).includes(body.status) ? body.status : UserStatus.ONLINE;
    const updated = await this.prisma.user.update({
      where: { id: req.user.id },
      data: { lastLat: body.lat, lastLng: body.lng, lastLocationAt: new Date(), status }
    });
    await this.prisma.locationLog.create({ data: { userId: req.user.id, lat: body.lat, lng: body.lng, status } });
    return { updated: true, location: { lat: updated.lastLat, lng: updated.lastLng, status: updated.status, lastLocationAt: updated.lastLocationAt } };
  }
}
