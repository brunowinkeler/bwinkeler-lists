import type { AppConfig } from '../config.js';
import type { Database } from '../db/client.js';
import type { SessionUser } from '../auth/session.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: Database;
  }

  interface FastifyRequest {
    user: SessionUser | null;
  }
}
