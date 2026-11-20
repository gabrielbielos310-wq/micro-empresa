import { realModel, GatewayFailure, classify } from '../services/eve/src/gateway.js';

// Never imported by automated tests; no call without the administrator's flag.
async function main() {
  if (process.argv.slice(2).join(' ') !== '--authorize-one-real-call') {
    throw new GatewayFailure('configuration_missing');
  }
  const model = realModel();
  const result = await model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Responda apenas: Jarvis operacional.' }] }],
    maxOutputTokens: 32,
  });
  const text = result.content.filter(p => p.type === 'text').map(p => p.text).join('').trim();
  if (text !== 'Jarvis operacional.') throw new GatewayFailure('invalid_response');
  console.info(JSON.stringify({ event: 'connectivity_check', mode: 'real', status: 'completed', expectedResponseMatched: true }));
}
main().catch(error => { console.error(JSON.stringify({ event: 'connectivity_check', mode: 'real', status: classify(error) })); process.exitCode = 1; });
