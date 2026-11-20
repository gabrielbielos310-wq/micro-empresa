import { createHash, timingSafeEqual } from 'node:crypto';
import { ForbiddenError, UnauthenticatedError } from 'eve/channels/auth';
import type { EveAuthFn } from 'eve/channels/eve';

// Only server-provisioned identities are accepted. No anonymous/dev bypass.
export function adminAuth(env: NodeJS.ProcessEnv = process.env): EveAuthFn {
  const counts = new Map<string, { start: number; count: number }>();
  return (request) => {
    const configured = env.JARVIS_ADMIN_TOKEN;
    const id = env.JARVIS_ADMIN_ID?.trim();
    if (!configured || configured.length < 32 || !id) throw new UnauthenticatedError({ message: 'Administração não configurada.' });
    const supplied = request.headers.get('authorization') ?? '';
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (supplied.length > 4096 || !timingSafeEqual(digest(supplied), digest(`Bearer ${configured}`))) {
      console.info(JSON.stringify({ event: 'auth_rejected' }));
      throw new UnauthenticatedError({ message: 'Autenticação necessária.' });
    }
    const now = Date.now();
    const bucket = counts.get(id);
    if (!bucket || now - bucket.start >= 60_000) counts.set(id, { start: now, count: 1 });
    else if (++bucket.count > 60) throw new ForbiddenError({ message: 'Limite de requisições; tente novamente em um minuto.' });
    console.info(JSON.stringify({ event: 'request_authorized', method: request.method }));
    return { authenticator: 'jarvis-admin', principalId: id, principalType: 'user', attributes: { role: 'admin' } };
  };
}
