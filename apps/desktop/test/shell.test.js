// npm test — where the window opens, and what the app's own screens say.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fitBounds, load, saver, DEFAULT, MIN } = require("../window-state");
const { TEXT, LANGS, pickLang, text } = require("../shell-text");

const laptop = { x: 0, y: 0, width: 1920, height: 1040 };
const right = { x: 1920, y: 0, width: 2560, height: 1400 };

test("first start: default size, centred", () => {
  assert.deepEqual(fitBounds(undefined, [laptop]), DEFAULT);
  assert.deepEqual(fitBounds({}, [laptop]), DEFAULT);
});

test("a place on a connected screen is kept", () => {
  const b = { x: 2100, y: 80, width: 1400, height: 900 };
  assert.deepEqual(fitBounds(b, [laptop, right]), b);
});

test("a place on an unplugged screen is dropped (centred on the main one)", () => {
  assert.deepEqual(fitBounds({ x: 2100, y: 80, width: 1400, height: 900 }, [laptop]), { width: 1400, height: 900 });
});

test("only the title bar's edge still showing counts as lost", () => {
  // 40 px of title bar left on screen: too little to grab.
  assert.equal(fitBounds({ x: 1880, y: 10, width: 1320, height: 840 }, [laptop]).x, undefined);
  // Above the top of every screen: the title bar can't be reached.
  assert.equal(fitBounds({ x: 100, y: -500, width: 1320, height: 840 }, [laptop]).x, undefined);
});

test("sizes stay within the screen and above the minimum", () => {
  assert.deepEqual(fitBounds({ width: 5000, height: 3000 }, [laptop]), { width: 1920, height: 1040 });
  assert.deepEqual(fitBounds({ width: 200, height: 100 }, [laptop]), MIN);
  assert.deepEqual(fitBounds({ width: "x", height: null, x: NaN, y: 4 }, [laptop]), DEFAULT);
});

test("state file: unreadable is empty, saves are batched", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hgv-"));
  const file = path.join(dir, "s.json");
  assert.deepEqual(load(file), {});
  fs.writeFileSync(file, "{broken");
  assert.deepEqual(load(file), {});
  let reads = 0;
  const s = saver(file, () => ({ n: ++reads }), 20);
  for (let i = 0; i < 50; i++) s.soon();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(reads, 1, "fifty resize events, one write");
  s.flush();
  assert.deepEqual(load(file), { n: 2 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("language: the website's choice, then Windows', then English", () => {
  assert.equal(pickLang("rw", ["fr-FR"]), "rw");
  assert.equal(pickLang("", ["fr-FR", "en-US"]), "fr");
  assert.equal(pickLang(undefined, ["sw_KE"]), "sw");
  assert.equal(pickLang("de", ["de-DE"]), "en");
  assert.equal(text("xx"), TEXT.en);
});

test("every screen text exists in every language", () => {
  const keys = Object.keys(TEXT.en).sort();
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(TEXT[l]).sort(), keys, l);
    for (const k of keys) assert.ok(TEXT[l][k].trim(), `${l}.${k}`);
  }
});
