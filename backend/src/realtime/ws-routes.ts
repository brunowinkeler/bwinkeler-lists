import type { FastifyInstance } from 'fastify';
import type * as WS from 'ws';
import { clientMessageSchema } from '@bwinkeler-lists/shared';
import { getListRole } from '../authz.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function registerWebSocketRoutes(app: FastifyInstance): Promise<void> {
  const { db, hub, config } = app;

  const heartbeat = setInterval(() => {
    for (const connection of hub.connections) {
      if (!connection.isAlive) {
        connection.socket.terminate();
        continue;
      }
      connection.isAlive = false;
      connection.socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
  });

  app.get('/ws', { websocket: true }, (socket, request) => {
    const { user } = request;
    if (!user) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    const origin = request.headers.origin;
    if (origin && origin !== config.PUBLIC_ORIGIN) {
      socket.close(1008, 'Forbidden origin');
      return;
    }

    const userId = user.id;
    const connection = hub.addConnection(socket, userId);

    socket.on('pong', () => {
      connection.isAlive = true;
    });
    socket.on('close', () => {
      hub.removeConnection(connection);
    });
    socket.on('message', (raw: WS.RawData) => {
      void handleMessage(raw);
    });

    async function handleMessage(raw: WS.RawData): Promise<void> {
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        hub.send(connection, { type: 'error', message: 'Invalid message' });
        return;
      }
      const parsed = clientMessageSchema.safeParse(payload);
      if (!parsed.success) {
        hub.send(connection, { type: 'error', message: 'Invalid message' });
        return;
      }
      const message = parsed.data;
      if (message.type === 'ping') {
        hub.send(connection, { type: 'pong' });
        return;
      }
      if (message.type === 'unsubscribe') {
        hub.unsubscribe(connection, message.listId);
        return;
      }
      const role = await getListRole(db, message.listId, userId);
      if (!role) {
        hub.send(connection, { type: 'error', message: 'Not a member of the list' });
        return;
      }
      hub.subscribe(connection, message.listId);
      await hub.sendSnapshot(connection, message.listId);
    }
  });
}
