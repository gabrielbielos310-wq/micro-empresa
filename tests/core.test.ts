import test from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth } from '../services/eve/src/auth.js';
import { modelConfig } from '../services/eve/src/config.js';
import { jarvisDefinition } from '../services/eve/src/agent.js';
import { mockModel } from 'eve/evals';

const env = { JARVIS_ADMIN_ID: 'admin-a', JARVIS_ADMIN_TOKEN: 'a'.repeat(40) };
const request = (token = env.JARVIS_ADMIN_TOKEN) => new Request('http://localhost/eve/v1/session', { headers: { authorization: `Bearer ${token}` } });
test('inicialização sem ferramentas e com limites', () => {
  const agent = jarvisDefinition(() => mockModel('teste'));
  assert.equal(agent.defaultTools, false);
  assert.equal(agent.limits.sessionTimeoutMs, 1800000);
});
test('modelo exige configuração explícita e credencial', () => {
  assert.throws(() => modelConfig({}), /JARVIS_MODEL/);
  assert.throws(() => modelConfig({ JARVIS_MODEL: 'openai/model' }), /AI_GATEWAY_API_KEY/);
  assert.equal(modelConfig({ JARVIS_MODEL: 'openai/model', AI_GATEWAY_API_KEY: 'synthetic' }), 'openai/model');
});
test('autenticação nega anônimo, token inválido e configuração ausente', async () => {
  for (const authenticate of [adminAuth({}), adminAuth(env)]) {
    await assert.rejects(async () => authenticate(new Request('http://localhost')));
    await assert.rejects(async () => authenticate(request('invalid')));
  }
});
test('identidade vem do servidor e requisições têm limite', async () => {
  const authenticate = adminAuth(env);
  const identity = await authenticate(request());
  assert.equal(identity?.principalId, 'admin-a');
  assert.equal(identity?.principalType, 'user');
  for (let i = 1; i < 60; i++) await authenticate(request());
  await assert.rejects(async () => authenticate(request()), /Limite/);
});

import { JarvisSessions } from '../services/eve/src/sessions.js';
import type { ClientSession } from 'eve/client';
test('Bridge valida entrada e transporte; erro não revela dados do provedor', async () => {
  assert.throws(() => new JarvisSessions('http://remote.example', 'a'.repeat(40)), /inseguro/);
  const bridge = new JarvisSessions('http://localhost:2000', 'a'.repeat(40));
  let cancelled = false;
  const session = { id: 'synthetic', send: async () => { throw new Error('synthetic-private-provider-detail'); }, cancel: async () => { cancelled = true; } } as unknown as ClientSession;
  await assert.rejects(() => bridge.execute(session, ''), /Mensagem inválida/);
  await assert.rejects(() => bridge.execute(session, 'teste'), error => error instanceof Error && !error.message.includes('private-provider'));
  assert.equal(cancelled, true);
});
test('Bridge cancela execução ao atingir timeout', async () => {
  const bridge = new JarvisSessions('http://localhost:2000', 'a'.repeat(40), 10);
  let cancelled = false;
  const session = { id: 'synthetic', send: async () => ({ result: ({ signal }: { signal: AbortSignal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })) }), cancel: async () => { cancelled = true; } } as unknown as ClientSession;
  // Keep the test event loop alive while AbortSignal's unref timer runs.
  const timer = setTimeout(() => {}, 1000);
  try { await assert.rejects(() => bridge.execute(session, 'teste')); assert.equal(cancelled, true); }
  finally { clearTimeout(timer); }
});
