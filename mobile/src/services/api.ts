const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export type SessionUser = { id: string; email: string; name: string; role: string; teamId?: string | null };
export type Session = { token: string; user: SessionUser };
export type EvidenceUploadTicketRequest = { type: string; captureSource: 'CAMERA'; contentType: 'image/jpeg'|'image/png'|'image/webp'; sizeBytes: number; originalName?: string };
export type EvidenceUploadTicket = { storageKey: string; provider: string; uploadMode: string; maxBytes: number; allowedContentTypes: string[]; uploadUrl?: string; method?: string; headers?: Record<string,string>; fields?: Record<string,string> };

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message; throw new Error(message || `Request failed (${response.status})`); }
  return data as T;
}

export async function login(email: string, password: string): Promise<Session> {
  const response = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const session = await parseResponse<Session>(response);
  if (session.user.role !== 'TECHNICIAN') throw new Error('The mobile field app is restricted to technician accounts.');
  return session;
}

async function authenticated<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  return parseResponse<T>(response);
}

export async function getMe(token: string) { return authenticated<{ user: SessionUser }>(token, '/auth/me'); }
export async function getAssignedWorkOrders(token: string) { return authenticated<{ data: any[] }>(token, '/work-orders'); }
export async function startWorkOrder(token: string, workOrderId: string) { return authenticated<any>(token, `/work-orders/${encodeURIComponent(workOrderId)}/start`, { method: 'POST' }); }

export async function createEvidenceUploadTicket(token: string, workOrderId: string, payload: EvidenceUploadTicketRequest) {
  return authenticated<EvidenceUploadTicket>(token, `/work-orders/${encodeURIComponent(workOrderId)}/evidence/upload-ticket`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function registerEvidence(token: string, workOrderId: string, payload: Record<string, unknown>) {
  return authenticated<any>(token, `/work-orders/${encodeURIComponent(workOrderId)}/evidence`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function finishWorkOrder(token: string, workOrderId: string, payload: Record<string, unknown>) {
  return authenticated<any>(token, `/work-orders/${encodeURIComponent(workOrderId)}/finish`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateMyLocation(token: string, lat: number, lng: number, status?: 'OFFLINE'|'ONLINE'|'WORKING'|'BREAK') {
  return authenticated<any>(token, '/gps/location/update', { method: 'POST', body: JSON.stringify({ lat, lng, status }) });
}

export async function getSmartNext(token: string, lat: number, lng: number) {
  const query = `lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
  return authenticated<any>(token, `/work-orders/smart-next?${query}`);
}

export { API };
