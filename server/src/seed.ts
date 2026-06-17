import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db/client';
import { clubs, invites, memberships } from './db/schema';
import { genRecoveryParts, hashSecret } from './lib/auth';
import { env } from './env';

// Ensure the single club exists, and that the club can be bootstrapped: if no
// owner has joined yet and there's no outstanding owner invite, mint a single-
// use owner invite and print it once. The operator reads it from the logs
// (`journalctl -u readaura-club`), joins to become owner, then mints member
// invites from the app.
export async function ensureSeed(): Promise<void> {
  let [club] = await db.select().from(clubs).limit(1);
  if (!club) {
    [club] = await db.insert(clubs).values({ name: env.CLUB_NAME }).returning();
    console.log(`[club] created club "${env.CLUB_NAME}".`);
  }

  const owner = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.role, 'owner'))
    .limit(1);
  if (owner.length > 0) return;

  const outstanding = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.clubId, club.id), eq(invites.role, 'owner'), isNull(invites.usedAt)))
    .limit(1);
  if (outstanding.length > 0) {
    console.log('[club] a bootstrap owner invite is still outstanding (see an earlier log line).');
    return;
  }

  const rec = genRecoveryParts();
  await db.insert(invites).values({
    clubId: club.id,
    locator: rec.locator,
    secretHash: await hashSecret(rec.secret),
    role: 'owner',
    label: 'bootstrap owner',
  });
  console.log('[club] ──────────────────────────────────────────────');
  console.log(`[club] BOOTSTRAP OWNER INVITE (single-use): ${rec.code}`);
  console.log('[club] Join once with this code to become owner, then mint member invites.');
  console.log('[club] ──────────────────────────────────────────────');
}
