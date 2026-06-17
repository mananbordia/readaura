# ReadAura club backend

Hono + Drizzle + Postgres. Runs **only** on the self-hosted Oracle box — never
on Vercel. The Vercel frontend reaches it through the `app/api/club/[...path]`
proxy (see the repo root). Excluded from the root Next.js build, typecheck, and
ESLint.

## Local dev

```bash
cd server
npm install
cp .env.example .env   # fill in DATABASE_URL, CLUB_JWT_SECRET, CLUB_PROXY_SECRET
npm run db:generate    # generate the SQL migration from src/db/schema.ts
npm run db:migrate     # apply it to the database in DATABASE_URL
npm run dev            # tsx watch on :8080
```

## Routes (Phase 1)

- `GET /health` — liveness (no proxy secret required).
- `POST /auth/join` — `{ inviteCode, displayName }` → member JWT + one-time recovery code.
- `POST /auth/recover` — `{ recoveryCode }` → re-issue JWT for the same userId, rotate the code.

All routes except `/health` require the `x-club-proxy-secret` header (set by the
Vercel proxy). Phase 2 adds `/docs` + `/blob`; Phase 3 adds `/annotations`; the
personal-sync track adds `/sync`.

See [../docs/self-host-oracle.md](../docs/self-host-oracle.md) for the bare-metal
deploy (systemd, Postgres, Oracle Security List, backups).
