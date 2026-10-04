# Higoverse — VPS Deployment

This document describes the production deployment of the Higoverse platform
(business records and transactions — shops, products, sales, purchases,
suppliers, expenses, settings, debts, proformas, reporting) on a single
Ubuntu VPS, how to operate it day-to-day, how to rebuild it from scratch, and
how the domain/TLS are set up.

Current host: `sc-kgl-1-cpu1-ram2gb-40gb-ubu` (Ubuntu 24.04, 1 vCPU, 2GB RAM,
40GB disk), public IP `102.202.208.190`.

> **Status: deployed and live (2026-10-01).** This box was built from a
> completely blank Ubuntu 24.04 image by following **§5** below end to end —
> nothing was pre-installed, no code was checked out, nothing was listening
> on 80/443 beforehand. Everything in this document now describes the
> actual running system, not an aspirational target. See **§13** for a
> point-in-time snapshot of what was verified working at deploy time, and
> **§8** for real bugs hit (and fixed) during the build.

**Live URL:** https://higoverse.com (HTTP redirects to HTTPS; the bare IP
over HTTP now 404s by certbot's design — see §10). DNS is proxied through
**Cloudflare** (orange-cloud, not a plain A-record) — see §10 for what that
changes about TLS and troubleshooting.

> **Rebrand history:** this platform was originally built and deployed as
> "A & T Consultants" on `atconsultants.rw` (VPS `102.202.208.195`, still
> running as of this writing — see §9 for decommissioning it). Rather than
> migrate that box in place, a brand-new VPS (`102.202.208.190`) was
> provisioned and built from scratch with the "Higoverse" naming throughout
> (systemd units, secrets dir, Postgres role, domain, etc.) — this document
> reflects that new box, which never had the old names on it. **§11's
> in-place-migration runbook was not used and does not apply here**; it's
> kept only in case the *old* box ever needs the same treatment.

---

## 1. Architecture

```
                              Internet
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   nginx :80/443 │   (single public entrypoint)
                        └────────┬────────┘
              ┌───────────────────┼───────────────────────────────┐
              │ location /        │ location /svc/<name>/         │
              ▼                    ▼
     ┌──────────────────┐  ┌─────────────────────────────────────────┐
     │ Next.js frontend  │  │ 8 FastAPI backend services (localhost)  │
     │ 127.0.0.1:3000    │  │ auth:8000 products:8001 suppliers:8002  │
     │ (systemd:         │  │ sales:8003 purchases:8004 expenses:8005 │
     │  higoverse-web)   │  │ settings:8006 shops:8007 reports:8008   │
     └──────────┬────────┘  └───────────────────┬─────────────────────┘
                │  (2 of them proxied via                │
                │   Next's own server rewrite:            │
                │   /api/purchases/*, /api/expenses/*)     │
                └──────────────────────────────────────────┘
                                                 │
                                                 ▼
                                   ┌───────────────────────────┐
                                   │ PostgreSQL 16 (localhost)  │
                                   │  • authdb  (users/roles/   │
                                   │    shops/refresh_tokens)   │
                                   │  • shopdb  (products/sales/│
                                   │    purchases/suppliers/    │
                                   │    expenses/settings/...)  │
                                   └───────────────────────────┘
```

Every backend service binds to `127.0.0.1` only — nothing but nginx (and
Postgres, to itself) is reachable from outside the box. The frontend calls
6 of the 8 backends directly from the browser via same-origin relative
paths (`/svc/<name>/...`, proxied by nginx — no CORS needed since it's not
cross-origin); `purchase-service` and `expense-service` are called via
Next.js's own server-side rewrite (`next.config.ts`) instead, unchanged from
how the app was originally written.

### Why two databases

This mirrors the app's original design: `authdb` holds identity data (users,
roles, refresh tokens) and a mirror of `shops`; `shopdb` holds everything
shop-scoped (products, sales, purchases, suppliers, expenses, settings,
debts, proformas) plus its own copy of `shops`. `auth-service` is the only
service that talks to both; everything else talks to one or the other.

### Port map

| Service           | systemd unit                       | Port | DB       |
|-------------------|-------------------------------------|------|----------|
| auth-service      | `higoverse-auth-service`           | 8000 | authdb + shopdb |
| product-service   | `higoverse-product-service`        | 8001 | shopdb   |
| supplier-service  | `higoverse-supplier-service`       | 8002 | shopdb   |
| sale-service      | `higoverse-sale-service`           | 8003 | shopdb   |
| purchase-service  | `higoverse-purchase-service`       | 8004 | shopdb   |
| expense-service   | `higoverse-expense-service`        | 8005 | shopdb   |
| settings-service  | `higoverse-settings-service`       | 8006 | shopdb   |
| shop-service      | `higoverse-shop-service`           | 8007 | authdb   |
| report-service    | `higoverse-report-service`         | 8008 | none (calls sales/purchases/products over HTTP) |
| web (Next.js)     | `higoverse-web`                    | 3000 | —        |

> **Note:** `shop-service` is deployed and healthy, but the current frontend
> code doesn't call it — shop-profile reads/writes go through `auth-service`'s
> `/api/v1/shop*` endpoints instead (`apps/web/lib/shop-api.ts` calls
> `AUTH_API`, not a shop-service URL). It's likely a legacy/future service.
> Nothing to fix, just worth knowing before you wonder why its logs show no
> traffic.

---

## 2. Where everything lives

- **Code:** `/root/projects/higoverse` (this is both the git checkout
  and the live deployment directory — there is no separate "build" copy).
- **Backend venvs:** `backend/<service>/.venv/` (one per service, not shared).
- **Backend secrets:** `backend/<service>/.env` (mode `600`, gitignored).
- **Frontend build:** `apps/web/.next/` (produced by `npm run build`).
- **Frontend public env:** `apps/web/.env.production` (build-time
  `NEXT_PUBLIC_*` values — not secret, just base URLs, but gitignored anyway).
- **Systemd units:** `/etc/systemd/system/higoverse-*.service`.
- **nginx config:** `/etc/nginx/sites-available/higoverse.conf` (symlinked into
  `sites-enabled/`; the default nginx site was removed).
- **Shared secrets root:** `/etc/higoverse/` (mode `700`, root-only):
  - `jwt_secret` — the shared `SECRET_KEY` used by all 8 backend services to
    sign/verify JWTs (must be identical across all of them).
  - `pg_app_password` — password for the `higoverse_app` Postgres role.
  - `bootstrap_admin_password` — the first platform-admin login (see §7).

None of these secret files are committed to git. `backend/*/.env` files are
regenerated from `/etc/higoverse/*` by the script kept at
`/root/projects/higoverse/deploy/write_envs.sh` (see §5 for a copy of it).

