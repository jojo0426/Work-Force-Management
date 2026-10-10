import { WebSocketGateway, SubscribeMessage, WebSocketServer, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma.service';
import { isAllowedGpsOrigin } from './gps-origin-policy';

@WebSocketGateway({
  cors: { origin: (origin, callback) => callback(null, isAllowedGpsOrigin(origin)) },
  // CORS alone does not restrict WebSocket upgrades.
  allowRequest: (request, callback) => callback(null, isAllowedGpsOrigin(request.headers.origin)),
})
export class GpsGateway {
  @WebSocketServer() server: Server;

  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  private readonly managementRoles: UserRole[] = [UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR];

  private async authenticate(client: Socket) {
    try {
      const raw = client.handshake.auth?.token || client.handshake.headers?.authorization;
      const token = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;
      if (typeof token !== 'string' || !token) throw new Error('Missing token');

      const payload = await this.jwt.verifyAsync(token);
      if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Invalid subject');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new Error('Account unavailable');

      client.data.user = { id: user.id, role: user.role, teamId: user.teamId };
      return client.data.user;
    } catch {
      delete client.data.user;
      client.disconnect(true);
      return null;
    }
  }

  async handleConnection(client: Socket) {
    const user = await this.authenticate(client);
    if (user && this.managementRoles.includes(user.role)) await client.join('gps-management');
  }

  @SubscribeMessage('location:update')
  async handleLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { lat: number, lng: number, status?: UserStatus }
  ) {
    const user = await this.authenticate(client);
    if (!user || user.role !== UserRole.TECHNICIAN) return { received: false, error: 'Forbidden' };
    if (!payload || !Number.isFinite(payload.lat) || !Number.isFinite(payload.lng) || payload.lat < -90 || payload.lat > 90 || payload.lng < -180 || payload.lng > 180) {
      return { received: false, error: 'Invalid coordinates' };
    }

    const allowed: UserStatus[] = [UserStatus.ONLINE, UserStatus.WORKING, UserStatus.AVAILABLE];
    const status = payload.status && allowed.includes(payload.status) ? payload.status : UserStatus.ONLINE;
    const now = new Date();
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLat: payload.lat, lastLng: payload.lng, lastLocationAt: now, status } });
    await this.prisma.locationLog.create({ data: { userId: user.id, lat: payload.lat, lng: payload.lng, status, isStale: false } });

    const event = { userId: user.id, lat: payload.lat, lng: payload.lng, status, lastLocationAt: now };
    // Room membership is not continuing authorization. Recheck expiry and role
    // before each sensitive delivery, including recipients connected before revocation.
    const recipients = await this.server.in('gps-management').fetchSockets();
    await Promise.all(recipients.map(async recipient => {
      const current = await this.authenticate(recipient as unknown as Socket);
      if (current && this.managementRoles.includes(current.role)) {
        recipient.emit('technician:location', event);
      } else if (current) {
        await recipient.leave('gps-management');
      }
    }));
    return { received: true, location: event };
  }
}
