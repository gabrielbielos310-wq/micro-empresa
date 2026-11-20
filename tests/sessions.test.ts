import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, writeFile, rm } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'eve/client';

// A disposable copy runs the production definitions with only a mock model
// and a second synthetic administrator for ownership tests.
test('Eve real local: sessões, continuidade, isolamento e encerramento com MockModel', { timeout: 120000 }, async () => {
  const root = resolve('tests/.runtime');
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  await cp('services/eve', root, { recursive: true, filter: p => !p.includes('/.eve') && !p.includes('/.output') });
  await writeFile(`${root}/agent/agent.ts`, `import { mockModel } from 'eve/evals';
import { jarvisDefinition } from '../src/agent.js';
export default jarvisDefinition(() => ({ model: mockModel(r => r.userMessages.join(' | ')), modelContextWindowTokens: 100000 }));`);
  await writeFile(`${root}/agent/channels/eve.ts`, `import { jarvisChannel } from '../../src/channel.js';
import { adminAuth } from '../../src/auth.js';
const a = adminAuth({ JARVIS_ADMIN_ID: 'a', JARVIS_ADMIN_TOKEN: 'a'.repeat(40) });
const b = adminAuth({ JARVIS_ADMIN_ID: 'b', JARVIS_ADMIN_TOKEN: 'b'.repeat(40) });
export default jarvisChannel(r => r.headers.get('authorization') === 'Bearer ' + 'b'.repeat(40) ? b(r) : a(r));`);
  const port = 19283;
  const baseUrl = `http://127.0.0.1:${port}`;
  await promisify(execFile)(resolve('node_modules/.bin/eve'), ['build'], { cwd: root, timeout: 60000, maxBuffer: 4000000 });
  const server = spawn(process.execPath, [resolve(root, '.output/server/index.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', PORT: String(port), HOST: '127.0.0.1' }, detached: true });
  let logs = '';
  server.stdout.on('data', d => { logs = (logs + d).slice(-10000); });
  server.stderr.on('data', d => { logs = (logs + d).slice(-10000); });
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      try { ready = (await fetch(`${baseUrl}/eve/v1/health`, { signal: AbortSignal.timeout(500), headers: { authorization: 'Bearer ' + 'a'.repeat(40) } })).ok; } catch {}
      if (ready) break;
      if (server.exitCode !== null) throw new Error(logs);
      await new Promise(r => setTimeout(r, 500));
    }
    assert.ok(ready, logs);
    const anonymous = await fetch(`${baseUrl}/eve/v1/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(anonymous.status, 401);
    const a = new Client({ baseUrl, auth: { bearer: 'a'.repeat(40) } });
    const idle = await a.sessions.create();
    const initial = await (await idle.session.send('sessão vazia')).result({ signal: AbortSignal.timeout(20000) });
    assert.match(initial.reply!, /sessão vazia/);
    await idle.session.end();
    for (const [body, status] of [['{', 400], ['x'.repeat(17000), 413]] as const) {
      const response = await fetch(`${baseUrl}/eve/v1/session`, { method: 'POST', headers: { authorization: 'Bearer ' + 'a'.repeat(40), 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, status);
    }
    const { session, delivery } = await a.sessions.create({ message: 'contexto-alfa' });
    const first = await delivery.result({ signal: AbortSignal.timeout(20000) });
    assert.notEqual(first.status, 'failed', JSON.stringify(first));
    assert.match(first.reply!, /contexto-alfa/);
    const second = await (await session.send('continuar')).result({ signal: AbortSignal.timeout(20000) });
    assert.match(second.reply!, /contexto-alfa.*continuar/);
    const separate = await a.sessions.create({ message: 'contexto-beta' });
    const other = await separate.delivery.result({ signal: AbortSignal.timeout(20000) });
    assert.doesNotMatch(other.reply!, /contexto-alfa/);
    for (const [method, suffix] of [['GET', '/stream'], ['POST', ''], ['POST', '/end']]) {
      const response = await fetch(`${baseUrl}/eve/v1/session/${session.id}${suffix}`, {
        method, headers: { authorization: 'Bearer ' + 'b'.repeat(40), 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({}) } : {}), signal: AbortSignal.timeout(3000),
      });
      assert.equal(response.status, 404);
    }
    const history = await session.snapshot();
    assert.ok(history);
    await session.end({ signal: AbortSignal.timeout(3000) });
    await assert.rejects(() => session.send('depois do fim', { signal: AbortSignal.timeout(3000) }));
    await separate.session.end({ signal: AbortSignal.timeout(3000) });
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    const exited = new Promise(r => server.exitCode !== null || server.signalCode !== null ? r(null) : server.once('exit', r));
    if (server.pid) { try { process.kill(-server.pid, 'SIGKILL'); } catch {} }
    await exited;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
