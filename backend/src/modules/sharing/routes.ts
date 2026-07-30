import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { type InvitationDto, inviteInputSchema } from '@bwinkeler-lists/shared';
import { getSessionUser } from '../../auth/guards.js';
import { getListRole } from '../../authz.js';
import { writeAudit } from '../../audit.js';
import { listInvitations, listMembers, lists, users } from '../../db/schema.js';
import { createNotification } from '../notifications/service.js';

export async function registerSharingRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.post<{ Params: { listId: string } }>('/lists/:listId/invitations', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { listId } = request.params;
    const role = await getListRole(db, listId, user.id);
    if (!role) return reply.code(404).send({ error: 'List not found' });
    if (role !== 'owner') return reply.code(403).send({ error: 'Only the owner can invite' });

    const parsed = inviteInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });

    const invitedRows = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    const invited = invitedRows[0];
    if (!invited) return reply.code(404).send({ error: 'No account with that email' });
    if (invited.id === user.id) {
      return reply.code(400).send({ error: 'You already own this list' });
    }
    if (await getListRole(db, listId, invited.id)) {
      return reply.code(409).send({ error: 'User is already a member' });
    }
    const pending = await db
      .select({ id: listInvitations.id })
      .from(listInvitations)
      .where(
        and(
          eq(listInvitations.listId, listId),
          eq(listInvitations.invitedUserId, invited.id),
          eq(listInvitations.status, 'pending'),
        ),
      )
      .limit(1);
    if (pending[0]) return reply.code(409).send({ error: 'An invitation is already pending' });

    const listRows = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    const list = listRows[0];
    if (!list) return reply.code(404).send({ error: 'List not found' });

    const rows = await db
      .insert(listInvitations)
      .values({ listId, invitedUserId: invited.id, invitedBy: user.id })
      .returning();
    const invitation = rows[0];
    if (!invitation) return reply.code(500).send({ error: 'Failed to create invitation' });

    await createNotification(db, invited.id, 'list_invitation', {
      listId,
      listName: list.name,
      invitedBy: user.displayName,
    });
    await writeAudit(db, {
      actorId: user.id,
      action: 'invitation.create',
      targetType: 'list',
      targetId: listId,
      metadata: { invitedUserId: invited.id },
    });

    const dto: InvitationDto = {
      id: invitation.id,
      listId,
      listName: list.name,
      invitedUserId: invited.id,
      invitedEmail: invited.email,
      status: invitation.status,
      createdAt: invitation.createdAt.toISOString(),
    };
    return reply.code(201).send({ invitation: dto });
  });

  app.get('/invitations', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const rows = await db
      .select({
        id: listInvitations.id,
        listId: listInvitations.listId,
        status: listInvitations.status,
        createdAt: listInvitations.createdAt,
        listName: lists.name,
        invitedEmail: users.email,
      })
      .from(listInvitations)
      .innerJoin(lists, eq(lists.id, listInvitations.listId))
      .innerJoin(users, eq(users.id, listInvitations.invitedUserId))
      .where(
        and(eq(listInvitations.invitedUserId, user.id), eq(listInvitations.status, 'pending')),
      );
    const invitations: InvitationDto[] = rows.map((row) => ({
      id: row.id,
      listId: row.listId,
      listName: row.listName,
      invitedUserId: user.id,
      invitedEmail: row.invitedEmail,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
    return reply.send({ invitations });
  });

  app.post<{ Params: { id: string } }>('/invitations/:id/accept', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const rows = await db
      .select()
      .from(listInvitations)
      .where(eq(listInvitations.id, request.params.id))
      .limit(1);
    const invitation = rows[0];
    if (!invitation || invitation.invitedUserId !== user.id || invitation.status !== 'pending') {
      return reply.code(404).send({ error: 'Invitation not found' });
    }
    await db.transaction(async (tx) => {
      await tx
        .insert(listMembers)
        .values({ listId: invitation.listId, userId: user.id, role: 'editor' })
        .onConflictDoNothing();
      await tx
        .update(listInvitations)
        .set({ status: 'accepted', respondedAt: new Date() })
        .where(eq(listInvitations.id, invitation.id));
    });
    await writeAudit(db, {
      actorId: user.id,
      action: 'invitation.accept',
      targetType: 'list',
      targetId: invitation.listId,
      metadata: { invitationId: invitation.id },
    });
    await app.hub.publishSnapshot(invitation.listId);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/invitations/:id/decline', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const rows = await db
      .select()
      .from(listInvitations)
      .where(eq(listInvitations.id, request.params.id))
      .limit(1);
    const invitation = rows[0];
    if (!invitation || invitation.invitedUserId !== user.id || invitation.status !== 'pending') {
      return reply.code(404).send({ error: 'Invitation not found' });
    }
    await db
      .update(listInvitations)
      .set({ status: 'declined', respondedAt: new Date() })
      .where(eq(listInvitations.id, invitation.id));
    await writeAudit(db, {
      actorId: user.id,
      action: 'invitation.decline',
      targetType: 'list',
      targetId: invitation.listId,
      metadata: { invitationId: invitation.id },
    });
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/invitations/:id', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const rows = await db
      .select()
      .from(listInvitations)
      .where(eq(listInvitations.id, request.params.id))
      .limit(1);
    const invitation = rows[0];
    if (!invitation || invitation.status !== 'pending') {
      return reply.code(404).send({ error: 'Invitation not found' });
    }
    const role = await getListRole(db, invitation.listId, user.id);
    if (role !== 'owner') {
      return reply.code(403).send({ error: 'Only the owner can cancel invitations' });
    }
    await db
      .update(listInvitations)
      .set({ status: 'cancelled', respondedAt: new Date() })
      .where(eq(listInvitations.id, invitation.id));
    await writeAudit(db, {
      actorId: user.id,
      action: 'invitation.cancel',
      targetType: 'list',
      targetId: invitation.listId,
      metadata: { invitationId: invitation.id },
    });
    return reply.code(204).send();
  });

  app.delete<{ Params: { listId: string; userId: string } }>(
    '/lists/:listId/members/:userId',
    async (request, reply) => {
      const user = getSessionUser(request, reply);
      if (!user) return;
      const { listId, userId } = request.params;
      const role = await getListRole(db, listId, user.id);
      if (!role) return reply.code(404).send({ error: 'List not found' });
      if (role !== 'owner') {
        return reply.code(403).send({ error: 'Only the owner can remove members' });
      }
      if (userId === user.id) {
        return reply.code(400).send({ error: 'The owner cannot be removed' });
      }
      const targetRole = await getListRole(db, listId, userId);
      if (!targetRole || targetRole === 'owner') {
        return reply.code(404).send({ error: 'Member not found' });
      }
      await db
        .delete(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)));
      await writeAudit(db, {
        actorId: user.id,
        action: 'member.remove',
        targetType: 'list',
        targetId: listId,
        metadata: { removedUserId: userId },
      });
      // The removed member's active WebSocket subscriptions are closed here so
      // they immediately stop receiving updates for this list.
      app.hub.revokeUser(listId, userId);
      await app.hub.publishSnapshot(listId);
      return reply.code(204).send();
    },
  );
}
