import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    // For Phase 1 demo: allow any email, auto-create user if not exists
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          role: email.includes('supervisor') ? 'SUPERVISOR' : email.includes('controller') ? 'JOB_CONTROLLER' : 'TECHNICIAN',
          passwordHash: await bcrypt.hash(password || 'fiberblaze123', 10)
        }
      });
    }
    const token = this.jwt.sign({ sub: user.id, role: user.role, email: user.email });
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  }
}