---

## 3. Security posture

- **Firewall (ufw):** only `22`, `222` (ssh), `80`, `443` inbound (plus a
  pre-existing rule for the console agent on `60124/udp`). Everything else
  is denied by default.
- **fail2ban:** watching sshd on ports 22 and 222, 5 attempts / 10 min → 1h ban.
- **All app processes bind to `127.0.0.1` only** — never directly reachable
  from the internet, only through nginx.
- **systemd sandboxing** on every `higoverse-*` unit: `NoNewPrivileges=yes`,
  `PrivateTmp=yes`, `ProtectSystem=strict` with a `ReadWritePaths=` exception
  for that service's own directory. (Do **not** add `ProtectHome=yes` — on
  this box the app lives under `/root`, and that directive hides `/root`
  entirely, which breaks every unit with `203/EXEC`. Learned that the hard
  way during initial setup.)
- **Rotated secrets:** the JWT `SECRET_KEY` and Postgres credentials that
  were previously committed to git (`backend/auth-service/.env`, and a
  *second*, different leaked Neon credential that was hardcoded in
  `backend/auth-service/alembic.ini`) have been rotated. This deployment
  uses entirely new, locally-generated secrets that never touched git.
  **The old leaked values still exist in git history** — see §9.
- Services currently run as **root** (single-tenant box, small enough that a
  dedicated non-root service account wasn't worth the extra complexity yet).
  A future hardening step would be to create a `svc-higoverse` system user,
  chown the tree, and switch `User=`/`Group=` in each unit.

---

## 4. Day-2 operations

### Check everything at a glance

```bash
systemctl list-units 'higoverse-*' --no-pager
```

### Per-service control

```bash
systemctl status  higoverse-auth-service      # or any higoverse-<service>, higoverse-web
systemctl restart higoverse-auth-service
systemctl stop    higoverse-auth-service
journalctl -u higoverse-auth-service -f       # follow logs live
journalctl -u higoverse-auth-service -n 100   # last 100 lines
```

### Restart everything

```bash
systemctl restart 'higoverse-*'
```

### Health checks

Every backend exposes `/health`; nginx exposes them all under `/svc/<name>/health`:

```bash
for s in auth products suppliers sales purchases expenses settings shops reports; do
  echo -n "$s: "; curl -s http://127.0.0.1/svc/$s/health; echo
done
curl -s -o /dev/null -w "frontend: %{http_code}\n" http://127.0.0.1/
```

`auth-service`'s `/health` also reports which tables exist in both databases
— useful as a quick schema sanity check:

```bash
curl -s http://127.0.0.1/svc/auth/health | python3 -m json.tool
```

### Resource monitoring

This is a **2GB RAM / 1 vCPU** box running 10 processes (9 app services +
nginx) plus Postgres. There's a 2GB swapfile (`/swapfile`) as a safety net,
but sustained swapping means you're out of headroom. Check with:

```bash
free -h                       # memory + swap
systemctl status <unit>       # per-unit "Memory:" line
df -h /                       # disk
```

If memory becomes a recurring problem: the cheapest fix is upgrading the
VPS; the cheapest *code* fix is nothing needs to change — every uvicorn
process already runs single-worker.

### fail2ban / firewall status

```bash
ufw status verbose
fail2ban-client status sshd
```

### Database access

```bash
su - postgres -c "psql -d authdb"
su - postgres -c "psql -d shopdb"
```

Application role is `higoverse_app`; password is in `/etc/higoverse/pg_app_password`.

### Database backups

Automated since 2026-10-03. Both databases are dumped nightly, verified, and
copied off the server.

**On the VPS** — `higoverse-backup.timer` runs `/usr/local/bin/higoverse-backup`
(source: `deploy/higoverse-backup.sh`, units: `deploy/higoverse-backup.{service,timer}`)
every day at 01:00 UTC (03:00 Kigali):

- `pg_dump --format=custom` of `authdb` and `shopdb` into
  `/var/backups/higoverse/<db>-<UTC timestamp>.dump` (dir is `700`, files `600`, root only).
  Read-only against Postgres.
- Each dump is written to `*.partial`, checked with `pg_restore --list` (must
  contain table data), and only then renamed — a failed dump never replaces a good one.
- Keeps 14 days; the newest dump of each database is never pruned.

```bash
systemctl list-timers higoverse-backup.timer      # next/last run
systemctl start higoverse-backup.service          # back up right now
journalctl -u higoverse-backup.service -n 20      # result of last run
ls -la /var/backups/higoverse
```

**Off the VPS** — the Windows task "Higoverse backup pull" on the owner's PC runs
`deploy/pull-backups.ps1` daily at 12:00 (or as soon as the PC is on), downloading
new dumps over SSH to `D:HigoverseBackupsps` (kept 30 days, log in `pull.log`).
These files are real customer data: keep that folder private and outside the repo.

**Restoring** (into a *new* database — never over the live one without a fresh
backup taken first):

```bash
su - postgres -c "createdb shopdb_restore"
su - postgres -c "pg_restore --no-owner -d shopdb_restore /var/backups/higoverse/shopdb-<stamp>.dump"
```

Verified 2026-10-03: both dumps restored into a scratch Postgres and every
table's row count matched production exactly (authdb 6 tables, shopdb 13).

---

## 5. Redeploying from scratch (disaster recovery / new VPS)

If this VPS is lost, here's the full rebuild sequence on a fresh Ubuntu
24.04 box with root access.

### 5.1 System packages

```bash
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get install -y \
  postgresql postgresql-contrib nginx \
  python3-venv python3-pip python3-dev build-essential libpq-dev \
  ufw fail2ban unattended-upgrades certbot python3-certbot-nginx \
  curl gnupg ca-certificates git

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 5.2 Swap (skip if the box has >= 4GB RAM)

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 5.3 Firewall + fail2ban

```bash
ufw allow 22/tcp && ufw allow 222/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = 22,222
backend = systemd
maxretry = 5
bantime = 1h
findtime = 10m
EOF
systemctl enable --now fail2ban
```

### 5.4 Get the code

The repo now lives at `github.com/njosuedev/higoverse-os` and is **public**
— a plain `git clone` works with no credentials of any kind:

```bash
git clone https://github.com/njosuedev/higoverse-os.git /root/projects/higoverse
cd /root/projects/higoverse
```

> **History:** the code originally lived in a *private* repo
> (`github.com/nikuze2026/A-T-Consulatnts`, note the typo in
> "Consultants"). A bare `git clone` over HTTPS on a box with no stored
> credentials fails non-interactively with `fatal: could not read Username
> for 'https://github.com': No such device or address` — that's exactly
> what happened during the 2026-10-01 deploy, since the public
> `njosuedev/higoverse-os` repo didn't exist yet. The workaround used that
> day was streaming the git-tracked files directly over SSH instead of
> cloning:
> ```bash
> git ls-files -z | tar --null -T - -czf - | \
>   ssh -p 222 root@102.202.208.190 \
>   "mkdir -p /root/projects/higoverse && tar -xzf - -C /root/projects/higoverse"
> ```
> That only copies tracked files (no `.venv`, `node_modules`, `.next`,
> `.env`), and it's a one-shot copy, not a clone — no `.git` directory
> afterward, so `git pull` (§6) doesn't work until `git init` + `git remote
> add origin https://github.com/njosuedev/higoverse-os.git` + `git fetch` +
> `git reset --hard origin/main` turns it back into a real checkout (see
> §9's deploy-key follow-up for the exact commands — as of this writing
> that conversion is still pending on the live VPS). None of this applies
> to a *fresh* deploy today: the repo is public now, so a plain `git clone`
> (above) just works and none of this workaround is needed.

### 5.5 PostgreSQL

```bash
systemctl enable --now postgresql
PGPASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
mkdir -p /etc/higoverse && chmod 700 /etc/higoverse
printf '%s' "$PGPASS" > /etc/higoverse/pg_app_password && chmod 600 /etc/higoverse/pg_app_password

su - postgres -c "psql -v ON_ERROR_STOP=1" << SQL
CREATE ROLE higoverse_app LOGIN PASSWORD '$PGPASS';
SQL
su - postgres -c "createdb -O higoverse_app authdb"
su - postgres -c "createdb -O higoverse_app shopdb"
```

### 5.6 Shared JWT secret

```bash
openssl rand -hex 32 > /etc/higoverse/jwt_secret
chmod 600 /etc/higoverse/jwt_secret
```

### 5.7 Per-service `.env` files

Use `deploy/write_envs.sh` (create it if it doesn't exist yet — contents
below), which reads the secrets above and writes one `.env` per backend
service with the right `DATABASE_URL`/`SHOP_DB_URL` and internal
service-to-service URLs:

```bash
#!/bin/bash
set -euo pipefail
ROOT=/root/projects/higoverse/backend
JWT=$(cat /etc/higoverse/jwt_secret)
PGPASS=$(cat /etc/higoverse/pg_app_password)
AUTHDB="postgresql+psycopg2://higoverse_app:${PGPASS}@127.0.0.1:5432/authdb"
SHOPDB="postgresql+psycopg2://higoverse_app:${PGPASS}@127.0.0.1:5432/shopdb"

write_env() {
  local dir="$1"; shift
  { for kv in "$@"; do echo "$kv"; done } > "$ROOT/$dir/.env"
  chmod 600 "$ROOT/$dir/.env"
}

write_env auth-service \
  "DATABASE_URL=${AUTHDB}" "SHOP_DB_URL=${SHOPDB}" "SECRET_KEY=${JWT}" \
  "ALGORITHM=HS256" "ACCESS_TOKEN_EXPIRE_MINUTES=60" "REFRESH_TOKEN_EXPIRE_DAYS=30" \
  "CORS_ALLOWED_ORIGIN_REGEX=^https?://localhost(:\d+)?\$|^https?://127\.0\.0\.1(:\d+)?\$" \
  "SMTP_HOST=smtp.gmail.com" "SMTP_PORT=587" "SMTP_USER=" "SMTP_PASS=" \
  "SMTP_FROM=Higoverse <noreply@higoverse.com>"

write_env product-service   "DATABASE_URL=${SHOPDB}" "SECRET_KEY=${JWT}" "AUTH_SERVICE_ALGORITHM=HS256" "SUPPLIER_SERVICE_URL=http://127.0.0.1:8002"
write_env supplier-service  "DATABASE_URL=${SHOPDB}" "SECRET_KEY=${JWT}" "AUTH_SERVICE_ALGORITHM=HS256"
write_env sale-service      "DATABASE_URL=${SHOPDB}" "SECRET_KEY=${JWT}" "AUTH_SERVICE_ALGORITHM=HS256" "PRODUCT_SERVICE_URL=http://127.0.0.1:8001"
write_env purchase-service  "DATABASE_URL=${SHOPDB}" "SECRET_KEY=${JWT}" "AUTH_SERVICE_ALGORITHM=HS256" "PRODUCT_SERVICE_URL=http://127.0.0.1:8001"
write_env expense-service   "DATABASE_URL=${SHOPDB}" "SECRET_KEY=${JWT}" "AUTH_SERVICE_ALGORITHM=HS256"
write_env settings-service  "DATABASE_URL=${SHOPDB}" "SECRET_KEY=${JWT}" "AUTH_SERVICE_ALGORITHM=HS256"
write_env shop-service      "DATABASE_URL=${AUTHDB}" "SECRET_KEY=${JWT}" "AUTH_SERVICE_ALGORITHM=HS256"
write_env report-service    "SECRET_KEY=${JWT}" "AUTH_SERVICE_ALGORITHM=HS256" \
  "SALE_SERVICE_URL=http://127.0.0.1:8003" "PURCHASE_SERVICE_URL=http://127.0.0.1:8004" "PRODUCT_SERVICE_URL=http://127.0.0.1:8001"
```

Run it: `bash deploy/write_envs.sh`

### 5.8 Backend venvs + deps

```bash
cd /root/projects/higoverse/backend
for svc in auth-service product-service supplier-service sale-service \
           purchase-service expense-service settings-service shop-service report-service; do
  python3 -m venv "$svc/.venv"
  "$svc/.venv/bin/pip" install --upgrade pip -q
  "$svc/.venv/bin/pip" install -q -r "$svc/requirements.txt"
done
```

### 5.9 Create the schema

The apps create their own tables on startup (`Base.metadata.create_all` +
idempotent `ADD COLUMN IF NOT EXISTS` migrations) — Alembic is **not** the
bootstrap mechanism here, it only layers incremental changes on top of a
schema that already exists (see §8 for why). To create a fresh schema
without starting the full service:

```bash
cd /root/projects/higoverse/backend/auth-service
./.venv/bin/python -c "
from dotenv import load_dotenv
load_dotenv()
from app.main import on_startup
on_startup()
"
./.venv/bin/alembic stamp head
```

> **Don't `source <(grep -v CORS_ALLOWED_ORIGIN_REGEX .env)`** — that was the
> original plan here, but it breaks: `.env`'s `SMTP_FROM=Higoverse
> <noreply@higoverse.com>` has an unescaped, unquoted `<`, which bash parses
> as a redirection when the line is sourced, failing with `syntax error near
> unexpected token 'newline'`. `write_envs.sh` doesn't quote any values, so
> bash-sourcing the raw `.env` is fragile for any service whose env has a
> value containing shell metacharacters. Loading it through Python's
> `python-dotenv` (already a dependency, used above) sidesteps the whole
> problem — it reads `KEY=value` pairs without ever handing them to a shell.

The other 7 services create their own tables automatically the first time
they start (next step) — no manual action needed for them.

### 5.10 systemd units (backend)

For each service/port pair below, write `/etc/systemd/system/higoverse-<svc>.service`:

```
auth-service:8000  product-service:8001  supplier-service:8002  sale-service:8003
purchase-service:8004  expense-service:8005  settings-service:8006  shop-service:8007
report-service:8008
```

Template (substitute `<svc>` and `<port>`):

```ini
[Unit]
Description=Higoverse - <svc>
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=/root/projects/higoverse/backend/<svc>
EnvironmentFile=/root/projects/higoverse/backend/<svc>/.env
Environment=PYTHONUNBUFFERED=1
ExecStart=/root/projects/higoverse/backend/<svc>/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port <port>
Restart=on-failure
RestartSec=3

NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/root/projects/higoverse/backend/<svc>

[Install]
WantedBy=multi-user.target
```

> ⚠️ Do not add `ProtectHome=yes` — see §3.

Then:

```bash
systemctl daemon-reload
for svc in auth-service product-service supplier-service sale-service \
           purchase-service expense-service settings-service shop-service report-service; do
  systemctl enable --now "higoverse-${svc}"
done
```

**Important:** `EnvironmentFile=` is required even though some of these
services also read their `.env` via `pydantic-settings`. A few of the
`app/db/database.py` files call plain `os.getenv("DATABASE_URL")` without
loading `.env` themselves — without `EnvironmentFile=`, their DB engine
silently becomes `None` and `on_startup` no-ops (wrapped in a bare
`except: pass`), so nothing errors, tables just never get created. Give it
~10-20 seconds after first start, then verify:

```bash
su - postgres -c "psql -d shopdb -c '\dt'"
```
You should see 13 tables (`products`, `sales`, `purchases`, `suppliers`,
`expenses`, `shop_settings`, `debts`, `proformas`, `shops`, `users`, `roles`,
`refresh_tokens`, `password_resets`). If some are missing, restart that
specific service and re-check after a few seconds.

### 5.11 Frontend

```bash
cd /root/projects/higoverse/apps/web
npm install --no-audit --no-fund
```

Write `.env.production`:

```
NEXT_PUBLIC_AUTH_API=/svc/auth
NEXT_PUBLIC_PRODUCT_API=/svc/products
NEXT_PUBLIC_API_REPORTS=/svc/reports
NEXT_PUBLIC_API_SETTINGS=/svc/settings
NEXT_PUBLIC_API_SUPPLIERS=/svc/suppliers
NEXT_PUBLIC_API_SALES=/svc/sales
NEXT_PUBLIC_API_EXPENSES=http://127.0.0.1:8005
NEXT_PUBLIC_API_PURCHASES=http://127.0.0.1:8004
```

```bash
NODE_OPTIONS="--max-old-space-size=1536" npm run build
```

systemd unit `/etc/systemd/system/higoverse-web.service`:

```ini
[Unit]
Description=Higoverse - web frontend (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/projects/higoverse/apps/web
Environment=NODE_ENV=production
EnvironmentFile=/root/projects/higoverse/apps/web/.env.production
ExecStart=/usr/bin/npx next start -p 3000 -H 127.0.0.1
Restart=on-failure
RestartSec=3

NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/root/projects/higoverse/apps/web

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now higoverse-web
```

### 5.12 nginx

`/etc/nginx/sites-available/higoverse.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name higoverse.com;

    client_max_body_size 25m;

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        $connection_upgrade;

    # proxy_redirect re-adds the /svc/<name> prefix to any redirect the
    # backend issues (e.g. FastAPI's trailing-slash 307) — without it the
    # browser follows a same-origin redirect straight into the frontend's
    # own router and 404s. See §8 for the full story.
    location /svc/auth/       { proxy_pass http://127.0.0.1:8000/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/auth$2; }
    location /svc/products/   { proxy_pass http://127.0.0.1:8001/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/products$2; }
    location /svc/suppliers/  { proxy_pass http://127.0.0.1:8002/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/suppliers$2; }
    location /svc/sales/      { proxy_pass http://127.0.0.1:8003/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/sales$2; }
    location /svc/purchases/  { proxy_pass http://127.0.0.1:8004/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/purchases$2; }
    location /svc/expenses/   { proxy_pass http://127.0.0.1:8005/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/expenses$2; }
    location /svc/settings/   { proxy_pass http://127.0.0.1:8006/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/settings$2; }
    location /svc/shops/      { proxy_pass http://127.0.0.1:8007/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/shops$2; }
    location /svc/reports/    { proxy_pass http://127.0.0.1:8008/; proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/reports$2; }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

```bash
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/higoverse.conf /etc/nginx/sites-enabled/higoverse.conf
nginx -t && systemctl enable --now nginx && systemctl restart nginx
```

Then get the TLS cert (see §10):
```bash
certbot --nginx -d higoverse.com --agree-tos --email <your-email> --non-interactive --redirect
```

### 5.13 Bootstrap the first admin user

There is no public signup — admins are created directly, and only an
existing admin can create shops/staff via the API. So the very first admin
has to be inserted straight into the database:

```bash
cd /root/projects/higoverse/backend/auth-service
ADMIN_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)
printf '%s' "$ADMIN_PASS" > /etc/higoverse/bootstrap_admin_password
chmod 600 /etc/higoverse/bootstrap_admin_password

./.venv/bin/python << 'PYEOF'
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(dotenv_path=".env")   # see note below on why the path is explicit
from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import hash_password

pw = open("/etc/higoverse/bootstrap_admin_password").read().strip()
db = SessionLocal()
existing = db.query(User).filter(User.email == "admin@higoverse.com").first()
if existing:
    print("admin already exists:", existing.email)
else:
    u = User(
        id=uuid.uuid4(), name="Platform Admin", email="admin@higoverse.com",
        password_hash=hash_password(pw), role="admin", shop_id=None,
        is_active=True, created_at=datetime.now(timezone.utc),
    )
    db.add(u); db.commit()
    print("admin created:", u.email)
db.close()
PYEOF
```

> Same `source <(...)` pitfall as §5.9 — use `python-dotenv` instead. One
> more gotcha specific to this heredoc form: `load_dotenv()` with **no**
> argument auto-discovers `.env` by walking up from the caller's source
> file, using stack-frame introspection (`find_dotenv()` inspects
> `frame.f_back`). A script piped into `python <<'PYEOF'` has no source
> file, so that introspection hits `frame.f_back is None` and raises
> `AssertionError` before your code ever runs. Passing the path explicitly
> (`load_dotenv(dotenv_path=".env")`) skips the discovery walk entirely and
> works from any invocation style. The script above is also written to be
> safely re-runnable (checks for an existing `admin@higoverse.com` first)
> since you may re-run it later with a new password via §5.13's own
> instructions.

### 5.14 Smoke test

```bash
for s in auth products suppliers sales purchases expenses settings shops reports; do
  curl -s http://127.0.0.1/svc/$s/health; echo
done
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
```

---

## 6. Deploying a code update

```bash
cd /root/projects/higoverse
git pull

# Backend service(s) that changed:
backend/<svc>/.venv/bin/pip install -r backend/<svc>/requirements.txt   # only if requirements.txt changed
systemctl restart higoverse-<svc>

# Frontend, if apps/web changed:
cd apps/web
npm install                          # only if package.json changed
NODE_OPTIONS="--max-old-space-size=1536" npm run build
systemctl restart higoverse-web
```

If a backend model changed in a way that needs a new column, either add it
to the relevant `_MIGRATIONS`/idempotent-`ALTER` list in that service's
`app/main.py` (the pattern already used throughout this codebase) so it
self-heals on next restart, or run the ALTER by hand against `authdb`/`shopdb`.

### Publishing a desktop or Android app update

The installed apps update themselves from `https://higoverse.com/downloads/`
(nginx serves `/var/www/higoverse/downloads/`, see `deploy/nginx-higoverse.conf`).

- **Windows (Electron):** bump `version` in `apps/desktop/package.json`, run
  `npm run dist`, then upload `dist/latest.yml`, `dist/Higoverse-Setup-<v>.exe`
  and its `.blockmap` to `downloads/desktop/`. Upload `latest.yml` **last**:
  installed apps download as soon as it changes.
- **Android (APK installs):** bump `version: x.y.z+N` in `apps/mobile/pubspec.yaml`,
  `flutter build apk --release`, upload the APK to `downloads/android/`, then
  update `downloads/android/version.json` (`versionCode` = N). The app
  downloads the APK itself (progress bar) and opens Android's installer.
- **Android (Google Play):** `flutter build appbundle --release --android-project-arg=play=true`
  and upload `build/app/outputs/bundle/release/app-release.aab` in Play Console.
  The `play` flag leaves out `REQUEST_INSTALL_PACKAGES` (Play restricts it;
  Play installs update through Play's in-app update).
- The web app needs nothing: open tabs show "Reload" after a deploy.

---

## 7. First login

- URL: `https://higoverse.com/login`
- Email: `admin@higoverse.com`
- Password: see `/etc/higoverse/bootstrap_admin_password` on the VPS (also given
  to you once, out-of-band, when this was set up — change it after first
  login via the profile/change-password flow, or by re-running the snippet
  in §5.13 with a new password).

This account has `role=admin` and no shop — use it to create real shops and
their owner accounts via the admin panel (`admin.py`'s `POST /api/v1/admin/shops`),
since there is no public self-registration.

---

## 8. Notable things fixed/decided during setup (context for future-you)

- **FastAPI's trailing-slash redirect breaks under a path-stripping proxy —
  fixed with `proxy_redirect`.** 6 of the 8 backends (`products`,
  `suppliers`, `sales`, `purchases`, `settings`, `shops`) define their list
  endpoint as `@router.get("/")` under a prefix, so `GET /products` 307s to
  `GET /products/`. Uvicorn (default `proxy_headers=True`, trusting
  `127.0.0.1`) builds that `Location` header using the `Host`/`X-Forwarded-Proto`
  nginx forwards — so it's correctly `https://higoverse.com/...` — but
  the *path* it uses is what the backend itself saw, i.e. already stripped
  of the `/svc/<name>` prefix nginx removed before proxying. The browser
  then follows a same-origin redirect straight into the Next.js app's own
  router (e.g. `https://higoverse.com/products/`), which 404s there —
  this is exactly the "inventory data failed to load" symptom. Fixed with
  a `proxy_redirect` on every `/svc/<name>/` location in
  `/etc/nginx/sites-available/higoverse.conf` that re-adds the stripped prefix
  to any redirect the backend issues:
  ```nginx
  location /svc/products/ {
      proxy_pass http://127.0.0.1:8001/;
      proxy_redirect ~^(https?://[^/]+)(/.*)$ $1/svc/products$2;
  }
  ```
  One line per location, prefix swapped in. **`nginx -s reload` did not pick
  this up in testing — a full `systemctl restart nginx` was needed.** If you
  add a new `/svc/<name>/` block, copy this pattern and restart (not just
  reload) to be safe.
- **Alembic history assumes tables already exist.** The very first
  migration (`87c6fa0c838b_init_tables`) does `ALTER TABLE users ADD COLUMN
  role` — it was generated against a database whose base tables were
  already created by `Base.metadata.create_all()` in `main.py`'s startup
  hook, not by Alembic. Running `alembic upgrade head` against a truly empty
  database fails immediately (`relation "users" does not exist`). Because
  the current SQLAlchemy models already contain every column the migration
  history incrementally added, the fix used here is: let the app create the
  schema itself, then `alembic stamp head` (see §5.9). Any *new* migration
  added from now on will apply normally with `alembic upgrade head`.
- **`EnvironmentFile=` matters even where `.env` "should" already be read.**
  `product-service`, `purchase-service`, `sale-service`, and
  `settings-service`'s `app/db/database.py` read `DATABASE_URL` via a bare
  `os.getenv()` call with no `load_dotenv()` — unlike `expense-service`
  (explicit `load_dotenv()`) and `shop-service`/`supplier-service` (go
  through `pydantic-settings`, which loads `.env` itself). Systemd's
  `EnvironmentFile=` papers over this inconsistency uniformly without
  touching application code.
- **`ProtectHome=yes` breaks everything on this box.** The app lives under
  `/root`; that directive hides `/root` from the process's view entirely,
  so `execve()` fails with `203/EXEC`. Removed from all units; the rest of
  the sandboxing (`ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp`,
  scoped `ReadWritePaths`) is unaffected.
- **An unpinned `sqlalchemy` in 7 of 8 backend `requirements.txt` files
  resolved to an incompatible version and crash-looped every service that
  touches a database, on first deploy.** `auth-service/requirements.txt`
  pins `SQLAlchemy==2.0.50`; `product-service`, `supplier-service`,
  `sale-service`, `purchase-service`, `expense-service`,
  `settings-service`, and `shop-service` just say `sqlalchemy` with no
  version, so `pip install` picked up the current latest, `2.1.1`. SQLAlchemy
  2.1 changed the **default driver** for a bare `postgresql://` URL from
  `psycopg2` to `psycopg` (v3) — but every service here (`auth-service`
  included) only has `psycopg2-binary` installed, not `psycopg`. Every
  affected service died on startup with `ModuleNotFoundError: No module
  named 'psycopg'`, restarted, died again, forever (`systemctl` showed them
  `activating (auto-restart)`). Fixed by making the driver explicit instead
  of relying on SQLAlchemy's default: `write_envs.sh` now builds
  `postgresql+psycopg2://...` URLs (see §5.7), which pins the driver
  regardless of which SQLAlchemy version a future `pip install` resolves.
  The unpinned-`sqlalchemy` requirements files themselves were left as-is —
  pinning them too is a worthwhile follow-up, see §9.
- **Two live secrets were found committed to git** and rotated as part of
  this deployment (new values generated, never written back to the repo):
  1. `backend/auth-service/.env` — a real Neon Postgres URL (commented out)
     and the live JWT `SECRET_KEY`.
  2. `backend/auth-service/alembic.ini` — a *different*, also-live Neon
     connection string hardcoded as `sqlalchemy.url`. Fixed by having
     `alembic/env.py` read `DATABASE_URL` from the app's own settings
     instead, and replacing the ini value with a harmless placeholder.

---

## 9. Outstanding follow-ups (not blocking, but worth doing)

- **Pin `sqlalchemy` in the 7 backend `requirements.txt` files that
  currently leave it unversioned** (`product-service`, `supplier-service`,
  `sale-service`, `purchase-service`, `expense-service`,
  `settings-service`, `shop-service` — only `auth-service` pins it). The
  `+psycopg2` fix in §5.7/§8 makes the *current* deploy driver-version-proof,
  but an unpinned transitive dependency is still a live landmine for the
  next `pip install` on a fresh venv (§5.8) — pin to `SQLAlchemy==2.0.50` to
  match `auth-service`, or deliberately upgrade everything together and
  test, rather than letting it drift silently per-service.
- **No deploy key needed anymore, but the VPS checkout still isn't a real
  git clone.** The repo moved from a private `nikuze2026/A-T-Consulatnts`
  to the public `njosuedev/higoverse-os` (§12), so a deploy key is now
  moot — a plain `git clone`/`git pull` needs no credentials at all. But
  the VPS's `/root/projects/higoverse` was populated by the one-shot
  `tar`-over-SSH copy (§5.4) before the public repo existed, so it still
  has no `.git` directory and `git pull` (§6) won't work there yet. Turn it
  into a real checkout once the pending local fixes (§13's "pending as of
  this writing" entry) are committed and pushed to `main` — otherwise a
  `git reset --hard origin/main` on the VPS would overwrite the
  already-applied `write_envs.sh` fix with the pre-fix version still on
  `main`:
  ```bash
  cd /root/projects/higoverse
  git init -q
  git remote add origin https://github.com/njosuedev/higoverse-os.git
  git fetch -q origin
  git reset --hard origin/main   # only after origin/main has the write_envs.sh fix
  ```
- **🔴 URGENT — git history contains two previously-leaked credentials, and
  the repo is now public.** This was written as a hypothetical ("if this
  repo is ever made public") when the repo was still private; as of
  2026-10-01 it is **public** (`github.com/njosuedev/higoverse-os`), so the
  exposure is live, not theoretical. The repo's history (every commit,
  going back to `7181c83`) still contains the original `backend/auth-service/.env`
  (a real Neon Postgres connection string, commented out, plus the live JWT
  `SECRET_KEY` used before rotation) and `backend/auth-service/alembic.ini`
  (a second, different live Neon connection string hardcoded as
  `sqlalchemy.url`). Removing the files in a later commit did **not** remove
  them from history — anyone can `git log -p` or `git show` an old commit
  and read them right now. Two separate actions needed, and the first one
  is time-sensitive:
  1. **Rotate those specific credentials at the source (Neon console)
     immediately**, regardless of whether the old Vercel deployment is
     still live — a public repo means this is no longer "if," assume
     they're compromised. (This is independent of the *new*,
     never-committed secrets this VPS deployment uses — see §3 — which are
     not affected.)
  2. **Scrub the git history** (`git filter-repo` to strip those two files
     from every commit, then force-push) so the credentials stop being
     visible to new clones/forks. This is destructive to repo history
     (rewrites every commit SHA, breaks any existing fork/clone's ability
     to fast-forward) — do it deliberately, coordinate with anyone else
     with a clone, and only after step 1, not instead of it.
- **SMTP is not configured** (`SMTP_USER`/`SMTP_PASS` are blank in
  `auth-service/.env`), so "forgot password" emails will 503 with "Email
  service is not configured" until you provide real SMTP credentials (a
  Gmail address + App Password, given the default host is `smtp.gmail.com`).
  Once you have them: fill in `backend/auth-service/.env` and
  `systemctl restart higoverse-auth-service`.
- ~~No automated backups~~ — **done 2026-10-03**: nightly verified dumps on
  the VPS plus a daily off-server copy; see §4 "Database backups".
- **Single VPS, no redundancy.** Fine for now; if this becomes
  business-critical, consider a managed Postgres instance (so a VPS
  rebuild doesn't risk data) and/or a second app node behind a load balancer.

---

## 10. Domain + TLS

> This section describes the `higoverse.com` domain/TLS setup on the new,
> from-scratch VPS (`102.202.208.190`) built via §5 — not an in-place
> migration of the old `atconsultants.rw` box (§11 doesn't apply here).

The domain is `higoverse.com`, pointed at this VPS (`A` record →
`102.202.208.190`). The subdomain-per-service scheme from the original plan
was dropped in favor of the **path-based** routing this deployment already
used from day one (`/svc/<name>/...`) — simpler, one DNS record, one
certificate, and zero CORS changes since the frontend and every backend now
share one origin.

### DNS is managed in Cloudflare, proxied

`higoverse.com`'s nameservers point at Cloudflare (dashboard shows "DNS
Setup: Full", meaning Cloudflare is authoritative, not just hosting a CNAME).
Two records exist, both **proxied** (orange cloud, not "DNS only"):

| Name              | Type  | Content           | Proxy    |
|-------------------|-------|-------------------|----------|
| `higoverse.com`   | A     | `102.202.208.190` | Proxied  |
| `www.higoverse.com` | CNAME | `higoverse.com` | Proxied  |

What proxied means in practice here:

- Public DNS for `higoverse.com` resolves to **Cloudflare's edge IPs**, not
  `102.202.208.190` directly — `dig`/`nslookup` from outside will show
  Cloudflare anycast addresses, not the origin. This is expected; don't
  "fix" it.
- Cloudflare terminates the visitor-facing TLS connection itself, then opens
  its own connection to the origin (this VPS) on port 80 or 443 depending on
  Cloudflare's **SSL/TLS encryption mode** (dashboard → SSL/TLS →
  Overview). With a valid Let's Encrypt cert on the origin (see below), set
  this to **Full** or **Full (strict)** — *not* "Flexible". Flexible means
  Cloudflare talks HTTP to the origin, which collides with nginx's own
  HTTP→HTTPS redirect (the certbot-managed block in `higoverse.conf`) and
  can produce a redirect loop visitors see as `ERR_TOO_MANY_REDIRECTS`.
- **Certbot's HTTP-01 challenge still works through the proxy** — Cloudflare
  forwards `/.well-known/acme-challenge/*` requests to the origin on port 80
  like any other path, so `certbot --nginx` (§5.12 below) needs no special
  handling. This was confirmed working during the 2026-10-01 deploy with the
  proxy already on.
- Cloudflare's own dashboard surfaces "Recommendations" (e.g. "Visitors
  cannot reach higoverse.com") based on whether it can actually reach the
  origin — if nginx isn't running yet, or the box is mid-rebuild, expect to
  see these until the origin actually answers on 80/443. They're a live
  reachability check, not a one-time DNS propagation warning.
- Renewal (`certbot.timer`, see below) will also go through the proxy the
  same way — no reconfiguration needed as long as the A record stays
  proxied and pointed at this origin.

What this involves:

1. **nginx** (`/etc/nginx/sites-available/higoverse.conf`) — set
   `server_name higoverse.com;` on the `listen 80 default_server` block
   (still catches bare-IP requests too), no other changes needed — the
   `/svc/<name>/` locations and the frontend catch-all were already there.
2. **TLS** — issued via:
   ```bash
   certbot --nginx -d higoverse.com \
     --agree-tos --email pacifiquemurangwa001@gmail.com \
     --non-interactive --redirect
   ```
   Certbot rewrites `higoverse.conf` itself: adds a `listen 443 ssl` server
   block with the cert/key paths, and turns the old port-80 block into an
   HTTP→HTTPS redirect for `Host: higoverse.com` (anything else on port 80,
   e.g. the bare IP, gets a plain `404` — that's certbot's default, not
   something added manually). Auto-renewal runs via `certbot.timer` (check
   with `systemctl list-timers | grep certbot`; renews automatically well
   before the cert's 90-day expiry).
3. **No frontend rebuild is strictly required** for API calls to keep
   working — `NEXT_PUBLIC_*_API` are relative paths (`/svc/auth`, etc.), so
   they're host-and-scheme-agnostic by construction. A rebuild *is* still
   needed to pick up the hardcoded `higoverse.com` references in
   SEO/metadata code (`app/layout.tsx`'s `metadataBase` and Open Graph
   `url`, `app/sitemap.ts`, `app/robots.ts`) — cosmetic/SEO only, never
   affects app functionality.
4. **No CORS changes are needed** — everything (frontend + all 8 `/svc/*`
   APIs) is genuinely same-origin under `https://higoverse.com`, so the
   browser never sends a cross-origin request in the first place.

### If you ever do want per-service subdomains later

Nothing above forecloses it — add `api.<service>.higoverse.com` A
records, add a matching `server {}` block per subdomain proxying to the same
internal port, re-run `certbot --nginx -d ... ` with the new hostnames, then
switch the 6 browser-facing `NEXT_PUBLIC_*_API` values from relative paths
to the new absolute URLs and rebuild — at that point (and only then) CORS
starts to matter, because it becomes genuinely cross-origin: add the
frontend's origin to `CORS_ALLOWED_ORIGIN_REGEX` (`auth-service`,
`product-service`) and to the hardcoded `_ALLOWED_ORIGINS` set in the other
six services' `main.py`.

---

## 11. Rebrand Migration Runbook (A & T Consultants → Higoverse)

> **Not used for this deployment — confirmed historical as of 2026-10-01.**
> A brand-new VPS (`102.202.208.190`) was provisioned instead of migrating
> the old `atconsultants.rw` box (`102.202.208.195`) in place; it was built
> from a blank Ubuntu image by following §5, and is now the live
> `higoverse.com` deployment (see §13). None of the steps below ran against
> either box. This runbook is kept only in case the *old* box (`.195`,
> still running `aandt-*` units as of this writing) ever needs the same
> in-place rename treatment — e.g. if you decide to keep it around as a
> second environment rather than decommissioning it per §9.

This is a **runbook, not something already executed.** It's for whoever has
root on the live VPS, to actually cut the running deployment over from the
old `atconsultants.rw` / `aandt-*` / `aandt_app` naming to the `higoverse.com`
/ `higoverse-*` / `higoverse_app` naming this document now uses everywhere
else. Run it deliberately, during a maintenance window — it touches
systemd, the DB role, TLS, and DNS. Expect a few minutes of downtime between
stopping the old units and bringing the renamed ones up.

**Prerequisites:** `higoverse.com`'s DNS `A` record must already point at
this VPS's IP (`102.202.208.195`) before you request the new TLS cert in
step 7, or certbot's HTTP-01 challenge will fail.

1. **Pull the rebranded code:**
   ```bash
   cd /root/projects/A-T-Consulatnts   # old checkout path, pre-migration
   git pull
   ```

2. **Stop everything:**
   ```bash
   systemctl stop 'aandt-*'
   ```

3. **Rename the Postgres role** (in place — no data moves):
   ```bash
   su - postgres -c "psql -v ON_ERROR_STOP=1" << 'SQL'
   ALTER ROLE aandt_app RENAME TO higoverse_app;
   SQL
   ```
   The role's password is unchanged, so `pg_app_password` in the secrets
   dir (moved in the next step) still matches.

4. **Move the secrets dir:**
   ```bash
   mv /etc/aandt /etc/higoverse
   ```

5. **Move the checkout dir:**
   ```bash
   mv /root/projects/A-T-Consulatnts /root/projects/higoverse
   cd /root/projects/higoverse
   ```

6. **Regenerate every backend `.env`** now that the secrets dir, DB role,
   and checkout path have all changed (the already-rebranded
   `deploy/write_envs.sh` writes the new `higoverse_app`/`/etc/higoverse`
   values):
   ```bash
   bash deploy/write_envs.sh
   ```

7. **Swap the nginx config and re-issue TLS for the new domain:**
   ```bash
   rm -f /etc/nginx/sites-enabled/aandt.conf
   cp deploy/nginx-higoverse.conf /etc/nginx/sites-available/higoverse.conf
   ln -sf /etc/nginx/sites-available/higoverse.conf /etc/nginx/sites-enabled/higoverse.conf
   nginx -t && systemctl restart nginx
   certbot --nginx -d higoverse.com --agree-tos --email <your-email> --non-interactive --redirect
   ```
   (Leave the old `atconsultants.rw` cert/DNS alone until you're confident
   in the cutover — certbot won't touch a domain you don't pass it.)

8. **Rewrite the systemd units** — for each of the 10 old
   `/etc/systemd/system/aandt-<svc>.service` / `aandt-web.service` files,
   create the `higoverse-` equivalent with updated `WorkingDirectory=`,
   `EnvironmentFile=`, `ExecStart=`, and `ReadWritePaths=` (all now under
   `/root/projects/higoverse/...` — see the templates in §5.10/§5.11), then:
   ```bash
   rm -f /etc/systemd/system/aandt-*.service
   systemctl daemon-reload
   for svc in auth-service product-service supplier-service sale-service \
              purchase-service expense-service settings-service shop-service report-service web; do
     systemctl enable --now "higoverse-${svc}"
   done
   ```

9. **Rebuild the frontend** (it has hardcoded `higoverse.com` SEO metadata
   now baked in at build time):
   ```bash
   cd apps/web && npm install && NODE_OPTIONS="--max-old-space-size=1536" npm run build
   cd /root/projects/higoverse
   ```

10. **Smoke test**, same as §5.14, then confirm externally: visit
    `https://higoverse.com/login` in a browser and confirm the page loads
    with the "Higoverse" branding and a valid cert.

11. **Update the bootstrap/admin record** — the existing admin user's email
    is still `admin@aandtconsultants.rw` from before the rebrand; either
    update it in place or just note the old email still works for login
    (email isn't tied to the domain):
    ```bash
    su - postgres -c "psql -d authdb -c \"UPDATE users SET email = 'admin@higoverse.com' WHERE email = 'admin@aandtconsultants.rw';\""
    ```

12. **Clean up, once confident:** remove the old `atconsultants.rw` nginx
    site/cert (`certbot delete --cert-name atconsultants.rw`) and update the
    DNS record/registrar notes to point people at `higoverse.com` going
    forward. Keep `atconsultants.rw` pointed at the box for a grace period
    if existing users/bookmarks might still hit it — nginx's `server_name`
    can list both domains on the same server block if you want a transition
    period rather than a hard cutover.

---

## 12. GitHub repo: done — now `njosuedev/higoverse-os`

**Resolved.** The code now lives permanently at
`github.com/njosuedev/higoverse-os` (**public**) — the old private repo,
`github.com/nikuze2026/A-T-Consulatnts` (note the typo in "Consultants"
that had been there from the start), is no longer the repo of record. Every
checkout should point at the new URL:

```bash
git remote set-url origin https://github.com/njosuedev/higoverse-os.git
git remote -v   # confirm
```

This local working copy and the VPS checkout (§13) were both switched over
on 2026-10-01. If you find any other clone (a laptop, CI, a bookmark) still
pointed at the old `nikuze2026/A-T-Consulatnts` URL, repoint it the same
way — GitHub does not redirect between unrelated repos (this isn't a rename
of the old repo, it's a different repo entirely), so stale remotes will
simply fail to push/pull against it going forward rather than silently
redirecting.

---

## 13. Deployment history / verified-working snapshot

A point-in-time record of what was actually built and confirmed working,
for comparison when something looks wrong later ("was this always like
this, or did it break?"). Update this section after any deploy that changes
the shape of the system (new service, schema change, infra move) — it's
meant to stay a living snapshot, not a frozen changelog entry.

### 2026-10-01 — initial production deploy

Executed end-to-end via §5 against a completely blank Ubuntu 24.04 image —
confirmed beforehand that nothing was installed, no code was checked out,
and ports 80/443 refused connections. Notable deviations from the plan as
originally written, all folded into the sections above:

- Code arrived via `tar`-over-SSH (§5.4), not `git clone` — the GitHub repo
  is private and the box had no credentials.
- `write_envs.sh` needed the `+psycopg2` driver fix (§5.7/§8) after 7 of 9
  backend services crash-looped on an unpinned `sqlalchemy` resolving to an
  incompatible version.
- §5.9 and §5.13's `source <(grep ...)` snippets were replaced with
  `python-dotenv` loading — the original form breaks on `SMTP_FROM`'s
  unescaped `<` in the auth-service `.env` (§5.9's note has the full
  explanation).
- DNS/TLS runs through a Cloudflare proxy that wasn't part of the original
  §10 write-up — see §10's new "DNS is managed in Cloudflare, proxied"
  subsection. Certbot's HTTP-01 challenge worked through it with no special
  handling needed.

**Verified working at completion:**

| Check | Result |
|---|---|
| All 9 backend systemd units | `active (running)` |
| `higoverse-web` (Next.js) | `active (running)` |
| `authdb` tables | `alembic_version, password_resets, refresh_tokens, roles, shops, users` (6) |
| `shopdb` tables | `debts, expenses, password_resets, products, proformas, purchases, refresh_tokens, roles, sales, shop_settings, shops, suppliers, users` (13) |
| `nginx -t` | syntax OK |
| TLS cert | issued, expires 2026-12-30, `certbot.timer` enabled for auto-renewal |
| `https://higoverse.com/` | 200 (confirmed from outside the VPS, through Cloudflare) |
| `https://higoverse.com/login` | 200 |
| `https://higoverse.com/svc/auth/health` | `{"status":"ok", ...}` with the table lists above |
| `ufw status` | active; 22, 222, 80, 443 allowed (plus the pre-existing 60124/udp console-agent rule) |
| `fail2ban-client status sshd` | active and already banned one unrelated scanning IP during setup — confirms it's functioning |
| Admin user | `admin@higoverse.com` created, password in `/etc/higoverse/bootstrap_admin_password` |
| Memory at completion | ~741Mi used + ~443Mi swap, of 1.9Gi total + 2Gi swap — some headroom, not a lot (§4's resource-monitoring guidance applies) |

**Not done as part of this deploy** (see §9 for the full outstanding list):
SMTP credentials, automated DB backups, pinning the unpinned `sqlalchemy`
requirement, a `git` deploy key for future `git pull`s, decommissioning the
old `atconsultants.rw` VPS.

### 2026-10-03 — inventory-first UI release + automated backups

- Deployed `62bce57` (backend) and `18811be` (web) via §6: all 9 services
  restarted healthy, `higoverse-web` rebuilt. Only schema change: the
  additive index `ix_products_shop_created` (no rows modified). Verified
  read-only afterwards: 115 products across 3 shops, none without `shop_id`.
- Fixed in production: listing/recording purchases 401'd through the
  Next.js proxy (trailing-slash redirect dropped the auth header).
- Backups automated (§4) and a restore test passed — every table's row
  count matched production.

