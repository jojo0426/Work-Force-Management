import { createHash } from 'crypto';
import { Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { IntegrationEvidenceAttributionController } from './integration-evidence-attribution.controller';
import { IntegrationApprovalController } from './integration-approval.controller';
import { IntegrationEvidenceAttributionService } from './integration-evidence-attribution.service';
import { IntegrationApprovalLedgerService } from './integration-approval-ledger.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
const calls: Array<{ actor: any; action: string; evidenceId: string }> = [];
const users: Record<string, any> = {
  attestor: { id: 'attestor', role: 'SUPERVISOR', isActive: true },
  reviewer: { id: 'reviewer', role: 'ADMINISTRATOR', isActive: true },
  technician: { id: 'technician', role: 'TECHNICIAN', isActive: true },
};
@Module({
  controllers: [IntegrationEvidenceAttributionController, IntegrationApprovalController],
  providers: [
    JwtAuthGuard, RolesGuard, Reflector,
    { provide: JwtService, useValue: {
      verifyAsync: async (token: string) => {
        if (!Object.prototype.hasOwnProperty.call(users, token)) {
          throw new Error('invalid synthetic JWT');
        }
        return { sub: token };
      },
    } },
    { provide: PrismaService, useValue: {
      user: { findUnique: async ({ where }: any) => users[where.id] || null },
    } },
    { provide: IntegrationEvidenceAttributionService, useValue: {
      record: async (actor: any, evidenceId: string, action: string) => {
        calls.push({ actor, evidenceId, action }); return true;
      },
    } },
    { provide: IntegrationApprovalLedgerService, useValue: {
      record: async (actor: any, _admissionId: string, evidenceId: string, action: string) => {
        calls.push({ actor, evidenceId, action }); return true;
      },
    } },
  ],
})
class HttpSessionFixture {}

async function main(): Promise<void> {
  const app = await NestFactory.create(HttpSessionFixture, { logger: false });
  await app.listen(0, '127.0.0.1');
  try {
    const addr = app.getHttpServer().address();
    if (!addr || typeof addr === 'string') throw new Error('missing local port');
    const base = 'http://127.0.0.1:' + addr.port + '/integration/';
    const request = (route: string, token?: string) => fetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({
        evidenceId: 'synthetic-evidence',
        admissionId: 'synthetic-admission',
        operatorId: 'forged-operator',
        reviewerId: 'forged-reviewer',
        sessionHash: 'f'.repeat(64),
      }),
    });
    check('attestation unauthenticated rejected',
      (await request('evidence-attribution/attest')).status === 401);
    check('review invalid token rejected',
      (await request('evidence-attribution/review', 'invalid')).status === 401);
    check('technician attestation forbidden',
      (await request('evidence-attribution/attest', 'technician')).status === 403);
    check('technician approval forbidden',
      (await request('reconciliation-approval/approve', 'technician')).status === 403);
    const routes: Array<[string, string, string]> = [
      ['evidence-attribution/attest', 'attestor', 'ATTEST'],
      ['evidence-attribution/review', 'reviewer', 'REVIEW'],
      ['reconciliation-approval/propose', 'attestor', 'PROPOSE'],
      ['reconciliation-approval/approve', 'reviewer', 'APPROVE'],
    ];
    for (const [route, token, action] of routes) {
      const response = await request(route, token);
      check('HTTP ' + action + ' accepts verified role',
        response.status === 201 && (await response.json()).recorded === true);
    }
    check('exactly four authorized service calls', calls.length === 4);
    check('attestor identity and session hash bound to verified token',
      calls[0].actor.userId === 'attestor' &&
      calls[0].actor.sessionHash === createHash('sha256').update('attestor').digest('hex'));
    check('reviewer identity and session hash independently bound',
      calls[1].actor.userId === 'reviewer' &&
      calls[1].actor.sessionHash === createHash('sha256').update('reviewer').digest('hex') &&
      calls[0].actor.sessionHash !== calls[1].actor.sessionHash);
    check('forged request body cannot override identities',
      calls.every(call => call.actor.userId !== 'forged-operator' &&
        call.actor.userId !== 'forged-reviewer' &&
        call.actor.sessionHash !== 'f'.repeat(64)));
    console.log('Phase 5E.2Z HTTP session boundary fixture passed.');
  } finally {
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
