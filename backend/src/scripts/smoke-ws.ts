import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase, waitForDatabase } from '../db/client.js';

type CookieJar = Record<string, string>;

function storeCookies(jar: CookieJar, setCookies: string[]): void {
  for (const cookie of setCookies) {
    const pair = cookie.split(';', 1)[0] ?? '';
    const index = pair.indexOf('=');
    if (index === -1) continue;
    jar[pair.slice(0, index)] = pair.slice(index + 1);
  }
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function nextMessage(socket: WebSocket, timeoutMs = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for a WebSocket message'));
    }, timeoutMs);
    function onMessage(data: Buffer): void {
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(JSON.parse(data.toString()));
    }
    socket.on('message', onMessage);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { pool, db } = createDatabase(config);
  await waitForDatabase(pool);
  const app = await buildApp(config, db);
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const jar: CookieJar = {};

  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  storeCookies(jar, csrfRes.headers.getSetCookie());
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const jsonHeaders = (): Record<string, string> => ({
    'content-type': 'application/json',
    'x-csrf-token': jar[config.CSRF_COOKIE_NAME] ?? csrfToken,
    cookie: cookieHeader(jar),
  });

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email: 'admin@example.test', password: 'dev-password-change-me' }),
  });
  assert.equal(loginRes.status, 200, 'login');
  storeCookies(jar, loginRes.headers.getSetCookie());

  const listRes = await fetch(`${base}/api/lists`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ name: 'WS smoke list', kind: 'task' }),
  });
  assert.equal(listRes.status, 201, 'create list');
  const listId = ((await listRes.json()) as { list: { id: string } }).list.id;

  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
    headers: { cookie: cookieHeader(jar), origin: config.PUBLIC_ORIGIN },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => {
      resolve();
    });
    socket.once('error', reject);
  });

  socket.send(JSON.stringify({ type: 'subscribe', listId }));
  const first = (await nextMessage(socket)) as {
    type: string;
    snapshot?: { listId: string; items: unknown[] };
  };
  assert.equal(first.type, 'snapshot', 'subscribe returns a snapshot');
  assert.equal(first.snapshot?.listId, listId, 'snapshot is for the subscribed list');
  const initialItemCount = first.snapshot?.items.length ?? -1;

  const broadcast = nextMessage(socket);
  const itemRes = await fetch(`${base}/api/lists/${listId}/items`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ title: 'Realtime item' }),
  });
  assert.equal(itemRes.status, 201, 'create item over REST');
  const event = (await broadcast) as { type: string; snapshot?: { items: unknown[] } };
  assert.equal(event.type, 'snapshot', 'mutation broadcasts a snapshot');
  assert.equal(
    event.snapshot?.items.length,
    initialItemCount + 1,
    'broadcast reflects the new item',
  );

  console.log('WS SMOKE OK: subscribe snapshot + realtime broadcast verified');
  socket.close();
  await app.close();
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('WS SMOKE FAILED');
  console.error(error);
  process.exit(1);
});
