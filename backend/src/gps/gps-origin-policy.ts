/** Browser origins are allowlisted; native clients still require JWT authentication. */
export function isAllowedGpsOrigin(origin: unknown): boolean {
  const configured = process.env.CORS_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !configured?.length) return false;
  if (origin === undefined) return true;
  if (typeof origin !== 'string') return false;
  const origins = configured?.length ? configured : ['http://localhost:3000', 'http://localhost:5173'];
  return origins.includes(origin);
}
