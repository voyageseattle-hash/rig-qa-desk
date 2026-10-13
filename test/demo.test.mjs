import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoServer } from '../scripts/demo.mjs';
import { buildFixture } from '../fixtures/generate.mjs';

test('demo ignores ambient live activation and keys, replays evidence, and refuses new inference', async () => {
  const priorKey = process.env.NEBIUS_API_KEY;
  const priorLive = process.env.NEBIUS_LIVE_ALLOWED;
  process.env.NEBIUS_API_KEY = 'test-sentinel-never-transmit';
  process.env.NEBIUS_LIVE_ALLOWED = '1';
  const server = createDemoServer();
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { Origin: base, 'X-Rig-QA-Request': '1' };
    const status = await (await fetch(`${base}/api/status`)).json();
    assert.equal(status.mode, 'offline');
    const playback = await fetch(`${base}/api/guided-test`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(playback.status, 200);
    const result = await playback.json();
    assert.equal(result.metadata.mode, 'recorded');
    const inspected = await (await fetch(`${base}/api/inspect`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-Asset-Rights': 'owned-or-licensed' }, body: buildFixture({ timeValues: [0, 0] }) })).json();
    const refused = await fetch(`${base}/api/recommend`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: inspected.report_id, approve_external_send: true }) });
    assert.notEqual(refused.status, 200);
    assert.equal(JSON.stringify(result).includes('test-sentinel-never-transmit'), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (priorKey === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = priorKey;
    if (priorLive === undefined) delete process.env.NEBIUS_LIVE_ALLOWED; else process.env.NEBIUS_LIVE_ALLOWED = priorLive;
  }
});
