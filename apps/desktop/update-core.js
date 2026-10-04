// Update logic with no Electron in it, so it can be tested with `npm test`:
// reading the release the Higoverse endpoint returns, deciding whether this
// install may or must update, the background-check cache and "Later", and
// the SHA-256 of a downloaded installer.

const crypto = require("crypto");
const fs = require("fs");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** 1.2.3 → 10203, the Windows "version code" used by the endpoint. */
function versionCode(v) {
  const m = SEMVER.exec(String(v));
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
}

/** The release, or null when anything is missing or unsafe. */
function parseRelease(j, { allowHttp = false } = {}) {
  if (!j || typeof j !== "object") return null;
  const { version, download_url: url, sha256 } = j;
  if (typeof version !== "string" || !SEMVER.test(version)) return null;
  if (typeof sha256 !== "string" || !HEX64.test(sha256.toLowerCase())) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!(u.protocol === "https:" || (allowHttp && u.protocol === "http:"))) return null;
  if (!/\.exe$/i.test(u.pathname)) return null;
  return {
    version,
    versionCode: Number.isInteger(j.version_code) && j.version_code > 0 ? j.version_code : versionCode(version),
    url: u.toString(),
    // electron-updater reads latest.yml from the folder of the installer.
    feedUrl: new URL(".", u).toString(),
    fileName: decodeURIComponent(u.pathname.split("/").pop()),
    sha256: sha256.toLowerCase(),
    size: Number.isInteger(j.size) && j.size > 0 ? j.size : null,
    force: j.force_update === true,
    minCode: Number.isInteger(j.min_supported_version_code) ? j.min_supported_version_code : 0,
    notes: typeof j.release_notes === "string" ? j.release_notes.trim() : "",
  };
}

/** "none" | "optional" | "required" for the installed [currentVersion]. */
function decide(release, currentVersion) {
  const current = versionCode(currentVersion);
  if (!release || versionCode(release.version) <= current) return "none";
  return release.force || current < release.minCode ? "required" : "optional";
}

const CHECK_EVERY_MS = 15 * 60 * 1000; // background checks: a new release arrives within ~15 min
const SNOOZE_MS = 24 * 60 * 60 * 1000; // "Later"

function dueForCheck(state, now = Date.now()) {
  return !state.checkedAt || now - state.checkedAt >= CHECK_EVERY_MS;
}

function isSnoozed(state, version, now = Date.now()) {
  return !!state.snooze && state.snooze.version === version && now - state.snooze.at < SNOOZE_MS;
}

/** Reads the whole file as a stream (installers are ~100 MB). */
function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(path).on("error", reject).on("data", (c) => hash.update(c)).on("end", () => resolve(hash.digest("hex")));
  });
}

const mb = (bytes) => ((bytes || 0) / 1048576).toFixed(1);

module.exports = { versionCode, parseRelease, decide, dueForCheck, isSnoozed, sha256File, mb, CHECK_EVERY_MS, SNOOZE_MS };
