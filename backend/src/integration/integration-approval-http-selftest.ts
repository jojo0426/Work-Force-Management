import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IntegrationApprovalController } from './integration-approval.controller';
import { IntegrationApprovalLedgerService } from './integration-approval-ledger.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
const recorded: any[] = [];
const users: Record<string, any> = {
  supervisor: { id: 'supervisor', role: 'SUPERVISOR', isActive: true },
  technician: { id: 'technician', role: 'TECHNICIAN', isActive: true },
};
@Module({
  controllers: [IntegrationApprovalController],
  providers: [
    JwtAuthGuard, RolesGuard, Reflector,
    { provide: JwtService, useValue: {
      verifyAsync: async (token: string) => {
        if (!['supervisor', 'technician'].includes(token)) throw new Error('invalid token');
        return { sub: token };
      },
    } },
    { provide: PrismaService, useValue: {
      user: { findUnique: async ({ where }: any) => users[where.id] || null },
    } },
    { provide: IntegrationApprovalLedgerService, useValue: {
      record: async (...args: any[]) => { recorded.push(args); return true; },
    } },
  ],
})
class ApprovalHttpFixture {}

async function main(): Promise<void> {
  const app = await NestFactory.create(ApprovalHttpFixture, { logger: false });
  await app.listen(0, '127.0.0.1');
  try {
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('missing local port');
    const endpoint = 'http://127.0.0.1:' + address.port +
      '/integration/reconciliation-approval/propose';
    const body = JSON.stringify({
      admissionId: 'synthetic-admission', evidenceId: 'synthetic-evidence',
      operatorId: 'forged-actor',
    });
    const send = (token?: string) => fetch(endpoint, {
      method: 'POST', headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      }, body,
    });
    check('HTTP missing JWT rejected', (await send()).status === 401);
    check('HTTP technician denied', (await send('technician')).status === 403);
    const response = await send('supervisor');
    check('HTTP authenticated supervisor accepted', response.status === 201 &&
      (await response.json()).recorded === true);
    check('actor bound to verified token, not forged body',
      recorded.length === 1 &&
      recorded[0][0].userId === 'supervisor' &&
      /^[a-f0-9]{64}$/.test(recorded[0][0].sessionHash));
    console.log('Phase 5E.2U authenticated HTTP fixture passed (synthetic tokens).');
  } finally {
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
