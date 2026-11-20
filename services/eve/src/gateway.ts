import { createGateway } from '@ai-sdk/gateway';
import { modelConfig } from './config.js';

export type Failure = 'configuration_missing' | 'invalid_model' | 'authentication' | 'model_unavailable' | 'rate_limit' | 'timeout' | 'cancelled' | 'network' | 'internal' | 'invalid_response';
export class GatewayFailure extends Error {
  readonly isRetryable = false;
  constructor(readonly code: Failure) { super(code); this.name = 'GatewayFailure'; }
}
export function classify(error: unknown, signal?: AbortSignal): Failure {
  if (error instanceof GatewayFailure) return error.code;
  if (signal?.aborted) return signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled';
  const e = error as { statusCode?: number; status?: number; name?: string } | null;
  const status = e?.statusCode ?? e?.status;
  if (status === 401 || status === 403) return 'authentication';
  if (status === 404 || status === 400) return 'model_unavailable';
  if (status === 429) return 'rate_limit';
  if (e?.name === 'TimeoutError') return 'timeout';
  if (e?.name === 'AbortError') return 'cancelled';
  if (error instanceof TypeError) return 'network';
  return 'internal';
}
async function within<T>(run: () => PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([run(), cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
export const MAX_OUTPUT_TOKENS = 256;
export const CALL_TIMEOUT_MS = 15000;
type Model = ReturnType<ReturnType<typeof createGateway>>;
type Options = Parameters<Model['doGenerate']>[0];
export type Audit = (record: Record<string, unknown>) => void;
const audit: Audit = record => console.info(JSON.stringify(record));

// This boundary is shared by Eve and the explicit one-shot diagnostic.
export function controlledModel(model: Model, log: Audit = audit, timeoutMs = CALL_TIMEOUT_MS): Model {
  function options(input: Options) {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = input.abortSignal ? AbortSignal.any([input.abortSignal, deadline]) : deadline;
    return { ...input, abortSignal: signal, maxOutputTokens: Math.min(input.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS) };
  }
  function report(start: number, status: string, usage?: unknown) {
    const u = usage as { inputTokens?: { total?: number }; outputTokens?: { total?: number } } | undefined;
    const safe = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
    // Never serialize provider errors, metadata, headers, request or response bodies.
    log({ event: 'gateway_call', mode: 'real', model: model.modelId, status, durationMs: Date.now() - start,
      inputTokens: safe(u?.inputTokens?.total), outputTokens: safe(u?.outputTokens?.total) });
  }
  return new Proxy(model, { get(target, property) {
    if (property === 'doGenerate') return async (input: Options) => {
      const start = Date.now(); const opts = options(input);
      try {
        const result = await within(() => target.doGenerate(opts), opts.abortSignal);
        if (!result.content?.length) throw new GatewayFailure('invalid_response');
        report(start, 'completed', result.usage);
        return result;
      } catch (error) { const code = classify(error, opts.abortSignal); report(start, code); throw new GatewayFailure(code); }
    };
    if (property === 'doStream') return async (input: Options) => {
      const start = Date.now(); const opts = options(input);
      try {
        const result = await within(() => target.doStream(opts), opts.abortSignal);
        const reader = result.stream.getReader();
        let finished = false;
        return { ...result, stream: new ReadableStream({
          async pull(controller) {
            try {
              const next = await within(() => reader.read(), opts.abortSignal);
              if (next.done) { if (!finished) throw new GatewayFailure('invalid_response'); controller.close(); return; }
              if (next.value.type === 'error') throw next.value.error;
              if (next.value.type === 'finish') { finished = true; report(start, 'completed', next.value.usage); }
              controller.enqueue(next.value);
            } catch (error) { const code = classify(error, opts.abortSignal); report(start, code); controller.error(new GatewayFailure(code)); void reader.cancel().catch(() => {}); }
          },
          cancel() { report(start, 'cancelled'); return reader.cancel(); },
        }) };
      } catch (error) { const code = classify(error, opts.abortSignal); report(start, code); throw new GatewayFailure(code); }
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
export function realModel(env: NodeJS.ProcessEnv = process.env, log?: Audit) {
  let model: string;
  try { model = modelConfig(env); }
  catch { throw new GatewayFailure(!env.JARVIS_MODEL?.trim() || !env.AI_GATEWAY_API_KEY?.trim() ? 'configuration_missing' : 'invalid_model'); }
  // Use the official default endpoint; no arbitrary endpoint or OIDC fallback.
  return controlledModel(createGateway({ apiKey: env.AI_GATEWAY_API_KEY!.trim() })(model), log);
}
