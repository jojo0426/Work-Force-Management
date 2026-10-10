import { strict as assert } from 'assert';
import { saveCustomerSignature } from './api.ts';
async function main() {
  const original = globalThis.fetch;
  let calls = 0, code = 401, result: unknown = { message: 'Authentication required' };
  globalThis.fetch = (async (url: unknown, init: RequestInit) => {
    calls++;
    assert(String(url).endsWith('/phase4/signature'));
    assert.equal((init.headers as any).Authorization, 'Bearer synthetic-test-session');
    assert.equal(init.method, 'POST');
    return new Response(JSON.stringify(result), { status: code });
  }) as typeof fetch;
  try {
    await assert.rejects(saveCustomerSignature('', {})); assert.equal(calls, 0);
    await assert.rejects(saveCustomerSignature('synthetic-test-session', {}), /Authentication required/);
    code = 500; result = { message: 'Storage failed' };
    await assert.rejects(saveCustomerSignature('synthetic-test-session', {}), /Storage failed/);
    code = 200; result = {};
    await assert.rejects(saveCustomerSignature('synthetic-test-session', {}), /did not confirm/);
    result = { signature: { isVerified: false } };
    await assert.rejects(saveCustomerSignature('synthetic-test-session', {}), /did not confirm/);
    result = { signature: { isVerified: true } };
    assert.equal((await saveCustomerSignature('synthetic-test-session', {})).signature.isVerified, true);
    console.log('PASS: signature API requires bearer auth, rejects HTTP errors and requires explicit server verification');
  } finally { globalThis.fetch = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
