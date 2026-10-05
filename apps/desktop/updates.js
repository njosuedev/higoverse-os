// ── Self-updating ──────────────────────────────────────────────────────────
// One Higoverse update system for Android and Windows: the app asks
// GET /svc/settings/api/app-updates/latest?platform=windows in the
// background (8 s after start, then at most every 15 minutes; never
// blocking). A newer version found in the background downloads quietly and
// installs when nobody is using Higoverse (or when it closes); "Check for
// updates…" asks first:
//
//   prompt (Update now / Later — or only Update now when required)
//   → download with progress (electron-updater: latest.yml + blockmap next
//     to the installer, SHA-512 checked, only changed blocks when possible)
//   → our own SHA-256 check against the endpoint
//   → "Installing… please wait": the app quits, the NSIS installer updates
//     it in place (user data in %APPDATA%\Higoverse is untouched) and starts
//     it again.
//
// No network or no server: nothing is shown and the app carries on. The
// last answer is kept in update-state.json (userData) with "Later".

const { app, BrowserWindow, dialog, nativeTheme, ipcMain, powerMonitor } = require("electron");
const { autoUpdater } = require("electron-updater");
const { parseRelease, decide, dueForCheck, sha256File } = require("./update-core");
const fs = require("fs");
const path = require("path");

const state = {
  win: null, ready: false, hidden: false,
  stage: "idle", // idle | prompt | downloading | verifying | ready | installing | failed
  release: null, kind: "none", manual: false, checking: false,
  // A background check found it: download and install without asking.
  silent: false, idleTimer: null,
  percent: null, received: 0, total: 0, error: null,
};

/** The main window, or null; set by init(). */
let mainWindow = () => null;
let updateApi = "";
let allowHttp = false;

const stateFile = () => path.join(app.getPath("userData"), "update-state.json");
function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return {}; }
}
function writeState(patch) {
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...readState(), ...patch })); } catch { /* not critical */ }
}

/** The taskbar button's bar; -1 removes it. */
function taskbar(value) {
  const w = mainWindow();
  if (w) w.setProgressBar(value);
}

/** Whether an update owns the taskbar bar (page loads leave it alone then). */
const busy = () => state.stage !== "idle";

/** The app is closing to install an update (it starts again by itself). */
const installing = () => state.stage === "installing";

function init({ getMainWindow, api }) {
  mainWindow = getMainWindow;
  updateApi = api;
  allowHttp = api.startsWith("http://"); // local test servers only
  // The app is quitting (for example quitAndInstall): windows must close freely,
  // or the old copy stays running while the installer starts the new one.
  app.on("before-quit", () => { state.quitting = true; });
  ipcMain.on("hgv-update", (e, action) => {
    if (state.win && !state.win.isDestroyed() && e.sender === state.win.webContents) onAction(action);
  });
  if (process.env.HIGOVERSE_UPDATE_PREVIEW && !app.isPackaged) {
    setTimeout(preview, 2500);
    return;
  }
  if (!app.isPackaged) return; // nothing to update while developing
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false; // only once our SHA-256 check passed
  autoUpdater.on("download-progress", (p) => {
    if (state.stage !== "downloading") return;
    state.percent = Math.floor(p.percent || 0);
    state.received = p.transferred || 0;
    state.total = p.total || 0;
    taskbar(Math.max(0, Math.min(1, (p.percent || 0) / 100)));
    render();
  });
  autoUpdater.on("update-downloaded", (info) => { onDownloaded(info).catch((err) => fail("storage", err)); });
  autoUpdater.on("error", (err) => { if (state.stage === "downloading") fail("network", err); });
  setTimeout(() => check(false), 8_000);
  setInterval(() => check(false), 60 * 1000); // dueForCheck keeps it to every 15 min
}

async function check(manual) {
  const win = mainWindow();
  if (!app.isPackaged) {
    if (manual && win) dialog.showMessageBox(win, { type: "info", title: "Higoverse", message: "Updates are checked in the installed app." });
    return;
  }
  if (!["idle", "failed", "prompt"].includes(state.stage)) { showWindow(); return; } // already under way
  if (state.checking) return;
  const saved = readState();
  let release = null;
  let reached = false;
  if (manual || dueForCheck(saved)) {
    state.checking = true;
    try {
      const res = await fetch(updateApi, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const raw = await res.json();
        release = parseRelease(raw, { allowHttp });
        reached = true;
        writeState({ checkedAt: Date.now(), release: release ? raw : null });
      } else if (res.status === 404) {
        reached = true;
        writeState({ checkedAt: Date.now(), release: null });
      }
    } catch { /* offline or server down: use what we knew */ }
    state.checking = false;
  }
  if (!reached) release = parseRelease(saved.release, { allowHttp });
  const kind = decide(release, app.getVersion());
  if (kind === "none") {
    const w = mainWindow();
    if (manual && w) {
      dialog.showMessageBox(w, reached
        ? { type: "info", title: "Higoverse", message: `You have the latest version (${app.getVersion()}).` }
        : { type: "warning", title: "Higoverse", message: "Couldn't check for updates.", detail: "Check your internet connection and try again." });
    }
    return;
  }
  state.release = release;
  state.kind = kind;
  if (!manual) {
    // Automatic: download quietly now, install when Higoverse is idle or closes.
    state.silent = true;
    state.hidden = true;
    startDownload();
    return;
  }
  state.silent = false;
  state.stage = "prompt";
  state.hidden = false;
  showWindow();
}

