import test from 'node:test';
import assert from 'node:assert/strict';
import { mockModel } from 'eve/evals';
import { jarvisDefinition } from '../services/eve/src/agent.js';
import { modelConfig } from '../services/eve/src/config.js';
import { controlledModel, realModel, GatewayFailure, classify } from '../services/eve/src/gateway.js';

type Model = Parameters<typeof controlledModel>[0];
const prompt = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'teste' }] }];
const result = { content: [{ type: 'text', text: 'ok' }], usage: { inputTokens: { total: 3 }, outputTokens: { total: 1 } } };
function fake(generate: (o: any) => any): Model { return { modelId: 'synthetic/model', provider: 'synthetic', specificationVersion: 'v4', doGenerate: generate } as unknown as Model; }
test('configuração: chave, modelo ausente e identificador inválido', () => {
  for (const env of [{}, { JARVIS_MODEL: 'provider/model' }, { AI_GATEWAY_API_KEY: 'synthetic' }]) assert.throws(() => realModel(env), GatewayFailure);
  assert.throws(() => modelConfig({ JARVIS_MODEL: 'https://bad', AI_GATEWAY_API_KEY: 'synthetic' }));
  assert.throws(() => realModel({ JARVIS_MODEL: 'bad', AI_GATEWAY_API_KEY: 'synthetic' }), (e: unknown) => e instanceof GatewayFailure && e.code === 'invalid_model');
});
test('inicialização MockModel sem chave e real sem inferência', () => {
  assert.equal(jarvisDefinition(() => mockModel('ok')).defaultTools, false);
  const model = realModel({ JARVIS_MODEL: 'synthetic/model', AI_GATEWAY_API_KEY: 'synthetic' });
  assert.equal(model.modelId, 'synthetic/model');
  assert.equal(jarvisDefinition(() => model).defaultTools, false);
});
test('saída limitada e auditoria contém somente metadados permitidos', async () => {
  const logs: unknown[] = [];
  const model = controlledModel(fake(async o => { assert.equal(o.maxOutputTokens, 256); return { ...result, response: { headers: { authorization: 'secret' } } }; }), r => logs.push(r));
  await model.doGenerate({ prompt, maxOutputTokens: 10000 });
  assert.doesNotMatch(JSON.stringify(logs), /secret|authorization|teste/);
  assert.match(JSON.stringify(logs), /durationMs.*inputTokens.*outputTokens/);
});
for (const [status, code] of [[401, 'authentication'], [404, 'model_unavailable'], [429, 'rate_limit'], [500, 'internal']] as const) {
  test(`falha ${status} sanitizada, sem retry`, async () => {
    let calls = 0; const logs: unknown[] = [];
    const model = controlledModel(fake(async () => { calls++; throw { statusCode: status, message: 'Bearer segredo', headers: { authorization: 'segredo' } }; }), r => logs.push(r));
    await assert.rejects(async () => model.doGenerate({ prompt }), (e: unknown) => e instanceof GatewayFailure && e.code === code);
    assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(logs), /segredo|Bearer|headers/);
  });
}
test('timeout e cancelamento simulados', async () => {
  const timer = setTimeout(() => {}, 1000);
  try {
    const model = controlledModel(fake(o => new Promise((_, reject) => {
      if (o.abortSignal.aborted) reject(o.abortSignal.reason);
      else o.abortSignal.addEventListener('abort', () => reject(o.abortSignal.reason), { once: true });
    })), () => {}, 10);
    await assert.rejects(async () => model.doGenerate({ prompt }), (e: unknown) => e instanceof GatewayFailure && e.code === 'timeout');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(async () => model.doGenerate({ prompt, abortSignal: controller.signal }), (e: unknown) => e instanceof GatewayFailure && e.code === 'cancelled');
  } finally { clearTimeout(timer); }
});
test('rede e resposta inválida', async () => {
  assert.equal(classify(new TypeError('private')), 'network');
  const model = controlledModel(fake(async () => ({ ...result, content: [] })), () => {});
  await assert.rejects(async () => model.doGenerate({ prompt }), (e: unknown) => e instanceof GatewayFailure && e.code === 'invalid_response');
});

test('streaming: metadados seguros e saída limitada', async () => {
  const logs: unknown[] = [];
  const model = controlledModel({ ...fake(() => result), doStream: async (o: any) => {
    assert.equal(o.maxOutputTokens, 32);
    return { stream: new ReadableStream({ start(c) {
      c.enqueue({ type: 'text-delta', id: '1', delta: 'conteudo-privado' });
      c.enqueue({ type: 'finish', usage: result.usage }); c.close();
    } }) };
  } } as unknown as Model, r => logs.push(r));
  const response = await model.doStream({ prompt, maxOutputTokens: 32 });
  for await (const _ of response.stream) {}
  assert.match(JSON.stringify(logs), /completed/);
  assert.doesNotMatch(JSON.stringify(logs), /conteudo-privado/);
});
test('streaming: falha de autenticação e stream incompleto', async () => {
  for (const failing of [true, false]) {
    const model = controlledModel({ ...fake(() => result), doStream: async () => ({ stream: new ReadableStream({ start(c) {
      if (failing) c.enqueue({ type: 'error', error: { statusCode: 401, message: 'segredo' } });
      c.close();
    } }) }) } as unknown as Model, () => {});
    const response = await model.doStream({ prompt });
    await assert.rejects(async () => { for await (const _ of response.stream) {} }, (e: unknown) => e instanceof GatewayFailure && e.code === (failing ? 'authentication' : 'invalid_response'));
  }
});

import { createGateway } from '@ai-sdk/gateway';
import { JarvisSessions } from '../services/eve/src/sessions.js';
import type { ClientSession } from 'eve/client';
test('limite de entrada rejeita antes do transporte', async () => {
  const bridge = new JarvisSessions('http://localhost:2000', 'a'.repeat(40));
  await assert.rejects(() => bridge.execute({} as ClientSession, 'x'.repeat(8001)), /Mensagem inválida/);
});
test('provider oficial com transporte HTTP simulado: autenticação sem expor resposta', async () => {
  let calls = 0; const logs: unknown[] = [];
  const provider = createGateway({ apiKey: 'synthetic-secret', fetch: async () => {
    calls++; return new Response(JSON.stringify({ error: { message: 'synthetic-secret', type: 'authentication_error' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  } });
  const model = controlledModel(provider('synthetic/model'), r => logs.push(r));
  await assert.rejects(async () => model.doGenerate({ prompt }), (e: unknown) => e instanceof GatewayFailure && e.code === 'authentication');
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
});
