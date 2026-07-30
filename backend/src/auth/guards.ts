import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    reply.code(401);
    await reply.send({ error: 'Authentication required' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    reply.code(401);
    await reply.send({ error: 'Authentication required' });
    return;
  }
  if (!request.user.isAdmin) {
    reply.code(403);
    await reply.send({ error: 'Administrator access required' });
  }
}
