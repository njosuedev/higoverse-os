#!/bin/bash
set -euo pipefail

ROOT=/root/projects/higoverse/backend
JWT=$(cat /etc/higoverse/jwt_secret)
PGPASS=$(cat /etc/higoverse/pg_app_password)

AUTHDB="postgresql://higoverse_app:${PGPASS}@127.0.0.1:5432/authdb"
SHOPDB="postgresql://higoverse_app:${PGPASS}@127.0.0.1:5432/shopdb"

write_env() {
  local dir="$1"; shift
  local file="$ROOT/$dir/.env"
  {
    for kv in "$@"; do
      echo "$kv"
    done
  } > "$file"
  chmod 600 "$file"
  echo "wrote $file"
}

write_env auth-service \
  "DATABASE_URL=${AUTHDB}" \
  "SHOP_DB_URL=${SHOPDB}" \
  "SECRET_KEY=${JWT}" \
  "ALGORITHM=HS256" \
  "ACCESS_TOKEN_EXPIRE_MINUTES=60" \
  "REFRESH_TOKEN_EXPIRE_DAYS=30" \
  "CORS_ALLOWED_ORIGIN_REGEX=^https?://localhost(:\\d+)?\$|^https?://127\\.0\\.0\\.1(:\\d+)?\$|^https?://102\\.202\\.208\\.195(:\\d+)?\$" \
  "SMTP_HOST=smtp.gmail.com" \
  "SMTP_PORT=587" \
  "SMTP_USER=" \
  "SMTP_PASS=" \
  "SMTP_FROM=Higoverse <noreply@higoverse.com>"

write_env product-service \
  "DATABASE_URL=${SHOPDB}" \
  "SECRET_KEY=${JWT}" \
  "AUTH_SERVICE_ALGORITHM=HS256" \
  "SUPPLIER_SERVICE_URL=http://127.0.0.1:8002" \
  "CORS_ALLOWED_ORIGIN_REGEX=^https?://localhost(:\\d+)?\$|^https?://127\\.0\\.0\\.1(:\\d+)?\$|^https?://102\\.202\\.208\\.195(:\\d+)?\$"

write_env supplier-service \
  "DATABASE_URL=${SHOPDB}" \
  "SECRET_KEY=${JWT}" \
  "AUTH_SERVICE_ALGORITHM=HS256"

write_env sale-service \
  "DATABASE_URL=${SHOPDB}" \
  "SECRET_KEY=${JWT}" \
  "AUTH_SERVICE_ALGORITHM=HS256" \
  "PRODUCT_SERVICE_URL=http://127.0.0.1:8001"

write_env purchase-service \
  "DATABASE_URL=${SHOPDB}" \
  "SECRET_KEY=${JWT}" \
  "AUTH_SERVICE_ALGORITHM=HS256" \
  "PRODUCT_SERVICE_URL=http://127.0.0.1:8001"

write_env expense-service \
  "DATABASE_URL=${SHOPDB}" \
  "SECRET_KEY=${JWT}" \
  "AUTH_SERVICE_ALGORITHM=HS256"

write_env settings-service \
  "DATABASE_URL=${SHOPDB}" \
  "SECRET_KEY=${JWT}" \
  "AUTH_SERVICE_ALGORITHM=HS256"

write_env shop-service \
  "DATABASE_URL=${AUTHDB}" \
  "SECRET_KEY=${JWT}" \
  "AUTH_SERVICE_ALGORITHM=HS256"

write_env report-service \
  "SECRET_KEY=${JWT}" \
  "AUTH_SERVICE_ALGORITHM=HS256" \
  "SALE_SERVICE_URL=http://127.0.0.1:8003" \
  "PURCHASE_SERVICE_URL=http://127.0.0.1:8004" \
  "PRODUCT_SERVICE_URL=http://127.0.0.1:8001"

echo "all env files written"
