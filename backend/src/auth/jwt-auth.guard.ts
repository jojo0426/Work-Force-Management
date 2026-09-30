import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    const [scheme, token] = typeof authHeader === 'string' ? authHeader.split(' ') : [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.jwt.verifyAsync(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException('Account unavailable');

      request.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        teamId: user.teamId
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
