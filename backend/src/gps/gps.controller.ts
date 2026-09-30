import { Controller, Get, Post, Body } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('gps')
export class GpsController {
  constructor(private prisma: PrismaService) {}

  @Get('technicians/locations')
  async locations() {
    const users = await this.prisma.user.findMany({ where: { role: 'TECHNICIAN' } });
    return { technicians: users.map(u => ({
      id: u.id, name: u.name, status: u.status, lat: u.lastLat, lng: u.lastLng,
      lastLocationAt: u.lastLocationAt,
      isStale: u.lastLocationAt ? (Date.now() - new Date(u.lastLocationAt).getTime()) > 5*60*1000 : true
    })) };
  }

  @Post('location/update')
  async update(@Body() body: { userId: string, lat: number, lng: number, status?: string }) {
    const updated = await this.prisma.user.update({
      where: { id: body.userId },
      data: { lastLat: body.lat, lastLng: body.lng, lastLocationAt: new Date(), status: (body.status as any) || 'ONLINE' }
    });
    await this.prisma.locationLog.create({ data: { userId: body.userId, lat: body.lat, lng: body.lng, status: (body.status as any) || 'ONLINE' } });
    return { updated: true, user: updated };
  }
}