function onAction(action) {
  const required = state.kind === "required";
  switch (action) {
    case "update-now":
    case "retry":
      startDownload();
      break;
    case "install":
      install();
      break;
    case "later":
      if (state.stage === "ready") autoUpdater.autoInstallOnAppQuit = true; // installs when Higoverse closes
      else if (state.release) writeState({ snooze: { version: state.release.version, at: Date.now() } });
      if (state.stage === "prompt" || state.stage === "failed") state.stage = "idle";
      closeWindow();
      break;
    case "hide":
      state.hidden = true;
      closeWindow();
      break;
    case "quit":
      app.quit();
      break;
    case "escape":
      if (!required) onAction(state.stage === "downloading" || state.stage === "verifying" ? "hide" : "later");
      break;
  }
}

async function startDownload() {
  if (state.preview) return previewDownload();
  const r = state.release;
  if (!r || state.stage === "downloading") return;
  Object.assign(state, { stage: "downloading", percent: 0, received: 0, total: r.size || 0, error: null });
  render();
  taskbar(2); // indeterminate until the first bytes
  try {
    autoUpdater.setFeedURL({ provider: "generic", url: r.feedUrl });
    const result = await autoUpdater.checkForUpdates();
    // latest.yml must announce the same version the endpoint did.
    if (!result || !result.updateInfo || result.updateInfo.version !== r.version) throw Object.assign(new Error("feed"), { kind: "feed" });
    await autoUpdater.downloadUpdate();
  } catch (err) {
    if (state.stage === "downloading") fail(err && err.kind === "feed" ? "feed" : "network", err);
  }
}

async function onDownloaded(info) {
  const r = state.release;
  if (!r || state.stage !== "downloading") return;
  state.stage = "verifying";
  render();
  const file = info && info.downloadedFile;
  if (!file || (await sha256File(file)) !== r.sha256) {
    try { if (file) fs.unlinkSync(file); } catch { /* electron-updater cleans its cache too */ }
    fail("corrupt");
    return;
  }
  taskbar(-1);
  state.stage = "ready";
  // A required update installs right away; otherwise when nobody is using the app.
  if (state.silent && state.kind !== "required") { installWhenIdle(); return; }
  // Asked for with "Update now" and still watching: straight to installing.
  // Hidden while it downloaded: ask, since it closes the app.
  if (state.hidden && state.kind !== "required") showWindow();
  else install();
}

/** Someone is typing in a field or has a form / dialog open on the page
 *  (same test the website uses before reloading itself). */
async function pageBusy() {
  const w = mainWindow();
  if (!w) return false;
  try {
    return await w.webContents.executeJavaScript(`(() => {
      const el = document.activeElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return true;
      return !!document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0');
    })()`, true);
  } catch { return false; }
}

/** A downloaded update installs itself when nobody is using Higoverse:
 *  2 minutes without keyboard or mouse and nothing half-filled on the page.
 *  Closing the app installs it too. */
const IDLE_BEFORE_INSTALL_S = 120;
function installWhenIdle() {
  autoUpdater.autoInstallOnAppQuit = true;
  if (state.idleTimer) clearInterval(state.idleTimer);
  state.idleTimer = setInterval(async () => {
    if (state.stage !== "ready") { clearInterval(state.idleTimer); state.idleTimer = null; return; }
    if (powerMonitor.getSystemIdleTime() < IDLE_BEFORE_INSTALL_S || (await pageBusy())) return;
    clearInterval(state.idleTimer);
    state.idleTimer = null;
    install();
  }, 30 * 1000);
}

function install() {
  if (state.stage !== "ready" && state.stage !== "installing") return;
  state.stage = "installing";
  state.hidden = false;
  showWindow();
  autoUpdater.autoInstallOnAppQuit = true;
  // Give the window a moment to say so; then the app quits (all windows
  // close, nothing in use), the installer runs silently and restarts it.
  setTimeout(() => { if (state.preview) closeWindow(); else autoUpdater.quitAndInstall(true, true); }, 1800);
}

function fail(kind, err) {
  if (err) console.warn("update failed:", kind, err && err.message);
  taskbar(-1);
  if (state.silent) {
    Object.assign(state, { stage: "idle", error: kind, silent: false, hidden: false });
    return;
  }
  Object.assign(state, { stage: "failed", error: kind });
  state.hidden = false;
  showWindow();
}

