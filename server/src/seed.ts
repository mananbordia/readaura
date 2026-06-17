import { hash as argonHash } from '@node-rs/argon2';
import { db } from './db/client';
import { clubs } from './db/schema';
import { env } from './env';

// Create the single club on first start if none exists and an invite code is
// configured. Idempotent: a no-op once a club row is present.
export async function ensureSeed(): Promise<void> {
  const existing = await db.select().from(clubs).limit(1);
  if (existing.length > 0) return;
  if (!env.CLUB_INVITE_CODE) {
    console.warn('[club] no club yet and CLUB_INVITE_CODE unset — set it and restart to create the club.');
    return;
  }
  const inviteCodeHash = await argonHash(env.CLUB_INVITE_CODE);
  await db.insert(clubs).values({ name: env.CLUB_NAME, inviteCodeHash });
  console.log(`[club] seeded club "${env.CLUB_NAME}".`);
}
