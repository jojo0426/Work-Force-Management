/**
 * Phase 5E.2AN: externally enforced dispatch gate contract.
 * This is an in-memory sandbox reference implementation, NOT a production gateway.
 *
 * The gateway owns a linearizable stop/accept decision; workers cannot
 * bypass it. A stale generation is rejected at the same boundary where
 * external sends would start. STOP returns only after admitted sends drain.
 */
export type GateResult = 'ACCEPTED' | 'STOPPED' | 'STALE_GENERATION' | 'DUPLICATE' | 'INVALID';

export interface ExternalDispatchGate {
  start(requestId: string, generation: bigint, send: () => Promise<void>): Promise<GateResult>;
  stop(nextGeneration: bigint): Promise<{ stopped: true; drained: boolean; generation: bigint }>;
  inspect(): Readonly<{ stopped: boolean; generation: bigint; active: number }>;
}

/**
 * Sandbox-only serialized gate. The callback is called under the gate's
 * logical admission lock (synchronous section) before STOP can be accepted.
 * STOP waits for all admitted callbacks to settle; unknown outcomes are not
 * converted into provider-side quiescence.
 */
export class SandboxExternalDispatchGate implements ExternalDispatchGate {
  private stopped = false;
  private generation: bigint;
  private active = 0;
  private readonly seen = new Set<string>();
  private readonly drains = new Set<() => void>();

  constructor(generation: bigint) {
    if (generation < 0n) throw new Error('invalid generation');
    this.generation = generation;
  }

  inspect() {
    return { stopped: this.stopped, generation: this.generation, active: this.active };
  }

  async start(requestId: string, generation: bigint,
    send: () => Promise<void>): Promise<GateResult> {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId) || typeof send !== 'function')
      return 'INVALID';
    if (this.stopped) return 'STOPPED';
    if (generation !== this.generation) return 'STALE_GENERATION';
    if (this.seen.has(requestId)) return 'DUPLICATE';
    this.seen.add(requestId);
    this.active++;
    try {
      // No await between admission and callback invocation.
      await send();
      return 'ACCEPTED';
    } finally {
      this.active--;
      if (this.active === 0) {
        for (const resolve of this.drains) resolve();
        this.drains.clear();
      }
    }
  }

  async stop(nextGeneration: bigint): Promise<{ stopped: true; drained: boolean; generation: bigint }> {
    if (nextGeneration <= this.generation) throw new Error('non-increasing generation');
    this.stopped = true;
    this.generation = nextGeneration;
    if (this.active !== 0) {
      await new Promise<void>(resolve => this.drains.add(resolve));
    }
    return { stopped: true, drained: this.active === 0, generation: this.generation };
  }
}
