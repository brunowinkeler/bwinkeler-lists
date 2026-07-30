import type { FastifyInstance } from 'fastify';

interface CachedResponse {
  status: number;
  body: string;
  contentType: string;
  expiresAt: number;
}

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 1000;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Optional idempotency for state-changing API requests. When a client sends an
 * `Idempotency-Key` header, a retried request replays the original response
 * instead of applying the change again.
 */
export function registerIdempotency(app: FastifyInstance): void {
  const store = new Map<string, CachedResponse>();

  const prune = (): void => {
    while (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  };

  app.decorateRequest('idempotencyKey', null);

  app.addHook('preHandler', async (request, reply) => {
    if (!MUTATING.has(request.method) || !request.url.startsWith('/api') || !request.user) {
      return;
    }
    const header = request.headers['idempotency-key'];
    if (typeof header !== 'string' || header.length === 0) {
      return;
    }
    const key = `${request.user.id}:${header}`;
    const cached = store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return reply.header('content-type', cached.contentType).code(cached.status).send(cached.body);
    }
    request.idempotencyKey = key;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const key = request.idempotencyKey;
    if (key && typeof payload === 'string') {
      const contentType = reply.getHeader('content-type');
      store.set(key, {
        status: reply.statusCode,
        body: payload,
        contentType: typeof contentType === 'string' ? contentType : 'application/json',
        expiresAt: Date.now() + TTL_MS,
      });
      prune();
    }
    return payload;
  });
}
