const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export type SessionUser = { id: string; email: string; name: string; role: string; teamId?: string | null };
export type Session = { token: string; user: SessionUser };
export type EvidenceUploadTicketRequest = { type: string; captureSource: 'CAMERA'; contentType: 'image/jpeg'|'image/png'|'image/webp'; sizeBytes: number; originalName?: string };
export type EvidenceUploadTicket = { ticketId: string; storageKey: string; provider: string; uploadMode: string; expiresAt: string; maxBytes: number; allowedContentTypes: string[]; uploadUrl?: string; method?: string; headers?: Record<string,string>; fields?: Record<string,string> };

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
export async function createEvidenceUploadTicket(token: string, workOrderId: string, payload: EvidenceUploadTicketRequest) { return authenticated<EvidenceUploadTicket>(token, `/work-orders/${encodeURIComponent(workOrderId)}/evidence/upload-ticket`, { method: 'POST', body: JSON.stringify(payload) }); }

export async function uploadEvidenceToTicket(ticket: EvidenceUploadTicket, localUri: string, contentType: EvidenceUploadTicketRequest['contentType']) {
  if (!ticket.uploadUrl || ticket.uploadMode !== 'PRESIGNED_PUT') throw new Error('Storage provider did not return a presigned PUT upload URL.');
  if (new Date(ticket.expiresAt).getTime() <= Date.now()) throw new Error('Evidence upload ticket has expired. Please retry the upload.');
  const local = await fetch(localUri);
  if (!local.ok) throw new Error('Unable to read captured evidence from the device.');
  const blob = await local.blob();
  if (blob.size <= 0 || blob.size > ticket.maxBytes) throw new Error('Captured evidence is empty or exceeds the upload size limit.');
  const response = await fetch(ticket.uploadUrl, { method: ticket.method || 'PUT', headers: { ...(ticket.headers || {}), 'Content-Type': contentType }, body: blob });
  if (!response.ok) throw new Error(`Evidence storage upload failed (${response.status}).`);
  return { ticketId: ticket.ticketId, storageKey: ticket.storageKey };
}

export async function registerEvidence(token: string, workOrderId: string, payload: Record<string, unknown>) { return authenticated<any>(token, `/work-orders/${encodeURIComponent(workOrderId)}/evidence`, { method: 'POST', body: JSON.stringify(payload) }); }
export async function finishWorkOrder(token: string, workOrderId: string, payload: Record<string, unknown>) { return authenticated<any>(token, `/work-orders/${encodeURIComponent(workOrderId)}/finish`, { method: 'POST', body: JSON.stringify(payload) }); }
export async function updateMyLocation(token: string, lat: number, lng: number, status?: 'ONLINE'|'WORKING'|'AVAILABLE') { return authenticated<any>(token, '/gps/location/update', { method: 'POST', body: JSON.stringify({ lat, lng, status }) }); }
export async function endLocationSession(token: string) { return authenticated<any>(token, '/gps/location/offline', { method: 'POST' }); }
export async function getSmartNext(token: string, lat: number, lng: number) { const query = `lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`; return authenticated<any>(token, `/work-orders/smart-next?${query}`); }
export { API };
