import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eveChannel, type EveAuthFn } from 'eve/channels/eve';
import { ForbiddenError, routeAuth } from 'eve/channels/auth';

// Local single-instance ownership store; replace with PostgreSQL before scaling.
export function jarvisChannel(authenticate: EveAuthFn) {
  const callers = new WeakMap<Request, Awaited<ReturnType<EveAuthFn>>>();
  const auth: EveAuthFn = async req => {
    if (callers.has(req)) return callers.get(req);
    const caller = await authenticate(req);
    callers.set(req, caller);
    return caller;
  };
  const channel = eveChannel({ auth, uploadPolicy: 'disabled', cors: false,
    onMessage: (ctx, message) => {
      const text = typeof message === 'string' ? message : message.map(p => p.type === 'text' ? p.text : '').join('');
      if (!text.trim() || text.length > 8000) throw new ForbiddenError({ message: 'Mensagem inválida (1–8000 caracteres).' });
      return { auth: ctx.eve.caller };
    },
  });
  const root = resolve('.eve/jarvis-owners');
  const fail = (status: number, code: string) => Response.json({ ok: false, error: code }, { status });
  const validId = (id: string) => /^[a-zA-Z0-9_-]{1,200}$/.test(id);
  return { ...channel, routes: channel.routes.map(route => {
    if (route.transport === 'websocket') throw new Error('WebSocket não autorizado.');
    return { ...route, handler: async (req, ctx) => {
      if (route.path === '/eve/v1/health') return route.handler(req, ctx);
      const caller = await routeAuth(req, auth);
      if (caller instanceof Response) return caller;
      if (!caller || caller.principalType !== 'user') return fail(401, 'authentication_required');
      // Limit the actual stream, including requests without Content-Length.
      if (req.body) {
        const reader = req.clone().body!.getReader();
        let bytes = 0;
        const signal = AbortSignal.timeout(5000);
        const deadline = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }));
        try {
          while (true) {
            const chunk = await Promise.race([reader.read(), deadline]);
            if (chunk.done) break;
            bytes += chunk.value.length;
            if (bytes > 16384) return fail(413, 'request_too_large');
          }
        } catch { return fail(408, 'request_timeout'); }
        finally { void reader.cancel().catch(() => {}); }
      }
      const id = ctx.params.sessionId ?? ctx.params.parentSessionId;
      if (id) {
        if (!validId(id)) return fail(404, 'session_unavailable');
        try {
          const owner = await readFile(resolve(root, id), 'utf8');
          if (owner !== caller.principalId) return fail(404, 'session_unavailable');
        } catch { return fail(404, 'session_unavailable'); }
      }
      try {
        const response = await route.handler(req, ctx);
        if (route.method === 'POST' && route.path === '/eve/v1/session' && response.ok) {
          const body = await response.clone().json() as { sessionId?: string };
          if (!body.sessionId || !validId(body.sessionId)) return fail(500, 'session_creation_failed');
          await mkdir(root, { recursive: true, mode: 0o700 });
          try {
            await writeFile(resolve(root, body.sessionId), caller.principalId, { flag: 'wx', mode: 0o600 });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(resolve(root, body.sessionId), 'utf8') !== caller.principalId) throw error;
          }
        }
        return response;
      } catch {
        console.error(JSON.stringify({ event: 'request_failed' }));
        return fail(500, 'request_failed');
      }
    } };
  }) } satisfies typeof channel;
}
