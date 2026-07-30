import type { AppConfig } from '../config.js';
import type { Database } from '../db/client.js';
import type { SessionUser } from '../auth/session.js';
import type { RealtimeHub } from '../realtime/hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: Database;
    hub: RealtimeHub;
  }

  interface FastifyRequest {
    user: SessionUser | null;
    idempotencyKey: string | null;
  }
}
