import { strict as assert } from 'assert';
import { UserRole } from '@prisma/client';
import { GpsGateway } from './gps.gateway';
import { isAllowedGpsOrigin } from './gps-origin-policy';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';

async function testOriginTransport() {
  const http = createServer();
  const server = new Server(http, Reflect.getMetadata(GATEWAY_OPTIONS, GpsGateway));
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as any).port;
  try {
    const endpoint = `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`;
    assert.equal((await fetch(endpoint, { headers: { Origin: 'https://portal.example' } })).status, 200);
    assert.equal((await fetch(endpoint, { headers: { Origin: 'https://evil.example' } })).status, 403);
    // Exercise the same gate on direct upgrades, not only polling CORS.
    const upgrade = (origin: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = require('http').request({ host: '127.0.0.1', port,
        path: '/socket.io/?EIO=4&transport=websocket',
        headers: { Origin: origin, Connection: 'Upgrade', Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' } });
      request.on('response', result => { let body = ''; result.on('data', chunk => { body += chunk; }); result.on('end', () => { resolve({ status: result.statusCode, body }); }); });
      request.on('upgrade', (_result, socket) => { socket.destroy(); resolve({ status: 101, body: '' }); });
      request.on('error', reject);
      request.setTimeout(3000, () => request.destroy(new Error('origin test timed out')));
      request.end();
    });
    assert.equal((await upgrade('https://portal.example')).status, 101);
    const denied = await upgrade('https://evil.example');
    assert.equal(denied.status, 400);
    assert.equal(denied.body, 'Forbidden');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function main() {
  const previousNodeEnv = process.env.NODE_ENV, previousOrigins = process.env.CORS_ORIGINS;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGINS;
    assert.equal(isAllowedGpsOrigin(undefined), false);
    assert.equal(isAllowedGpsOrigin('https://portal.example'), false);
    process.env.CORS_ORIGINS = 'https://portal.example';
    assert.equal(isAllowedGpsOrigin('https://portal.example'), true);
    assert.equal(isAllowedGpsOrigin('https://evil.example'), false);
    assert.equal(isAllowedGpsOrigin('null'), false);
    assert.equal(isAllowedGpsOrigin(undefined), true);
    await testOriginTransport();
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGINS;
    assert.equal(isAllowedGpsOrigin('http://localhost:3000'), true);
    assert.equal(isAllowedGpsOrigin('https://evil.example'), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousOrigins;
  }
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
  console.log('PASS: polling and direct WebSocket upgrades reject untrusted browser origins');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
