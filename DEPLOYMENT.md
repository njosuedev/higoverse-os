# A & T Consultants — VPS Deployment

This document describes the production deployment of the Shops Network platform
on a single Ubuntu VPS, how to operate it day-to-day, how to rebuild it from
scratch, and how to switch on the real domain once it's purchased.

Current host: `sc-kgl-1-cpu1-ram2gb-40gb-ubu` (Ubuntu 24.04, 1 vCPU, 2GB RAM,
40GB disk), public IP `102.202.208.195`.

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
     │  aandt-web)       │  │ settings:8006 shops:8007 reports:8008   │
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

| Service           | systemd unit                  | Port | DB       |
|-------------------|--------------------------------|------|----------|
| auth-service      | `aandt-auth-service`          | 8000 | authdb + shopdb |
| product-service   | `aandt-product-service`       | 8001 | shopdb   |
| supplier-service  | `aandt-supplier-service`      | 8002 | shopdb   |
| sale-service      | `aandt-sale-service`          | 8003 | shopdb   |
| purchase-service  | `aandt-purchase-service`      | 8004 | shopdb   |
| expense-service   | `aandt-expense-service`       | 8005 | shopdb   |
| settings-service  | `aandt-settings-service`      | 8006 | shopdb   |
| shop-service      | `aandt-shop-service`          | 8007 | authdb   |
| report-service    | `aandt-report-service`        | 8008 | none (calls sales/purchases/products over HTTP) |
| web (Next.js)     | `aandt-web`                   | 3000 | —        |

> **Note:** `shop-service` is deployed and healthy, but the current frontend
> code doesn't call it — shop-profile reads/writes go through `auth-service`'s
> `/api/v1/shop*` endpoints instead (`apps/web/lib/shop-api.ts` calls
> `AUTH_API`, not a shop-service URL). It's likely a legacy/future service.
> Nothing to fix, just worth knowing before you wonder why its logs show no
> traffic.

---

## 2. Where everything lives

- **Code:** `/root/projects/A-T-Consulatnts` (this is both the git checkout
  and the live deployment directory — there is no separate "build" copy).
- **Backend venvs:** `backend/<service>/.venv/` (one per service, not shared).
- **Backend secrets:** `backend/<service>/.env` (mode `600`, gitignored).
- **Frontend build:** `apps/web/.next/` (produced by `npm run build`).
- **Frontend public env:** `apps/web/.env.production` (build-time
  `NEXT_PUBLIC_*` values — not secret, just base URLs, but gitignored anyway).
- **Systemd units:** `/etc/systemd/system/aandt-*.service`.
- **nginx config:** `/etc/nginx/sites-available/aandt.conf` (symlinked into
  `sites-enabled/`; the default nginx site was removed).
- **Shared secrets root:** `/etc/aandt/` (mode `700`, root-only):
  - `jwt_secret` — the shared `SECRET_KEY` used by all 8 backend services to
    sign/verify JWTs (must be identical across all of them).
  - `pg_app_password` — password for the `aandt_app` Postgres role.
  - `bootstrap_admin_password` — the first platform-admin login (see §7).

None of these secret files are committed to git. `backend/*/.env` files are
regenerated from `/etc/aandt/*` by the script kept at
`/root/projects/A-T-Consulatnts/deploy/write_envs.sh` (see §5 for a copy of it).

---

## 3. Security posture

- **Firewall (ufw):** only `22`, `222` (ssh), `80`, `443` inbound (plus a
  pre-existing rule for the console agent on `60124/udp`). Everything else
  is denied by default.
- **fail2ban:** watching sshd on ports 22 and 222, 5 attempts / 10 min → 1h ban.
- **All app processes bind to `127.0.0.1` only** — never directly reachable
  from the internet, only through nginx.
- **systemd sandboxing** on every `aandt-*` unit: `NoNewPrivileges=yes`,
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
  A future hardening step would be to create a `svc-aandt` system user, chown
  the tree, and switch `User=`/`Group=` in each unit.

---

## 4. Day-2 operations

### Check everything at a glance

```bash
systemctl list-units 'aandt-*' --no-pager
```

### Per-service control

```bash
systemctl status  aandt-auth-service      # or any aandt-<service>, aandt-web
systemctl restart aandt-auth-service
systemctl stop    aandt-auth-service
journalctl -u aandt-auth-service -f       # follow logs live
journalctl -u aandt-auth-service -n 100   # last 100 lines
```

