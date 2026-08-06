# Self-hosting the ReadAura club backend on Oracle Cloud

The club backend runs **only** on your own box. The Next.js frontend stays on
Vercel, while the browser calls the backend directly through the shared Nginx
HTTPS gateway. The old `app/api/club/[...path]` proxy remains temporarily for
cached/older clients during rollout.

```
Browser ──HTTPS──▶ Oracle Nginx /readaura-api/* ──HTTP/loopback──▶ :8080 (Hono) ──▶ Postgres
```

Target box (this guide's example): **Ubuntu 24.04, arm64 (Ampere A1), 1 vCPU /
6 GB**, public IP `134.185.90.180`, login user `ubuntu`. The backend listens on
`:8080`; Postgres is local-only.

The public hop is HTTPS with a trusted Let's Encrypt IP certificate. Nginx talks
to Hono only over loopback. Member routes authenticate the bearer JWT; the
browser never receives `CLUB_PROXY_SECRET`.

---

## 1. Install Node 20 + Postgres 16

```bash
# Node 20 (arm64)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Postgres 16
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

## 2. Create the database + user

```bash
sudo -u postgres psql <<'SQL'
CREATE USER readaura WITH PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE readaura_club OWNER readaura;
SQL
```

`gen_random_uuid()` is built into Postgres 13+, so no extension is needed.

## 3. Get the code + install

```bash
sudo mkdir -p /home/ubuntu/readaura && sudo chown ubuntu:ubuntu /home/ubuntu/readaura
git clone <your-repo> /home/ubuntu/readaura
cd /home/ubuntu/readaura/server
npm ci
```

## 4. Configure `server/.env`

```bash
cp .env.example .env
# Generate secrets:
openssl rand -base64 48   # -> CLUB_JWT_SECRET
openssl rand -base64 32   # -> CLUB_PROXY_SECRET  (also set this on Vercel)
```

```ini
DATABASE_URL=postgresql://readaura:CHANGE_ME_STRONG@localhost:5432/readaura_club
CLUB_JWT_SECRET=<from openssl>
CLUB_PROXY_SECRET=<from openssl — must match Vercel>
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,https://readaura-ai.vercel.app
PORT=8080
CLUB_NAME=ReadAura Club
SYNC_MAX_BYTES=5000000
```

There is no shared invite code. Membership uses **single-use, per-member
invites**: on first start the server prints a one-time **bootstrap owner
invite** to its logs — join once with it to become owner, then mint a member
invite per person from the in-app Club panel (Owner → "Invite a member").

## 5. Apply the schema

```bash
npm run db:migrate
```

## 6. Run it under systemd

The unit ships in the repo at `server/deploy/readaura-club.service` (mirrors the
box's `hft-scanner.service`: `User=ubuntu`, `Restart=always`, `MemoryMax`,
`NoNewPrivileges`, runs `tsx` directly). Install it:

```bash
sudo cp /home/ubuntu/readaura/server/deploy/readaura-club.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now readaura-club
systemctl is-active readaura-club
curl -s localhost:8080/health    # {"ok":true,"service":"readaura-club"}
journalctl -u readaura-club -f   # find the one-time BOOTSTRAP OWNER INVITE printed on first start
```

## 7. Publish through the shared HTTPS gateway

Add a collision-free `/readaura-api/` location to the existing Nginx TLS server
and proxy it to `http://127.0.0.1:8080/`, stripping the prefix. Set
`X-Club-Client-IP` from `$remote_addr`, allow request bodies up to 25 MB, and
keep HFT `/api/` plus Clash `/clash-api/` unchanged. The backend accepts
secretless requests only when the upstream connection is loopback; direct
public `:8080` calls still require `CLUB_PROXY_SECRET` during rollout.

## 8. Point the browser at HTTPS

Set these on the Vercel project (Production), then redeploy:

| Var | Value |
|---|---|
| `NEXT_PUBLIC_CLUB_ENABLED` | `true` (build-time; ships the club UI) |
| `NEXT_PUBLIC_CLUB_API_URL` | `https://134.185.90.180/readaura-api` |
| `CLUB_ENABLED` | `true` (server; lets the proxy forward) |
| `CLUB_BACKEND_URL` | `http://134.185.90.180:8080` |
| `CLUB_PROXY_SECRET` | same value as on the box |

Verify the direct endpoint's CORS response for every production alias, member
JWT reads/writes, blob upload/download, and sync. Keep the proxy variables only
for the compatibility window; new browser code does not use them. With the club
flag unset, no club UI ships — byte-for-byte today.

## 9. Backups (do this — single box = single point of failure)

Published docs + shared annotations live only on this box (private notes stay in
each user's browser). Back up nightly:

```bash
# Postgres
pg_dump -U readaura readaura_club | gzip > /home/ubuntu/readaura/backups/db-$(date +%F).sql.gz
# Blob dir (added in Phase 2; default CLUB_BLOB_DIR=/home/ubuntu/readaura/blobs)
tar czf /home/ubuntu/readaura/backups/blobs-$(date +%F).tgz -C /home/ubuntu/readaura blobs
```

Wire it to a cron/systemd-timer and copy off-box.

## Rotation / revocation

- **Invite code:** re-seed `clubs.invite_code_hash` (a small admin step in
  Phase 2) to invalidate the old code.
- **JWT secret:** rotating `CLUB_JWT_SECRET` invalidates all member tokens
  (everyone re-joins or recovers).
- **Recovery codes** are single-use and rotate on every successful recovery.
- **Proxy secret:** rotate on both the box and Vercel together.
