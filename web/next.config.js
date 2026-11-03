/** @type {import('next').NextConfig} */
const isCloudDeployment = process.env.WFM_CLOUD_DEPLOYMENT === 'true';
const configuredApiOrigin = process.env.WFM_API_ORIGIN;

function getApiOrigin() {
  if (!configuredApiOrigin) {
    if (isCloudDeployment) throw new Error('WFM_API_ORIGIN is required when WFM_CLOUD_DEPLOYMENT=true');
    return 'http://127.0.0.1:4000';
  }
  let parsed;
  try { parsed = new URL(configuredApiOrigin); }
  catch { throw new Error('WFM_API_ORIGIN must be a valid absolute URL'); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('WFM_API_ORIGIN must be an origin without credentials, path, query, or fragment');
  }
  if (isCloudDeployment && parsed.protocol !== 'https:') throw new Error('WFM_API_ORIGIN must use HTTPS for cloud deployments');
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('WFM_API_ORIGIN must use HTTP or HTTPS');
  if (isCloudDeployment && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('WFM_API_ORIGIN cannot be a loopback host in cloud deployments');
  }
  return parsed.origin;
}
const apiOrigin = getApiOrigin();
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};
module.exports = nextConfig;