### Restart everything

```bash
systemctl restart 'aandt-*'
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

Application role is `aandt_app`; password is in `/etc/aandt/pg_app_password`.

### Database backups

Nothing automated is set up yet. Minimum viable backup, run as a daily cron:

```bash
mkdir -p /var/backups/aandt
pg_dump -U postgres authdb | gzip > /var/backups/aandt/authdb-$(date +%F).sql.gz
pg_dump -U postgres shopdb | gzip > /var/backups/aandt/shopdb-$(date +%F).sql.gz
find /var/backups/aandt -mtime +14 -delete   # keep 2 weeks
```

Add to root's crontab (`crontab -e`):
```
0 3 * * * /usr/bin/pg_dump -U postgres authdb | gzip > /var/backups/aandt/authdb-$(date +\%F).sql.gz
5 3 * * * /usr/bin/pg_dump -U postgres shopdb | gzip > /var/backups/aandt/shopdb-$(date +\%F).sql.gz
```
Off-box copies (e.g. `rclone`/`scp` to another host or object storage) are
strongly recommended once this holds real customer data — a single VPS disk
is a single point of failure.

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

```bash
git clone https://github.com/nikuze2026/A-T-Consulatnts.git /root/projects/A-T-Consulatnts
cd /root/projects/A-T-Consulatnts
```

### 5.5 PostgreSQL

```bash
systemctl enable --now postgresql
PGPASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
mkdir -p /etc/aandt && chmod 700 /etc/aandt
printf '%s' "$PGPASS" > /etc/aandt/pg_app_password && chmod 600 /etc/aandt/pg_app_password

su - postgres -c "psql -v ON_ERROR_STOP=1" << SQL
CREATE ROLE aandt_app LOGIN PASSWORD '$PGPASS';
SQL
su - postgres -c "createdb -O aandt_app authdb"
su - postgres -c "createdb -O aandt_app shopdb"
```

### 5.6 Shared JWT secret

```bash
openssl rand -hex 32 > /etc/aandt/jwt_secret
chmod 600 /etc/aandt/jwt_secret
```

### 5.7 Per-service `.env` files

Use `deploy/write_envs.sh` (create it if it doesn't exist yet — contents
below), which reads the secrets above and writes one `.env` per backend
service with the right `DATABASE_URL`/`SHOP_DB_URL` and internal
service-to-service URLs:

```bash
#!/bin/bash
set -euo pipefail
ROOT=/root/projects/A-T-Consulatnts/backend
JWT=$(cat /etc/aandt/jwt_secret)
PGPASS=$(cat /etc/aandt/pg_app_password)
AUTHDB="postgresql://aandt_app:${PGPASS}@127.0.0.1:5432/authdb"
SHOPDB="postgresql://aandt_app:${PGPASS}@127.0.0.1:5432/shopdb"

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
  "SMTP_FROM=A & T Consultants <noreply@higoverse.com>"

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
cd /root/projects/A-T-Consulatnts/backend
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
cd /root/projects/A-T-Consulatnts/backend/auth-service
set -a; source <(grep -v CORS_ALLOWED_ORIGIN_REGEX .env); set +a
./.venv/bin/python -c "from app.main import on_startup; on_startup()"
./.venv/bin/alembic stamp head
```

The other 7 services create their own tables automatically the first time
they start (next step) — no manual action needed for them.

### 5.10 systemd units (backend)

For each service/port pair below, write `/etc/systemd/system/aandt-<svc>.service`:

```
auth-service:8000  product-service:8001  supplier-service:8002  sale-service:8003
purchase-service:8004  expense-service:8005  settings-service:8006  shop-service:8007
report-service:8008
```

Template (substitute `<svc>` and `<port>`):

```ini
[Unit]
Description=A&T Consultants - <svc>
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=/root/projects/A-T-Consulatnts/backend/<svc>
EnvironmentFile=/root/projects/A-T-Consulatnts/backend/<svc>/.env
Environment=PYTHONUNBUFFERED=1
ExecStart=/root/projects/A-T-Consulatnts/backend/<svc>/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port <port>
Restart=on-failure
RestartSec=3

NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/root/projects/A-T-Consulatnts/backend/<svc>

