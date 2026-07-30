import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import { loadDbConfig } from '../config.js';
import { createDatabase, waitForDatabase } from '../db/client.js';
import { items, listMembers, lists, users } from '../db/schema.js';

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected at least one row from insert');
  }
  return row;
}

async function main(): Promise<void> {
  const config = loadDbConfig();
  const { pool, db } = createDatabase(config);
  await waitForDatabase(pool);

  const adminEmail = 'admin@example.test';
  const existing = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing.length > 0) {
    console.log('Seed already applied; skipping.');
    await pool.end();
    return;
  }

  const passwordHash = await argon2.hash('dev-password-change-me', { type: argon2.argon2id });

  const admin = first(
    await db
      .insert(users)
      .values({ email: adminEmail, passwordHash, displayName: 'Admin', isAdmin: true })
      .returning(),
  );
  const member = first(
    await db
      .insert(users)
      .values({ email: 'member@example.test', passwordHash, displayName: 'Member' })
      .returning(),
  );

  const shopping = first(
    await db
      .insert(lists)
      .values({ ownerId: admin.id, name: 'Groceries', kind: 'simple' })
      .returning(),
  );
  await db.insert(listMembers).values([
    { listId: shopping.id, userId: admin.id, role: 'owner' },
    { listId: shopping.id, userId: member.id, role: 'editor' },
  ]);
  const shoppingPositions = generateNKeysBetween(null, null, 3) as [string, string, string];
  await db.insert(items).values([
    { listId: shopping.id, title: 'Milk', position: shoppingPositions[0], createdBy: admin.id },
    { listId: shopping.id, title: 'Bread', position: shoppingPositions[1], createdBy: admin.id },
    {
      listId: shopping.id,
      title: 'Eggs',
      position: shoppingPositions[2],
      status: 'done',
      createdBy: member.id,
    },
  ]);

  const tasks = first(
    await db
      .insert(lists)
      .values({ ownerId: admin.id, name: 'Home tasks', kind: 'task' })
      .returning(),
  );
  await db.insert(listMembers).values({ listId: tasks.id, userId: admin.id, role: 'owner' });
  const taskPositions = generateNKeysBetween(null, null, 2) as [string, string];
  await db.insert(items).values([
    {
      listId: tasks.id,
      title: 'Fix the sink',
      position: taskPositions[0],
      notes: 'Call the plumber',
      createdBy: admin.id,
    },
    {
      listId: tasks.id,
      title: 'Plan the trip',
      position: taskPositions[1],
      assigneeId: admin.id,
      createdBy: admin.id,
    },
  ]);

  console.log('Seed complete.');
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
