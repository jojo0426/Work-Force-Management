import { readFileSync } from 'fs';
import { resolve } from 'path';

function read(path: string): string {
  return readFileSync(resolve(__dirname, '../../', path), 'utf8');
}

function expect(name: string, condition: boolean): void {
  if (!condition) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: ${name}`);
}

console.log('=== PHASE 5A.1 INTEGRATION QUEUE FOUNDATION ===');

const schema = read('prisma/schema.prisma');
const migration = read(
  'prisma/migrations/20261005_phase5a_integration_queue_foundation/migration.sql',
);

expect(
  'IntegrationJob has optional idempotency key',
  /idempotencyKey\s+String\?/.test(schema),
);

expect(
  'idempotency is scoped by source system',
  /@@unique\(\[sourceSystem,\s*idempotencyKey\]\)/.test(schema),
);

expect(
  'retry ceiling defaults to five',
  /maxRetries\s+Int\s+@default\(5\)/.test(schema),
);

expect(
  'retry scheduling is persisted',
  /nextAttemptAt\s+DateTime\s+@default\(now\(\)\)/.test(schema),
);

expect(
  'claim timestamp is persisted',
  /claimedAt\s+DateTime\?/.test(schema),
);

expect(
  'claim token is persisted',
  /claimToken\s+String\?/.test(schema),
);

expect(
  'last attempt timestamp is persisted',
  /lastAttemptAt\s+DateTime\?/.test(schema),
);

expect(
  'completion timestamp is persisted',
  /completedAt\s+DateTime\?/.test(schema),
);

expect(
  'terminal failure timestamp is persisted',
  /failedAt\s+DateTime\?/.test(schema),
);

expect(
  'runnable queue index exists',
  /@@index\(\[status,\s*nextAttemptAt,\s*createdAt\]\)/.test(schema),
);

expect(
  'claim token index exists',
  /@@index\(\[claimToken\]\)/.test(schema),
);

expect(
  'migration creates scoped idempotency index',
  /IntegrationJob_sourceSystem_idempotencyKey_key/.test(migration),
);

expect(
  'migration creates runnable queue index',
  /IntegrationJob_status_nextAttemptAt_createdAt_idx/.test(migration),
);

expect(
  'migration creates claim token index',
  /IntegrationJob_claimToken_idx/.test(migration),
);

if (process.exitCode) {
  throw new Error('Phase 5A.1 integration queue foundation failed');
}

console.log('Phase 5A.1 integration queue foundation passed.');
