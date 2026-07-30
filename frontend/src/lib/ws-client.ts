import type { ClientMessage, ServerMessage } from '@bwinkeler-lists/shared';

type Listener = (message: ServerMessage) => void;

const MAX_BACKOFF_MS = 15_000;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private readonly subscriptions = new Set<string>();
  private readonly listeners = new Set<Listener>();
  private reconnectAttempts = 0;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.subscriptions.clear();
    this.socket?.close();
    this.socket = null;
  }

  subscribe(listId: string): void {
    this.subscriptions.add(listId);
    this.sendRaw({ type: 'subscribe', listId });
  }

  unsubscribe(listId: string): void {
    this.subscriptions.delete(listId);
    this.sendRaw({ type: 'unsubscribe', listId });
  }

  addListener(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      // Re-subscribe on (re)connect so the server sends fresh snapshots.
      for (const listId of this.subscriptions) {
        this.sendRaw({ type: 'subscribe', listId });
      }
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      for (const listener of this.listeners) {
        listener(message);
      }
    });
    socket.addEventListener('close', () => {
      this.socket = null;
      if (this.running) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  private scheduleReconnect(): void {
    const backoff = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_BACKOFF_MS);
    const jitter = Math.random() * 1000;
    this.reconnectAttempts += 1;
    window.setTimeout(() => {
      if (this.running) this.connect();
    }, backoff + jitter);
  }

  private sendRaw(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}

export const realtime = new RealtimeClient();
