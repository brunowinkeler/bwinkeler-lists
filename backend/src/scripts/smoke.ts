import assert from 'node:assert/strict';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase, waitForDatabase } from '../db/client.js';

type CookieJar = Record<string, string>;

function mergeCookies(jar: CookieJar, setCookie: string | string[] | undefined): void {
  if (!setCookie) return;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const cookie of cookies) {
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

async function main(): Promise<void> {
  const config = loadConfig();
  const { pool, db } = createDatabase(config);
  await waitForDatabase(pool);
  const app = await buildApp(config, db);
  await app.ready();

  const jar: CookieJar = {};
  let csrf = '';
  const auth = (): Record<string, string> => ({ cookie: cookieHeader(jar), 'x-csrf-token': csrf });

  let res = await app.inject({ method: 'GET', url: '/health/live' });
  assert.equal(res.statusCode, 200, 'health/live');

  res = await app.inject({ method: 'GET', url: '/health/ready' });
  assert.equal(res.statusCode, 200, 'health/ready');

  res = await app.inject({ method: 'GET', url: '/api/auth/csrf' });
  mergeCookies(jar, res.headers['set-cookie']);
  csrf = jar[config.CSRF_COOKIE_NAME] ?? '';
  assert.ok(csrf.length > 0, 'csrf token issued');

  res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { cookie: cookieHeader(jar) },
    payload: { email: 'admin@example.test', password: 'dev-password-change-me' },
  });
  assert.equal(res.statusCode, 403, 'login without CSRF header is blocked');

  res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: auth(),
    payload: { email: 'admin@example.test', password: 'wrong-password' },
  });
  assert.equal(res.statusCode, 401, 'wrong password rejected');

  res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: auth(),
    payload: { email: 'admin@example.test', password: 'dev-password-change-me' },
  });
  assert.equal(res.statusCode, 200, 'login succeeds');
  mergeCookies(jar, res.headers['set-cookie']);
  csrf = jar[config.CSRF_COOKIE_NAME] ?? csrf;

  res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { cookie: cookieHeader(jar) },
  });
  assert.equal(res.statusCode, 200, 'me returns the session user');

  res = await app.inject({
    method: 'POST',
    url: '/api/lists',
    headers: auth(),
    payload: { name: 'Smoke list', kind: 'task' },
  });
  assert.equal(res.statusCode, 201, 'create list');
  const listId = (JSON.parse(res.body) as { list: { id: string } }).list.id;

  res = await app.inject({
    method: 'POST',
    url: `/api/lists/${listId}/items`,
    headers: auth(),
    payload: { title: 'Smoke item', notes: 'from smoke test' },
  });
  assert.equal(res.statusCode, 201, 'create item');
  const itemId = (JSON.parse(res.body) as { item: { id: string } }).item.id;

  res = await app.inject({
    method: 'PATCH',
    url: `/api/items/${itemId}`,
    headers: auth(),
    payload: { status: 'done' },
  });
  assert.equal(res.statusCode, 200, 'update item status');

  res = await app.inject({
    method: 'GET',
    url: `/api/lists/${listId}`,
    headers: { cookie: cookieHeader(jar) },
  });
  assert.equal(res.statusCode, 200, 'list detail');
  const detail = JSON.parse(res.body) as {
    list: { version: number };
    items: { status: string }[];
    members: unknown[];
  };
  assert.equal(detail.items.length, 1, 'one item present');
  assert.equal(detail.items[0]?.status, 'done', 'item is done');
  assert.ok(detail.list.version >= 2, 'list version bumped by mutations');
  assert.equal(detail.members.length, 1, 'owner is a member');

  res = await app.inject({
    method: 'POST',
    url: `/api/lists/${listId}/invitations`,
    headers: auth(),
    payload: { email: 'member@example.test' },
  });
  assert.equal(res.statusCode, 201, 'invite existing user');

  res = await app.inject({
    method: 'POST',
    url: '/api/lists',
    headers: auth(),
    payload: { name: 'Simple smoke', kind: 'simple' },
  });
  const simpleId = (JSON.parse(res.body) as { list: { id: string } }).list.id;
  res = await app.inject({
    method: 'POST',
    url: `/api/lists/${simpleId}/items`,
    headers: auth(),
    payload: { title: 'x', notes: 'not allowed' },
  });
  assert.equal(res.statusCode, 400, 'simple list rejects task fields');

  console.log('SMOKE OK: all API assertions passed');
  await app.close();
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('SMOKE FAILED');
  console.error(error);
  process.exit(1);
});
