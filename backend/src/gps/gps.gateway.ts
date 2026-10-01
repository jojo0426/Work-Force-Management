import { WebSocketGateway, SubscribeMessage, WebSocketServer, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma.service';

@WebSocketGateway({ cors: true })
export class GpsGateway {
  @WebSocketServer() server: Server;

  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    try {
      const raw = client.handshake.auth?.token || client.handshake.headers?.authorization;
      const token = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;
      if (!token) return client.disconnect(true);

      const payload = await this.jwt.verifyAsync(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) return client.disconnect(true);

      client.data.user = { id: user.id, role: user.role, teamId: user.teamId };
      const managementRoles: UserRole[] = [UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR];
      if (managementRoles.includes(user.role)) {
        await client.join('gps-management');
      }
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('location:update')
  async handleLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { lat: number, lng: number, status?: UserStatus }
  ) {
    const user = client.data.user;
    if (!user || user.role !== UserRole.TECHNICIAN) return { received: false, error: 'Forbidden' };
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng) || payload.lat < -90 || payload.lat > 90 || payload.lng < -180 || payload.lng > 180) {
      return { received: false, error: 'Invalid coordinates' };
    }

    const status = payload.status && Object.values(UserStatus).includes(payload.status) ? payload.status : UserStatus.ONLINE;
    const now = new Date();
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLat: payload.lat, lastLng: payload.lng, lastLocationAt: now, status } });
    await this.prisma.locationLog.create({ data: { userId: user.id, lat: payload.lat, lng: payload.lng, status, isStale: false } });

    const event = { userId: user.id, lat: payload.lat, lng: payload.lng, status, lastLocationAt: now };
    this.server.to('gps-management').emit('technician:location', event);
    return { received: true, location: event };
  }
}