[Install]
WantedBy=multi-user.target
```

> ⚠️ Do not add `ProtectHome=yes` — see §3.

Then:

```bash
systemctl daemon-reload
for svc in auth-service product-service supplier-service sale-service \
           purchase-service expense-service settings-service shop-service report-service; do
  systemctl enable --now "aandt-${svc}"
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
cd /root/projects/A-T-Consulatnts/apps/web
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

systemd unit `/etc/systemd/system/aandt-web.service`:

```ini
[Unit]
Description=A&T Consultants - web frontend (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/projects/A-T-Consulatnts/apps/web
Environment=NODE_ENV=production
EnvironmentFile=/root/projects/A-T-Consulatnts/apps/web/.env.production
ExecStart=/usr/bin/npx next start -p 3000 -H 127.0.0.1
Restart=on-failure
RestartSec=3

NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/root/projects/A-T-Consulatnts/apps/web

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now aandt-web
```

### 5.12 nginx

`/etc/nginx/sites-available/aandt.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 25m;

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        $connection_upgrade;

    location /svc/auth/       { proxy_pass http://127.0.0.1:8000/; }
    location /svc/products/   { proxy_pass http://127.0.0.1:8001/; }
    location /svc/suppliers/  { proxy_pass http://127.0.0.1:8002/; }
    location /svc/sales/      { proxy_pass http://127.0.0.1:8003/; }
    location /svc/purchases/  { proxy_pass http://127.0.0.1:8004/; }
    location /svc/expenses/   { proxy_pass http://127.0.0.1:8005/; }
    location /svc/settings/   { proxy_pass http://127.0.0.1:8006/; }
    location /svc/shops/      { proxy_pass http://127.0.0.1:8007/; }
    location /svc/reports/    { proxy_pass http://127.0.0.1:8008/; }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

```bash
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/aandt.conf /etc/nginx/sites-enabled/aandt.conf
nginx -t && systemctl enable --now nginx && systemctl reload nginx
```

### 5.13 Bootstrap the first admin user

There is no public signup — admins are created directly, and only an
existing admin can create shops/staff via the API. So the very first admin
has to be inserted straight into the database:

```bash
cd /root/projects/A-T-Consulatnts/backend/auth-service
ADMIN_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)
printf '%s' "$ADMIN_PASS" > /etc/aandt/bootstrap_admin_password
chmod 600 /etc/aandt/bootstrap_admin_password

set -a; source <(grep -v CORS_ALLOWED_ORIGIN_REGEX .env); set +a
./.venv/bin/python << 'PYEOF'
import uuid
from datetime import datetime, timezone
from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import hash_password

pw = open("/etc/aandt/bootstrap_admin_password").read().strip()
db = SessionLocal()
u = User(
    id=uuid.uuid4(), name="Platform Admin", email="admin@aandtconsultants.rw",
    password_hash=hash_password(pw), role="admin", shop_id=None,
    is_active=True, created_at=datetime.now(timezone.utc),
)
db.add(u); db.commit(); db.close()
print("admin created:", u.email)
PYEOF
```

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
cd /root/projects/A-T-Consulatnts
git pull

# Backend service(s) that changed:
backend/<svc>/.venv/bin/pip install -r backend/<svc>/requirements.txt   # only if requirements.txt changed
systemctl restart aandt-<svc>

# Frontend, if apps/web changed:
cd apps/web
npm install                          # only if package.json changed
NODE_OPTIONS="--max-old-space-size=1536" npm run build
systemctl restart aandt-web
```

If a backend model changed in a way that needs a new column, either add it
to the relevant `_MIGRATIONS`/idempotent-`ALTER` list in that service's
`app/main.py` (the pattern already used throughout this codebase) so it
self-heals on next restart, or run the ALTER by hand against `authdb`/`shopdb`.

---

## 7. First login

- URL: `http://102.202.208.195/login` (until the domain is live)
- Email: `admin@aandtconsultants.rw`
- Password: see `/etc/aandt/bootstrap_admin_password` on the VPS (also given
  to you once, out-of-band, when this was set up — change it after first
  login via the profile/change-password flow, or by re-running the snippet
  in §5.13 with a new password).

