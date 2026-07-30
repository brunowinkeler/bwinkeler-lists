import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { loginInputSchema, type PublicUser } from '@bwinkeler-lists/shared';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { createSession, randomToken, revokeSession } from '../../auth/session.js';
import { clearSessionCookie, issueCsrfToken, setSessionCookie } from '../../auth/cookies.js';
import { requireAuth } from '../../auth/guards.js';
import { users } from '../../db/schema.js';

let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomToken());
  return dummyHashPromise;
}

function toPublicUser(row: {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}): PublicUser {
  return { id: row.id, email: row.email, displayName: row.displayName, isAdmin: row.isAdmin };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const { config, db } = app;

  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = loginInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request' });
      }
      const { email, password } = parsed.data;
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = rows[0];

      let validPassword = false;
      if (user) {
        validPassword = await verifyPassword(user.passwordHash, password);
      } else {
        // Equalize timing whether or not the account exists (no user enumeration).
        await verifyPassword(await getDummyHash(), password).catch(() => undefined);
      }

      if (!user || !validPassword) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }

      const { token, expiresAt } = await createSession(db, user.id, config.SESSION_TTL_HOURS);
      setSessionCookie(reply, config, token, expiresAt);
      issueCsrfToken(reply, config);
      return reply.send({ user: toPublicUser(user) });
    },
  );

  app.post('/logout', { preHandler: requireAuth }, async (request, reply) => {
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    if (token) {
      await revokeSession(db, token);
    }
    clearSessionCookie(reply, config);
    return reply.code(204).send();
  });

  app.get('/me', async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    return reply.send({ user: request.user });
  });

  app.get('/csrf', async (request, reply) => {
    const existing = request.cookies[config.CSRF_COOKIE_NAME];
    const token = existing ?? issueCsrfToken(reply, config);
    return reply.send({ csrfToken: token });
  });
}
