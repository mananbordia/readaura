// Validated environment for the club backend. Required vars fail fast on
// startup so a misconfigured box never serves with half a config.

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[club] missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  CLUB_JWT_SECRET: required('CLUB_JWT_SECRET'),
  /** Only the Vercel proxy knows this; every non-health route requires it. */
  CLUB_PROXY_SECRET: required('CLUB_PROXY_SECRET'),
  PORT: Number(process.env.PORT ?? 8080),
  /** Content-addressed blob store (snapshot HTML + PDF bytes). */
  CLUB_BLOB_DIR: process.env.CLUB_BLOB_DIR ?? '/home/ubuntu/readaura/blobs',
  CLUB_NAME: process.env.CLUB_NAME ?? 'ReadAura Club',
  SYNC_MAX_BYTES: Number(process.env.SYNC_MAX_BYTES ?? 5_000_000),
};
