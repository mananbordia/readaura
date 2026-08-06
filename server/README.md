# ReadAura club backend

Hono + Drizzle + Postgres. Runs **only** on the self-hosted Oracle box — never
on Vercel. Browsers reach it through Nginx at `/readaura-api/*`; the Hono
listener is bound to `127.0.0.1` and is not publicly reachable. Excluded from
the root Next.js build, typecheck, and ESLint.

## Local dev

```bash
cd server
npm install
cp .env.example .env   # fill in DATABASE_URL and CLUB_JWT_SECRET
npm run db:generate    # generate the SQL migration from src/db/schema.ts
npm run db:migrate     # apply it to the database in DATABASE_URL
npm run dev            # tsx watch on :8080
```

## Routes (Phase 1)

- `GET /health` — liveness through loopback/Nginx.
- `POST /auth/join` — `{ inviteCode, displayName }` → member JWT + one-time recovery code.
- `POST /auth/recover` — `{ recoveryCode }` → re-issue JWT for the same userId, rotate the code.

All routes except `/health` must arrive through local Nginx. Data routes
independently verify the member JWT; `join` and `recover` are public and
rate-limited. Phase 2 adds `/docs` + `/blob`; Phase 3 adds `/annotations`; the
personal-sync track adds `/sync`.

See [../docs/self-host-oracle.md](../docs/self-host-oracle.md) for the bare-metal
deploy (systemd, Postgres, Oracle Security List, backups).
