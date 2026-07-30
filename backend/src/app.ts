import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from './config.js';
import type { Database } from './db/client.js';
import { issueCsrfToken } from './auth/cookies.js';
import { resolveSession, safeEqual } from './auth/session.js';
import { registerHealthRoutes } from './health/routes.js';
import { registerAuthRoutes } from './modules/auth/routes.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildApp(config: AppConfig, db: Database): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        remove: true,
      },
    },
  });

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorateRequest('user', null);

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // Resolve the session (only when a cookie is present) and make sure API
  // clients always have a CSRF cookie to echo back.
  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    request.user = token ? await resolveSession(db, token) : null;
    if (request.url.startsWith('/api') && !request.cookies[config.CSRF_COOKIE_NAME]) {
      issueCsrfToken(reply, config);
    }
  });

  // Double-submit CSRF check for state-changing API requests.
  app.addHook('preHandler', async (request, reply) => {
    if (MUTATING_METHODS.has(request.method) && request.url.startsWith('/api')) {
      const cookieToken = request.cookies[config.CSRF_COOKIE_NAME];
      const headerToken = request.headers['x-csrf-token'];
      if (!cookieToken || typeof headerToken !== 'string' || !safeEqual(cookieToken, headerToken)) {
        return reply.code(403).send({ error: 'Invalid CSRF token' });
      }
    }
  });

  await app.register(registerHealthRoutes);
  await app.register(registerAuthRoutes, { prefix: '/api/auth' });

  return app;
}