// ── The update window ──────────────────────────────────────────────────────
function view() {
  const r = state.release || {};
  const required = state.kind === "required";
  const v = r.version || "";
  switch (state.stage) {
    case "prompt":
      return required
        ? { title: "Update required", sub: `Higoverse ${v}`, text: "A new version of Higoverse is required to continue.", notes: r.notes,
            actions: [{ id: "update-now", label: "Update now", primary: true }] }
        : { title: "New update available", sub: `Higoverse ${v}`, text: `Higoverse ${v} is available.`, notes: r.notes,
            actions: [{ id: "later", label: "Later" }, { id: "update-now", label: "Update now", primary: true }] };
    case "downloading": {
      const known = state.total > 0;
      return { title: "Updating Higoverse", sub: `Higoverse ${v}`, text: "Downloading update…",
        // A moving bar only: no percentage or megabyte count.
        progress: { percent: known ? state.percent : null, figures: "" },
        actions: required ? [] : [{ id: "hide", label: "Hide" }] };
    }
    case "verifying":
      return { title: "Updating Higoverse", sub: `Higoverse ${v}`, text: "Checking the download…", progress: { percent: null, figures: "" }, actions: [] };
    case "ready":
      return { title: "Update ready", sub: `Higoverse ${v}`, text: "Restart Higoverse to install the update. If you choose Later, it installs when you close the app.",
        actions: [{ id: "later", label: "Later" }, { id: "install", label: "Restart now", primary: true }] };
    case "installing":
      return { title: "Update ready", sub: `Higoverse ${v}`, text: `Installing Higoverse ${v}…\nPlease wait.`, rings: true, actions: [] };
    case "failed": {
      const text = {
        corrupt: "The downloaded update was damaged, so it was removed. Try again.",
        feed: "The update isn't ready on the server yet. Try again in a few minutes.",
        storage: "The update couldn't be saved. Free some disk space and try again.",
      }[state.error] || "The download stopped. Check your internet connection and try again.";
      return { title: "Updating Higoverse", sub: `Higoverse ${v}`, text, error: true,
        actions: [required ? { id: "quit", label: "Quit" } : { id: "later", label: "Later" }, { id: "retry", label: "Try again", primary: true }] };
    }
    default:
      return null;
  }
}

function showWindow() {
  const win = mainWindow();
  if (!win || state.stage === "idle") return;
  if (state.hidden && (state.stage === "downloading" || state.stage === "verifying")) return;
  if (state.win && !state.win.isDestroyed()) {
    render();
    state.win.show();
    return;
  }
  const required = state.kind === "required";
  state.ready = false;
  const w = new BrowserWindow({
    parent: win,
    modal: required, // a required update keeps the app out of reach
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: "Higoverse update",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#212328" : "#ffffff",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "updater-preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  state.win = w;
  const b = win.getBounds();
  w.setPosition(Math.round(b.x + (b.width - 460) / 2), Math.round(b.y + (b.height - 300) / 2));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.on("close", (e) => {
    // Closing a required update (Alt+F4) closes Higoverse; an optional one
    // counts as Later, or as Hide while downloading.
    if (state.closing || state.quitting) return; // quitting (also to install): let it close
    e.preventDefault();
    if (required && state.stage !== "installing") app.quit();
    else if (!required) onAction(state.stage === "downloading" || state.stage === "verifying" ? "hide" : "later");
  });
  w.on("closed", () => { if (state.win === w) state.win = null; state.closing = false; });
  w.webContents.on("did-finish-load", () => {
    state.ready = true;
    render();
    if (!w.isDestroyed()) w.show();
  });
  w.loadFile(path.join(__dirname, "updater.html"));
}

function render() {
  const w = state.win;
  const v = view();
  if (!state.ready || !w || w.isDestroyed() || !v) return;
  w.webContents.executeJavaScript(`render(${JSON.stringify(v)})`).catch(() => {});
}

function closeWindow() {
  const w = state.win;
  if (!w || w.isDestroyed()) return;
  state.closing = true;
  w.close();
}

// Development only: `set HIGOVERSE_UPDATE_PREVIEW=optional && npm start`
// (or =required, =fail) shows the update window with a made-up release and
// a fake download, to work on it without publishing anything.
function preview() {
  const mode = process.env.HIGOVERSE_UPDATE_PREVIEW;
  state.preview = mode;
  state.release = parseRelease({
    version: "9.9.9", download_url: "https://higoverse.com/downloads/desktop/Higoverse-Setup-9.9.9.exe", sha256: "0".repeat(64),
    size: 96 * 1048576, release_notes: "Faster stock lists and clearer reports.",
  });
  state.kind = mode === "required" ? "required" : "optional";
  state.stage = "prompt";
  showWindow();
}
function previewDownload() {
  Object.assign(state, { stage: "downloading", percent: 0, received: 0, total: 96 * 1048576 });
  render();
  const timer = setInterval(() => {
    state.percent = Math.min(100, state.percent + 9);
    state.received = state.total * state.percent / 100;
    taskbar(state.percent / 100);
    render();
    if (state.percent >= 100) {
      clearInterval(timer);
      taskbar(-1);
      if (state.preview === "fail") { state.preview = "optional"; fail("corrupt"); return; }
      state.stage = "verifying";
      render();
      setTimeout(() => { state.stage = "ready"; if (state.hidden) showWindow(); else install(); }, 900);
    }
  }, 350);
}

module.exports = { init, check, busy, installing };
