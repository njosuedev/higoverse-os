// npm test — the update decisions the desktop app makes.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const core = require("../update-core");

const SHA = "b".repeat(64);
const raw = (over = {}) => ({
  version: "1.3.0", version_code: 10300, sha256: SHA, size: 1000,
  download_url: "https://higoverse.com/downloads/desktop/Higoverse-Setup-1.3.0.exe",
  force_update: false, min_supported_version_code: 0, release_notes: " Faster reports. ", ...over,
});

test("version codes", () => {
  assert.equal(core.versionCode("1.2.0"), 10200);
  assert.equal(core.versionCode("1.10.3"), 11003);
  assert.equal(core.versionCode("x"), 0);
});

test("valid release, with the electron-updater feed folder", () => {
  const r = core.parseRelease(raw());
  assert.equal(r.feedUrl, "https://higoverse.com/downloads/desktop/");
  assert.equal(r.fileName, "Higoverse-Setup-1.3.0.exe");
  assert.equal(r.notes, "Faster reports.");
});

test("unsafe or broken releases are ignored", () => {
  assert.equal(core.parseRelease(raw({ download_url: "http://higoverse.com/downloads/desktop/a.exe" })), null);
  assert.equal(core.parseRelease(raw({ download_url: "https://higoverse.com/downloads/desktop/a.zip" })), null);
  assert.equal(core.parseRelease(raw({ sha256: "nope" })), null);
  assert.equal(core.parseRelease(raw({ version: "1.3" })), null);
  assert.equal(core.parseRelease(null), null);
  assert.ok(core.parseRelease(raw({ download_url: "http://127.0.0.1:8090/desktop/a.exe" }), { allowHttp: true }));
});

test("current, optional, forced, below minimum", () => {
  const r = core.parseRelease(raw());
  assert.equal(core.decide(r, "1.3.0"), "none");
  assert.equal(core.decide(r, "1.4.0"), "none");
  assert.equal(core.decide(null, "1.0.0"), "none");
  assert.equal(core.decide(r, "1.2.0"), "optional");
  assert.equal(core.decide(core.parseRelease(raw({ force_update: true })), "1.2.0"), "required");
  assert.equal(core.decide(core.parseRelease(raw({ min_supported_version_code: 10200 })), "1.1.0"), "required");
  assert.equal(core.decide(core.parseRelease(raw({ min_supported_version_code: 10200 })), "1.2.0"), "optional");
});

test("background checks every 4 hours; Later lasts a day for that version", () => {
  const now = Date.now();
  assert.ok(core.dueForCheck({}, now));
  assert.ok(!core.dueForCheck({ checkedAt: now - 60_000 }, now));
  assert.ok(core.dueForCheck({ checkedAt: now - core.CHECK_EVERY_MS }, now));
  const state = { snooze: { version: "1.3.0", at: now - 1000 } };
  assert.ok(core.isSnoozed(state, "1.3.0", now));
  assert.ok(!core.isSnoozed(state, "1.3.1", now));
  assert.ok(!core.isSnoozed(state, "1.3.0", now + core.SNOOZE_MS));
});

test("SHA-256 of a downloaded file", async () => {
  const f = path.join(os.tmpdir(), `hgv-sha-${process.pid}.bin`);
  const data = crypto.randomBytes(3 * 1024 * 1024);
  fs.writeFileSync(f, data);
  try {
    assert.equal(await core.sha256File(f), crypto.createHash("sha256").update(data).digest("hex"));
  } finally {
    fs.unlinkSync(f);
  }
  await assert.rejects(core.sha256File(f + ".missing"));
});
