import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextFor(authorization?: string): ExecutionContext {
  const request: any = { headers: authorization ? { authorization } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request })
  } as any;
}

function guard(jwtBehavior: 'valid' | 'invalid' | 'expired', user: any) {
  const jwt: any = {
    verifyAsync: async () => {
      if (jwtBehavior === 'invalid') throw new Error('invalid token');
      if (jwtBehavior === 'expired') throw new Error('jwt expired');
      return { sub: 'user-1' };
    }
  };
  const prisma: any = { user: { findUnique: async () => user } };
  return new JwtAuthGuard(jwt, prisma);
}

async function expectUnauthorized(action: () => Promise<unknown>, message: string) {
  try {
    await action();
    throw new Error(`Auth self-test failed: ${message}`);
  } catch (error) {
    if (!(error instanceof UnauthorizedException)) throw error;
  }
}

async function run() {
  const active = { id: 'user-1', email: 'tech@example.com', name: 'Tech', role: 'TECHNICIAN', teamId: 'team-1', isActive: true };
  await expectUnauthorized(() => guard('valid', active).canActivate(contextFor()), 'missing bearer token must be rejected');
  await expectUnauthorized(() => guard('valid', active).canActivate(contextFor('Basic abc')), 'non-bearer authentication must be rejected');
  await expectUnauthorized(() => guard('invalid', active).canActivate(contextFor('Bearer invalid')), 'invalid JWT must be rejected');
  await expectUnauthorized(() => guard('expired', active).canActivate(contextFor('Bearer expired')), 'expired JWT must be rejected');
  await expectUnauthorized(() => guard('valid', null).canActivate(contextFor('Bearer valid')), 'unknown account must be rejected');
  await expectUnauthorized(() => guard('valid', { ...active, isActive: false }).canActivate(contextFor('Bearer valid')), 'disabled account must be rejected');

  const context = contextFor('Bearer valid');
  const allowed = await guard('valid', active).canActivate(context);
  if (!allowed) throw new Error('Auth self-test failed: valid active account must be allowed');
  const request: any = context.switchToHttp().getRequest();
  if (request.user?.id !== active.id || request.user?.role !== active.role || request.user?.teamId !== active.teamId) {
    throw new Error('Auth self-test failed: authenticated identity was not attached correctly');
  }
  console.log('Authentication self-test PASS: missing, invalid, expired, disabled and valid-token paths validated.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
