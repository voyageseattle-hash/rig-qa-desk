import { fileURLToPath } from 'node:url';
import { createQaServer } from '../src/server.mjs';

// Explicit configuration keeps ambient credentials and live activation out of rehearsals.
export function createDemoServer() {
  return createQaServer({ mock: false, apiKey: '', liveAllowed: false,
    fetchImpl: async () => { throw new Error('Provider requests are disabled in the demo.'); } });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.RIG_QA_PORT || 4321);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('RIG_QA_PORT must be 1024–65535.');
  const server = createDemoServer();
  server.on('error', () => { console.error('Demo could not start. Check whether its port is already in use.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Rig QA Desk demo: http://127.0.0.1:${port}`);
    console.log('Paid requests disabled. Run guided test replays a labeled saved NVIDIA response with fresh local inspections.');
    console.log('Stop with Ctrl+C. No publication or submission is performed.');
  });
}
