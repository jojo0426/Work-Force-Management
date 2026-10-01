export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export type ManagementRole = 'JOB_CONTROLLER' | 'SUPERVISOR' | 'ADMINISTRATOR';
export type SessionUser = { id: string; email: string; name: string; role: string; teamId?: string | null };
export type Session = { token: string; user: SessionUser };

const SESSION_KEY = 'fiberblaze_wfm_management_session';
const MANAGEMENT_ROLES = new Set<ManagementRole>(['JOB_CONTROLLER', 'SUPERVISOR', 'ADMINISTRATOR']);

export function isManagementRole(role?: string): role is ManagementRole {
  return !!role && MANAGEMENT_ROLES.has(role as ManagementRole);
}

export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed?.user || !isManagementRole(parsed.user.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(SESSION_KEY);
}

async function parseResponse(res: Response) {
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) return res.json();
  return res.text();
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(data?.message || 'Login failed');
  if (!isManagementRole(data?.user?.role)) throw new Error('This portal is restricted to Job Controller, Supervisor, and Administrator accounts.');
  const session = data as Session;
  saveSession(session);
  return session;
}

export async function apiFetch(path: string, init: RequestInit = {}, session?: Session | null) {
  const active = session || loadSession();
  if (!active?.token) throw new Error('AUTH_REQUIRED');
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${active.token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (res.status === 401 || res.status === 403) {
    if (res.status === 401) clearSession();
    const data = await parseResponse(res).catch(() => null);
    throw new Error(data?.message || (res.status === 401 ? 'Session expired' : 'Access denied'));
  }
  if (!res.ok) {
    const data = await parseResponse(res).catch(() => null);
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return res;
}

export async function apiJson<T = any>(path: string, init: RequestInit = {}, session?: Session | null): Promise<T> {
  const res = await apiFetch(path, init, session);
  return res.json();
}

export async function downloadAuthenticated(path: string, filename: string, session?: Session | null) {
  const res = await apiFetch(path, {}, session);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
