import { strict as assert } from 'assert';
import { IntegrationSyntheticSendGatewayService } from './integration-synthetic-send-gateway.service';

async function main(): Promise<void> {
  const prior = process.env.WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE;
  const priorActions = process.env.GITHUB_ACTIONS;
  let executed = false;
  try {
    delete process.env.WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE;
    const service = new IntegrationSyntheticSendGatewayService({} as any);
    const result = await service.dispatch('phase5e2ap-denied-send', 1n, async () => {
      executed = true;
    });
    assert.equal(result, 'INVALID');
    assert.equal(executed, false);
    process.env.WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE = 'true';
    delete process.env.GITHUB_ACTIONS;
    const second = await service.dispatch('phase5e2ap-denied-again', 1n, async () => {
      executed = true;
    });
    assert.equal(second, 'INVALID');
    assert.equal(executed, false);
    console.log('PASS: synthetic send gateway fails closed without isolated CI context');
  } finally {
    if (prior === undefined) delete process.env.WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE;
    else process.env.WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE = prior;
    if (priorActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = priorActions;
  }
}
main().catch(e => { console.error(e); process.exit(1); });
