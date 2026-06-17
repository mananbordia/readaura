# Self-hosting the ReadAura club backend on Oracle Cloud

The club backend runs **only** on your own box. The Next.js frontend stays on
Vercel and reaches the backend through the `app/api/club/[...path]` proxy — so
the browser only ever talks to Vercel (HTTPS), and Vercel forwards to the box
over plain HTTP, server-to-server.

```
Browser ──HTTPS──▶ Vercel (/api/club/* proxy) ──HTTP──▶ Oracle box :8080 (Hono) ──▶ Postgres
```

Target box (this guide's example): **Ubuntu 24.04, arm64 (Ampere A1), 1 vCPU /
6 GB**, public IP `134.185.90.180`, login user `ubuntu`. The backend listens on
`:8080`; Postgres is local-only.

> **Security note (read this).** The Vercel→box hop is **unencrypted HTTP** for
> now, so the member JWT and any opt-in personal-sync data cross the public
> internet in plaintext. Fine to get going on a trusted small club. **Before you
> put real private data into personal sync, add TLS** — the easiest path is a
> DuckDNS hostname + Caddy/Let's Encrypt in front of `:8080`, then flip
> `CLUB_BACKEND_URL` on Vercel to `https://…`. Nothing else changes.

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
sudo mkdir -p /opt/readaura && sudo chown ubuntu:ubuntu /opt/readaura
git clone <your-repo> /opt/readaura
cd /opt/readaura/server
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
PORT=8080
CLUB_NAME=ReadAura Club
CLUB_INVITE_CODE=<the code you hand to members>
SYNC_MAX_BYTES=5000000
```

## 5. Apply the schema

```bash
npm run db:migrate
```

## 6. Run it under systemd

`/etc/systemd/system/readaura-club.service`:

```ini
[Unit]
Description=ReadAura club backend
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/readaura/server
EnvironmentFile=/opt/readaura/server/.env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now readaura-club
sudo systemctl status readaura-club
curl -s localhost:8080/health    # {"ok":true,"service":"readaura-club"}
```

## 7. Open port 8080 — BOTH layers (Oracle's classic gotcha)

Oracle Ubuntu images ship host iptables rules that block ports **even after**
you open the Security List. You must do both (the same two steps you already did
for your `:5555` service):

**a) Oracle Security List (ingress rule)** — VCN → the instance's subnet →
Security List → add Ingress: Source `0.0.0.0/0`, IP Protocol TCP, Dest port
`8080`. (Tighter: restrict the source to Vercel's egress range if you pin one.)

**b) Host firewall on the box:**

```bash
sudo iptables -I INPUT 6 -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save      # persist across reboots
```

Verify from your laptop: `curl http://134.185.90.180:8080/health` → 403
(`forbidden`) is the **correct** answer — the port is reachable but rejects
calls without the proxy secret. Health is open; the secret-guarded routes 403.

## 8. Point Vercel at the box

Set these on the Vercel project (Production), then redeploy:

| Var | Value |
|---|---|
| `NEXT_PUBLIC_CLUB_ENABLED` | `true` (build-time; ships the club UI) |
| `CLUB_ENABLED` | `true` (server; lets the proxy forward) |
| `CLUB_BACKEND_URL` | `http://134.185.90.180:8080` |
| `CLUB_PROXY_SECRET` | same value as on the box |

Verify end-to-end: the deployed app's `/api/club/health` should now return the
backend's JSON (the proxy injects the secret). With these vars **unset** (e.g.
the demo deploy) the proxy 404s and no club UI ships — byte-for-byte today.

## 9. Backups (do this — single box = single point of failure)

Published docs + shared annotations live only on this box (private notes stay in
each user's browser). Back up nightly:

```bash
# Postgres
pg_dump -U readaura readaura_club | gzip > /opt/readaura/backups/db-$(date +%F).sql.gz
# Blob dir (added in Phase 2; default CLUB_BLOB_DIR=/opt/readaura/blobs)
tar czf /opt/readaura/backups/blobs-$(date +%F).tgz -C /opt/readaura blobs
```

Wire it to a cron/systemd-timer and copy off-box.

## Rotation / revocation

- **Invite code:** re-seed `clubs.invite_code_hash` (a small admin step in
  Phase 2) to invalidate the old code.
- **JWT secret:** rotating `CLUB_JWT_SECRET` invalidates all member tokens
  (everyone re-joins or recovers).
- **Recovery codes** are single-use and rotate on every successful recovery.
- **Proxy secret:** rotate on both the box and Vercel together.
