import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDatabase, waitForDatabase } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { users } from '../db/schema.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      admin: { type: 'boolean', default: false },
    },
  });

  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const password = process.env.CREATE_USER_PASSWORD;

  if (!email || !name || !password) {
    console.error(
      'Usage: CREATE_USER_PASSWORD=<password> tsx src/scripts/create-user.ts --email <email> --name <name> [--admin]',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const config = loadConfig();
  const { pool, db } = createDatabase(config);
  await waitForDatabase(pool);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    console.error('A user with that email already exists.');
    await pool.end();
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, displayName: name, passwordHash, isAdmin: values.admin });
  console.log(`Created ${values.admin ? 'admin ' : ''}user ${email}.`);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
