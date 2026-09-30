import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

function contextFor(role?: UserRole): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as any;
}

function guardFor(required?: UserRole[]) {
  const reflector = {
    getAllAndOverride: (key: string) => key === ROLES_KEY ? required : undefined
  } as Reflector;
  return new RolesGuard(reflector);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`RBAC self-test failed: ${message}`);
}

function expectForbidden(fn: () => unknown, message: string) {
  try {
    fn();
    throw new Error(`RBAC self-test failed: ${message}`);
  } catch (error) {
    if (!(error instanceof ForbiddenException)) throw error;
  }
}

function run() {
  assert(guardFor().canActivate(contextFor()) === true, 'route without role metadata should pass role guard');
  assert(guardFor([UserRole.TECHNICIAN]).canActivate(contextFor(UserRole.TECHNICIAN)) === true, 'technician should access technician route');
  assert(guardFor([UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR]).canActivate(contextFor(UserRole.JOB_CONTROLLER)) === true, 'job controller should access management route');
  assert(guardFor([UserRole.SUPERVISOR, UserRole.ADMINISTRATOR]).canActivate(contextFor(UserRole.ADMINISTRATOR)) === true, 'administrator should access privileged route');
  expectForbidden(() => guardFor([UserRole.SUPERVISOR]).canActivate(contextFor(UserRole.TECHNICIAN)), 'technician must be forbidden from supervisor route');
  expectForbidden(() => guardFor([UserRole.ADMINISTRATOR]).canActivate(contextFor(UserRole.SUPERVISOR)), 'supervisor must be forbidden from administrator-only route');
  expectForbidden(() => guardFor([UserRole.TECHNICIAN]).canActivate(contextFor()), 'missing authenticated user must not satisfy protected role');
  console.log('RBAC self-test PASS: allowed and forbidden role cases validated.');
}

run();
