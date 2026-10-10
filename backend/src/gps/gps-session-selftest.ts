import { strict as assert } from 'assert';
import { UserRole } from '@prisma/client';
import { GpsGateway } from './gps.gateway';

async function main() {
  const users = new Map<string, any>([
    ['tech', { id: 'tech', role: UserRole.TECHNICIAN, isActive: true }],
    ['manager', { id: 'manager', role: UserRole.SUPERVISOR, isActive: true }],
  ]);
  const expired = new Set<string>();
  let writes = 0, logs = 0;
  const jwt: any = { verifyAsync: async (token: string) => {
    if (expired.has(token)) throw new Error('Expired');
    return { sub: token };
  } };
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => users.get(where.id),
      update: async ({ data }: any) => { writes++; return data; } },
    locationLog: { create: async () => { logs++; } },
  };
  function socket(token: unknown) {
    return { handshake: { auth: { token } }, data: {} as any, disconnected: false,
      joined: false, deliveries: 0,
      disconnect() { this.disconnected = true; },
      async join() { this.joined = true; }, async leave() { this.joined = false; },
      emit() { this.deliveries++; } };
  }
  const tech = socket('tech'), manager = socket('manager');
  const gateway = new GpsGateway(jwt, prisma);
  gateway.server = { in: () => ({ fetchSockets: async () => [manager] }) } as any;
  await gateway.handleConnection(tech as any);
  await gateway.handleConnection(manager as any);
  assert.equal(manager.joined, true);
  const point = { lat: 14.3, lng: 120.9 };
  assert.equal((await gateway.handleLocation(tech as any, point)).received, true);
  assert.equal(writes, 1); assert.equal(logs, 1); assert.equal(manager.deliveries, 1);
  assert.equal((await gateway.handleLocation(tech as any, null as any)).received, false);
  assert.equal((await gateway.handleLocation(tech as any, { lat: 91, lng: 0 })).received, false);
  assert.equal(writes, 1);
  expired.add('tech');
  assert.equal((await gateway.handleLocation(tech as any, point)).received, false);
  assert.equal(tech.disconnected, true); assert.equal(tech.data.user, undefined);
  assert.equal(writes, 1);
  expired.clear();
  users.get('tech').isActive = false;
  assert.equal((await gateway.handleLocation(tech as any, point)).received, false);
  assert.equal(writes, 1);
  users.get('tech').isActive = true;
  users.get('tech').role = UserRole.SUPERVISOR;
  assert.equal((await gateway.handleLocation(tech as any, point)).received, false);
  assert.equal(writes, 1);
  users.get('tech').role = UserRole.TECHNICIAN;
  expired.add('manager');
  assert.equal((await gateway.handleLocation(tech as any, point)).received, true);
  assert.equal(manager.deliveries, 1); assert.equal(manager.disconnected, true);
  expired.clear();
  users.get('manager').isActive = false;
  await gateway.handleLocation(tech as any, point);
  assert.equal(manager.deliveries, 1);
  users.get('manager').isActive = true;
  users.get('manager').role = UserRole.TECHNICIAN;
  await gateway.handleLocation(tech as any, point);
  assert.equal(manager.deliveries, 1); assert.equal(manager.joined, false);
  const forged = socket({ sub: 'tech' });
  await gateway.handleConnection(forged as any);
  assert.equal(forged.disconnected, true); assert.equal(forged.data.user, undefined);
  console.log('PASS: GPS socket expiry, account deactivation and role changes deny stale authorization');
  console.log('PASS: live locations reach only currently authenticated management recipients');
  console.log('PASS: malformed coordinates and token types cause no GPS writes');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
