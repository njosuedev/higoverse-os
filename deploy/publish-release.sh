#!/usr/bin/env bash
# Publish a new Android or Windows release for the apps' self-update.
# Runs on the VPS. Upload the build first (scp), then:
#
#   deploy/publish-release.sh android /tmp/app-release.apk 1.3.0 4 "Faster stock lists."
#   deploy/publish-release.sh windows /tmp/Higoverse-Setup-1.3.0.exe 1.3.0 - "Faster stock lists." \
#       --latest-yml /tmp/latest.yml --blockmap /tmp/Higoverse-Setup-1.3.0.exe.blockmap
#
# Options:  --force           everyone must update (no "Later")
#           --min-code N      installs older than version code N must update
#
# Arguments: platform, built file, version (1.2.3), version code ("-" for
# Windows: computed as major*10000 + minor*100 + patch), release notes.
#
# What it does, in an order that never points an app at a missing file:
#   1. copies the file into /var/www/higoverse/downloads/<android|desktop>/
#   2. computes its SHA-256 and size
#   3. rewrites releases.json (read by GET /svc/settings/api/app-updates/latest)
#   4. keeps the older feeds in step for apps from before this system:
#      android/version.json (Android 1.1–1.2), desktop/latest.yml (electron-updater)
# Every JSON/YAML file is written to a temp file and renamed (atomic).
set -euo pipefail

DOWNLOADS=${HGV_DOWNLOADS:-/var/www/higoverse/downloads}
BASE_URL=${HGV_DOWNLOADS_URL:-https://higoverse.com/downloads}

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ $# -ge 5 ] || usage
platform=$1 src=$2 version=$3 code=$4 notes=$5
shift 5
force=false min_code=0 latest_yml="" blockmap=""
while [ $# -gt 0 ]; do
  case $1 in
    --force) force=true ;;
    --min-code) min_code=$2; shift ;;
    --latest-yml) latest_yml=$2; shift ;;
    --blockmap) blockmap=$2; shift ;;
    *) usage ;;
  esac
  shift
done

[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 1; }
[ -f "$src" ] || { echo "no such file: $src" >&2; exit 1; }
IFS=. read -r major minor patch <<<"$version"

case $platform in
  android)
    dir=android; name="Higoverse-$version.apk"
    [[ $code =~ ^[0-9]+$ ]] || { echo "Android needs the versionCode (pubspec.yaml +N)" >&2; exit 1; }
    ;;
  windows)
    dir=desktop; name="Higoverse-Setup-$version.exe"
    [ "$code" = "-" ] && code=$((major * 10000 + minor * 100 + patch))
    [ -n "$latest_yml" ] && [ -f "$latest_yml" ] || { echo "Windows needs --latest-yml (dist/latest.yml)" >&2; exit 1; }
    grep -q "^version: $version\$" "$latest_yml" || { echo "latest.yml is not for $version" >&2; exit 1; }
    ;;
  *) usage ;;
esac

mkdir -p "$DOWNLOADS/$dir"
install -m 0644 "$src" "$DOWNLOADS/$dir/$name.tmp"
mv -f "$DOWNLOADS/$dir/$name.tmp" "$DOWNLOADS/$dir/$name"
[ -n "$blockmap" ] && install -m 0644 "$blockmap" "$DOWNLOADS/$dir/$name.blockmap"

sha=$(sha256sum "$DOWNLOADS/$dir/$name" | cut -d' ' -f1)
size=$(stat -c %s "$DOWNLOADS/$dir/$name")

HGV_PLATFORM=$platform HGV_FILE="$dir/$name" HGV_VERSION=$version HGV_CODE=$code HGV_SHA=$sha \
HGV_SIZE=$size HGV_FORCE=$force HGV_MIN=$min_code HGV_NOTES=$notes HGV_DOWNLOADS=$DOWNLOADS HGV_BASE=$BASE_URL \
python3 - <<'PY'
import datetime, json, os
d = os.environ
path = os.path.join(d["HGV_DOWNLOADS"], "releases.json")
try:
    with open(path, encoding="utf-8") as f:
        releases = json.load(f)
except (OSError, ValueError):
    releases = {}
releases[d["HGV_PLATFORM"]] = {
    "version": d["HGV_VERSION"],
    "version_code": int(d["HGV_CODE"]),
    "file": d["HGV_FILE"],
    "sha256": d["HGV_SHA"],
    "size": int(d["HGV_SIZE"]),
    "force_update": d["HGV_FORCE"] == "true",
    "min_supported_version_code": int(d["HGV_MIN"]),
    "release_notes": d["HGV_NOTES"],
    "published_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
}
def write(p, text):
    with open(p + ".tmp", "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(p + ".tmp", 0o644)
    os.replace(p + ".tmp", p)
write(path, json.dumps(releases, indent=2, ensure_ascii=False) + "\n")
if d["HGV_PLATFORM"] == "android":
    # Android 1.1-1.2 read this file.
    write(os.path.join(d["HGV_DOWNLOADS"], "android", "version.json"), json.dumps({
        "versionCode": int(d["HGV_CODE"]),
        "versionName": d["HGV_VERSION"],
        "apk": d["HGV_BASE"] + "/" + d["HGV_FILE"],
        "notes": d["HGV_NOTES"],
    }, indent=2, ensure_ascii=False) + "\n")
PY

if [ "$platform" = windows ]; then
  # Last: electron-updater (all desktop versions) downloads as soon as this changes.
  install -m 0644 "$latest_yml" "$DOWNLOADS/desktop/latest.yml.tmp"
  mv -f "$DOWNLOADS/desktop/latest.yml.tmp" "$DOWNLOADS/desktop/latest.yml"
fi

echo "Published $platform $version (code $code), sha256 $sha, $size bytes"
echo "Check: curl -s https://higoverse.com/svc/settings/api/app-updates/latest?platform=$platform"
