#!/bin/bash
# Nightly backup of the Higoverse databases (authdb + shopdb).
#
# Read-only against Postgres: pg_dump takes a consistent snapshot and never
# modifies data. Each dump is written to a temp file, verified with
# pg_restore --list, and only then moved into place — a failed or truncated
# dump can never replace a good one. Backups older than KEEP_DAYS are pruned,
# but the newest backup of each database is always kept.
#
# Installed on the VPS as /usr/local/bin/higoverse-backup and run daily by
# higoverse-backup.timer (see DEPLOYMENT.md "Database backups").
set -euo pipefail

BACKUP_DIR=/var/backups/higoverse
KEEP_DAYS=14
STAMP=$(date -u +%Y-%m-%dT%H%MZ)

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

for db in authdb shopdb; do
  final="$BACKUP_DIR/$db-$STAMP.dump"
  tmp="$final.partial"
  # Custom format: compressed, and restorable per table if ever needed.
  runuser -u postgres -- pg_dump --format=custom --compress=6 "$db" > "$tmp"
  # Verify the archive is readable and actually contains tables.
  # Listing an archive needs no database access, so this runs as root.
  tables=$(pg_restore --list "$tmp" | grep -c " TABLE DATA " || true)
  if [ "$tables" -lt 1 ]; then
    echo "ERROR: $db dump has no table data — keeping previous backups, discarding $tmp" >&2
    rm -f "$tmp"
    exit 1
  fi
  mv "$tmp" "$final"
  echo "ok $db -> $final ($(du -h "$final" | cut -f1), $tables tables)"
done

# Prune old backups, never touching the newest one per database.
for db in authdb shopdb; do
  newest=$(ls -1t "$BACKUP_DIR"/$db-*.dump 2>/dev/null | head -1)
  find "$BACKUP_DIR" -maxdepth 1 -name "$db-*.dump" -mtime +"$KEEP_DAYS" ! -path "$newest" -print -delete
done
# Leftovers from an interrupted run.
find "$BACKUP_DIR" -maxdepth 1 -name "*.partial" -mmin +60 -delete
