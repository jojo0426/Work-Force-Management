import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const mobileApi = readFileSync(resolve(process.cwd(), '../mobile/src/services/api.ts'), 'utf8');
const workOrders = readFileSync(resolve(process.cwd(), 'src/work-orders/work-orders.controller.ts'), 'utf8');
const gps = readFileSync(resolve(process.cwd(), 'src/gps/gps.controller.ts'), 'utf8');
const auth = readFileSync(resolve(process.cwd(), 'src/auth/auth.controller.ts'), 'utf8');

expect('mobile login targets backend auth/login', mobileApi.includes("`${API}/auth/login`") && auth.includes("@Post('login')"));
expect('mobile authenticated helper sends bearer token', mobileApi.includes('Authorization: `Bearer ${token}`'));
expect('mobile session validates technician role', mobileApi.includes("session.user.role !== 'TECHNICIAN'"));
expect('mobile assigned WO endpoint matches backend controller', mobileApi.includes("'/work-orders'") && workOrders.includes("@Controller('work-orders')") && workOrders.includes('@Get()'));
expect('mobile start endpoint matches backend controller', mobileApi.includes('/start`') && workOrders.includes("@Post(':id/start')"));
expect('mobile evidence ticket endpoint matches backend controller', mobileApi.includes('/evidence/upload-ticket`') && workOrders.includes("@Post(':id/evidence/upload-ticket')"));
expect('mobile evidence registration endpoint matches backend controller', mobileApi.includes('/evidence`') && workOrders.includes("@Post(':id/evidence')"));
expect('mobile finish endpoint matches backend controller', mobileApi.includes('/finish`') && workOrders.includes("@Post(':id/finish')"));
expect('mobile GPS update endpoint matches backend controller', mobileApi.includes("'/gps/location/update'") && gps.includes("@Controller('gps')") && gps.includes("@Post('location/update')"));
expect('mobile smart-next endpoint matches backend controller', mobileApi.includes('/work-orders/smart-next?') && workOrders.includes("@Get('smart-next')"));
expect('mobile required evidence is camera-only at client contract', mobileApi.includes("captureSource: 'CAMERA'"));
expect('mobile evidence upload requires presigned PUT ticket', mobileApi.includes("ticket.uploadMode !== 'PRESIGNED_PUT'"));
expect('mobile rejects expired evidence ticket before upload', mobileApi.includes('Evidence upload ticket has expired'));
expect('mobile validates captured evidence size before upload', mobileApi.includes('blob.size <= 0 || blob.size > ticket.maxBytes'));

console.log('Technician client-to-server contract gate passed.');
