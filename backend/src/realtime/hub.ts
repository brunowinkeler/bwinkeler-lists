import type * as WS from 'ws';
import type { ServerMessage } from '@bwinkeler-lists/shared';
import type { Database } from '../db/client.js';
import { loadListSnapshot } from './snapshot.js';

const WS_OPEN = 1;

export interface Connection {
  socket: WS.WebSocket;
  userId: string;
  subscriptions: Set<string>;
  isAlive: boolean;
}

export class RealtimeHub {
  private readonly subscribers = new Map<string, Set<Connection>>();
  private readonly allConnections = new Set<Connection>();

  constructor(private readonly db: Database) {}

  addConnection(socket: WS.WebSocket, userId: string): Connection {
    const connection: Connection = { socket, userId, subscriptions: new Set(), isAlive: true };
    this.allConnections.add(connection);
    return connection;
  }

  subscribe(connection: Connection, listId: string): void {
    let set = this.subscribers.get(listId);
    if (!set) {
      set = new Set();
      this.subscribers.set(listId, set);
    }
    set.add(connection);
    connection.subscriptions.add(listId);
  }

  unsubscribe(connection: Connection, listId: string): void {
    this.dropSubscriber(listId, connection);
    connection.subscriptions.delete(listId);
  }

  removeConnection(connection: Connection): void {
    for (const listId of connection.subscriptions) {
      this.dropSubscriber(listId, connection);
    }
    connection.subscriptions.clear();
    this.allConnections.delete(connection);
  }

  send(connection: Connection, message: ServerMessage): void {
    if (connection.socket.readyState === WS_OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  broadcast(listId: string, message: ServerMessage): void {
    const set = this.subscribers.get(listId);
    if (!set) return;
    const data = JSON.stringify(message);
    for (const connection of set) {
      if (connection.socket.readyState === WS_OPEN) {
        connection.socket.send(data);
      }
    }
  }

  async sendSnapshot(connection: Connection, listId: string): Promise<void> {
    const snapshot = await loadListSnapshot(this.db, listId);
    if (snapshot) {
      this.send(connection, { type: 'snapshot', snapshot });
    }
  }

  async publishSnapshot(listId: string): Promise<void> {
    const set = this.subscribers.get(listId);
    if (!set || set.size === 0) return;
    const snapshot = await loadListSnapshot(this.db, listId);
    if (snapshot) {
      this.broadcast(listId, { type: 'snapshot', snapshot });
    }
  }

  publishDeleted(listId: string): void {
    const set = this.subscribers.get(listId);
    if (!set) return;
    for (const connection of set) {
      this.send(connection, { type: 'deleted', listId });
      connection.subscriptions.delete(listId);
    }
    this.subscribers.delete(listId);
  }

  revokeUser(listId: string, userId: string): void {
    const set = this.subscribers.get(listId);
    if (!set) return;
    for (const connection of [...set]) {
      if (connection.userId === userId) {
        this.send(connection, { type: 'revoked', listId });
        set.delete(connection);
        connection.subscriptions.delete(listId);
      }
    }
    if (set.size === 0) {
      this.subscribers.delete(listId);
    }
  }

  get connections(): Connection[] {
    return [...this.allConnections];
  }

  private dropSubscriber(listId: string, connection: Connection): void {
    const set = this.subscribers.get(listId);
    if (!set) return;
    set.delete(connection);
    if (set.size === 0) {
      this.subscribers.delete(listId);
    }
  }
}
