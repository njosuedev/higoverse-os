// Where the main window opens: the size and place it had last time, unless
// that place is no longer on any screen (a monitor was unplugged, the
// resolution changed). No Electron in here except through the arguments, so
// `npm test` covers it.

const fs = require("fs");

const DEFAULT = { width: 1320, height: 840 };
const MIN = { width: 960, height: 620 };

/** How much of the title bar must be on a screen to count as reachable. */
const GRAB_W = 120, GRAB_H = 32;

function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

/**
 * Saved bounds made safe for the screens there are now. [workAreas] are the
 * displays' work areas, the primary one first. Returns { width, height, x?, y? };
 * without x/y Electron centres the window.
 */
function fitBounds(saved, workAreas) {
  const primary = workAreas[0] || { x: 0, y: 0, ...DEFAULT };
  const num = (v) => (Number.isFinite(v) ? Math.round(v) : undefined);
  const width = Math.max(MIN.width, Math.min(num(saved && saved.width) || DEFAULT.width, primary.width));
  const height = Math.max(MIN.height, Math.min(num(saved && saved.height) || DEFAULT.height, primary.height));
  const x = num(saved && saved.x), y = num(saved && saved.y);
  if (x === undefined || y === undefined) return { width, height };
  const titleBar = { x, y, width, height: GRAB_H };
  const reachable = workAreas.some((a) => {
    const o = overlap(titleBar, a);
    return o.w >= Math.min(GRAB_W, width) && o.h >= GRAB_H / 2;
  });
  return reachable ? { width, height, x, y } : { width, height };
}

/** Reads the saved state; {} when there is none or it is unreadable. */
function load(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    return s && typeof s === "object" ? s : {};
  } catch { return {}; }
}

/**
 * Saves at most every [delayMs]: resizing and moving fire many events a
 * second, and each would otherwise be a disk write. flush() writes now (on close).
 */
function saver(file, read, delayMs = 400) {
  let timer = null;
  const write = () => {
    timer = null;
    const state = read();
    if (!state) return;
    try { fs.writeFileSync(file, JSON.stringify(state)); } catch { /* not critical */ }
  };
  return {
    soon() { if (!timer) timer = setTimeout(write, delayMs); },
    flush() { if (timer) clearTimeout(timer); write(); },
  };
}

module.exports = { fitBounds, load, saver, DEFAULT, MIN };
