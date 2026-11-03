const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const configPath = path.resolve(__dirname, '../next.config.js');
function load(env) {
  const old = { WFM_CLOUD_DEPLOYMENT: process.env.WFM_CLOUD_DEPLOYMENT, WFM_API_ORIGIN: process.env.WFM_API_ORIGIN };
  try {
    for (const key of Object.keys(old)) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    delete require.cache[require.resolve(configPath)];
    return require(configPath);
  } finally {
    for (const key of Object.keys(old)) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
}
test('local development keeps existing API rewrite', async () => {
  const cfg = load({});
  assert.equal((await cfg.rewrites())[0].destination, 'http://127.0.0.1:4000/api/v1/:path*');
});
test('cloud deployment rejects missing API origin', () => {
  assert.throws(() => load({ WFM_CLOUD_DEPLOYMENT: 'true' }), /required/);
});
test('cloud deployment rejects insecure and loopback API origins', () => {
  for (const origin of ['http://example.com', 'http://127.0.0.1:4000', 'https://localhost:4000']) {
    assert.throws(() => load({ WFM_CLOUD_DEPLOYMENT: 'true', WFM_API_ORIGIN: origin }));
  }
});
test('cloud deployment rejects credentials, paths and fragments', () => {
  for (const origin of ['https://user:pass@example.com', 'https://example.com/api', 'https://example.com/#token']) {
    assert.throws(() => load({ WFM_CLOUD_DEPLOYMENT: 'true', WFM_API_ORIGIN: origin }));
  }
});
test('cloud deployment uses configured HTTPS API origin', async () => {
  const cfg = load({ WFM_CLOUD_DEPLOYMENT: 'true', WFM_API_ORIGIN: 'https://api.example.com' });
  assert.equal((await cfg.rewrites())[0].destination, 'https://api.example.com/api/v1/:path*');
});