This account has `role=admin` and no shop — use it to create real shops and
their owner accounts via the admin panel (`admin.py`'s `POST /api/v1/admin/shops`),
since there is no public self-registration.

---

## 8. Notable things fixed/decided during setup (context for future-you)

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

- **Git history still contains both old leaked secrets.** Removing the
  files in a new commit (done) does not remove them from history. If this
  repo is ever made public, or if the old Neon databases/JWT key are still
  in active use by the previous Vercel deployment, those credentials should
  be rotated at the source (Neon console) and the git history scrubbed
  (`git filter-repo` + force-push) — that's a destructive operation, do it
  deliberately and only when you're ready, not as a reflex.
- **SMTP is not configured** (`SMTP_USER`/`SMTP_PASS` are blank in
  `auth-service/.env`), so "forgot password" emails will 503 with "Email
  service is not configured" until you provide real SMTP credentials (a
  Gmail address + App Password, given the default host is `smtp.gmail.com`).
  Once you have them: fill in `backend/auth-service/.env` and
  `systemctl restart aandt-auth-service`.
- **No TLS yet** — everything is plain HTTP on the bare IP. See §10.
- **No automated backups yet** — see §4's backup section; nothing is
  scheduled by default.
- **Single VPS, no redundancy.** Fine for now; if this becomes
  business-critical, consider a managed Postgres instance (so a VPS
  rebuild doesn't risk data) and/or a second app node behind a load balancer.

---

## 10. Adding the domain (next step, once purchased)

Requested scheme: each backend service gets its own subdomain of the form
`api.<service>.<domain>` (e.g. `api.auth.aandt.rw`, `api.sales.aandt.rw`),
with the frontend at the bare domain (`aandt.rw` / `www.aandt.rw`).

1. **DNS** — create these A records, all pointing at `102.202.208.195`:
   `@` (or `www`), and one per service: `api.auth`, `api.products`,
   `api.suppliers`, `api.sales`, `api.purchases`, `api.expenses`,
   `api.settings`, `api.shops`, `api.reports`.
2. **nginx** — add a `server {}` block per subdomain (9 backend blocks + 1
   frontend block), each with its own `server_name` and the same
   `proxy_pass` target it already has under `/svc/<name>/` today — just
   drop the path prefix since the subdomain itself is now the routing key.
   Keep the existing bare-IP `server_name _` block as a fallback during the
   transition.
3. **TLS** — once DNS has propagated:
   ```bash
   certbot --nginx -d aandt.rw -d www.aandt.rw \
     -d api.auth.aandt.rw -d api.products.aandt.rw -d api.suppliers.aandt.rw \
     -d api.sales.aandt.rw -d api.purchases.aandt.rw -d api.expenses.aandt.rw \
     -d api.settings.aandt.rw -d api.shops.aandt.rw -d api.reports.aandt.rw
   ```
   Certbot edits the nginx config in place to add the `listen 443 ssl`
   blocks and redirects; it also sets up auto-renewal via a systemd timer
   (`systemctl list-timers | grep certbot`).
4. **Frontend rebuild** — switch `apps/web/.env.production`'s 6 relative
   `NEXT_PUBLIC_*_API` paths to the new absolute HTTPS subdomain URLs (e.g.
   `NEXT_PUBLIC_AUTH_API=https://api.auth.aandt.rw`), and the 2 internal
   ones can stay as `http://127.0.0.1:PORT` (those are server-side only,
   never exposed). Since these six become genuinely cross-origin once
   they're on separate subdomains from the frontend, each backend's CORS
   config needs to allow the frontend's new origin:
   - `auth-service` and `product-service` already read
     `CORS_ALLOWED_ORIGIN_REGEX` from `.env` — just add the new domain to
     that regex.
   - The other four (`purchase`, `sale`, `settings`, `supplier`, `expense`,
     `shop`) hardcode `_ALLOWED_ORIGINS` as a Python set in each `main.py`
     — add `"https://aandt.rw"` (and `www`) to that set in each file.
   Then:
   ```bash
   cd apps/web && npm run build && systemctl restart aandt-web
   for s in auth product purchase sale settings supplier expense shop; do
     systemctl restart aandt-${s}-service
   done
   ```
5. **Update `CORS_ALLOWED_ORIGIN_REGEX`** in `auth-service/.env` and
   `product-service/.env` the same way, then restart those two as well.

Until step 4/5 land, the bare-IP path-based setup (`/svc/<name>/`) keeps
working exactly as it does today — nothing about adding the domain requires
downtime, it's an additive rebuild-and-cutover.
