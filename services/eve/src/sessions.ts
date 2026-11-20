import { Client, type ClientSession } from 'eve/client';

export const planSchema = {
  type: 'object', additionalProperties: false,
  properties: { objective: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } }, limitations: { type: 'array', items: { type: 'string' } } },
  required: ['objective', 'steps', 'limitations'],
} as const;

// Server-side bridge adapter. Never send the administrator token to a browser.
export class JarvisSessions {
  private readonly client: Client;
  constructor(baseUrl: string, token: string, private readonly timeoutMs = 30000) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Transporte inseguro.');
    if (token.length < 32 || !Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('Configuração inválida.');
    this.client = new Client({ baseUrl, auth: { bearer: token } });
  }
  async create() { return (await this.client.sessions.create({ signal: AbortSignal.timeout(this.timeoutMs) })).session; }
  attach(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error('Sessão inválida.');
    return this.client.sessions.attach(id);
  }
  async execute(session: ClientSession, message: string, structured = false) {
    if (typeof message !== 'string' || !message.trim() || message.length > 8000) throw new Error('Mensagem inválida (1–8000 caracteres).');
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      const delivery = await session.send(message, { signal, ...(structured ? { outputSchema: planSchema } : {}) });
      const result = await delivery.result({ signal });
      if (result.status === 'failed') throw new Error('model_failed');
      return { reply: result.reply, data: result.data, sessionId: session.id, status: result.status };
    } catch {
      // No provider error text, request body, tokens or model content in logs.
      console.error(JSON.stringify({ event: 'execution_failed' }));
      try { await session.cancel({ signal: AbortSignal.timeout(3000) }); } catch {}
      throw new Error('Execução não concluída. Consulte a auditoria local.');
    }
  }
}
