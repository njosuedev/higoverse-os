// Higoverse for Windows (Electron).
//
// A desktop window around https://higoverse.com with the things people expect
// from a real Windows program: its own icon and taskbar entry, one running
// copy, remembered window size, a native menu and right-click menu, printing,
// file downloads with a Save dialog, and a friendly screen when offline.
//
// Updates: the pages always come live from higoverse.com; the app itself
// asks the Higoverse update endpoint in the background and, when there is a
// newer version, offers it, downloads it with progress, checks it and
// installs it (see "Self-updating" below).
//
// Appearance follows Windows (light/dark); the website's own Appearance
// setting can override it.
//
// Security: the page runs sandboxed with no Node.js access. Only the
// Higoverse site may load inside the app; any other link opens in the
// default browser.

const { app, BrowserWindow, Menu, shell, dialog, session, nativeTheme, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const { parseRelease, decide, dueForCheck, isSnoozed, sha256File } = require("./update-core");
const fs = require("fs");
const path = require("path");

const APP_URL = process.env.HIGOVERSE_URL || "https://higoverse.com/";
const APP_ORIGIN = new URL(APP_URL).origin;
const bg = () => (nativeTheme.shouldUseDarkColors ? "#111317" : "#F3F2EF");

app.setAppUserModelId("com.higoverse.desktop");
nativeTheme.themeSource = "system";

// ── One running copy: a second launch focuses the existing window ──────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;

// ── Window size and position, remembered between launches ──────────────────
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return {}; }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  const state = { maximized: win.isMaximized(), bounds: win.isMaximized() ? win.getNormalBounds() : win.getBounds() };
  try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch { /* not critical */ }
}

const isAppUrl = (url) => {
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
};
const isOfflinePage = (url) => url.startsWith("file:") && url.includes("offline.html");

function openExternally(url) {
  try {
    const { protocol } = new URL(url);
    if (["http:", "https:", "mailto:", "tel:"].includes(protocol)) shell.openExternal(url);
  } catch { /* ignore malformed links */ }
}

function showOffline() {
  if (!win || win.isDestroyed()) return;
  win.loadFile(path.join(__dirname, "offline.html"), { query: { url: APP_URL } });
}

function createWindow() {
  const state = loadState();
  const b = state.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1320,
    height: b.height || 840,
    x: b.x,
    y: b.y,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: "Higoverse",
    backgroundColor: bg(),
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  // Identify the desktop app to the website (it can adapt if it wants to).
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} HigoverseDesktop/${app.getVersion()}`);

  win.once("ready-to-show", () => {
    if (state.maximized) win.maximize();
    win.show();
  });
  for (const ev of ["resize", "move", "close"]) win.on(ev, saveState);
  win.on("closed", () => { win = null; });

  // Keep the window title simple and consistent.
  win.on("page-title-updated", (e, title) => {
    e.preventDefault();
    const clean = String(title || "").replace(/\s*[|·-]\s*Higoverse.*$/i, "").trim();
    win.setTitle(clean && clean.toLowerCase() !== "higoverse" ? `${clean} - Higoverse` : "Higoverse");
  });

  // Only Higoverse pages load inside the app.
  win.webContents.on("will-navigate", (e, url) => {
    if (isAppUrl(url) || isOfflinePage(url)) return;
    e.preventDefault();
    openExternally(url);
  });

  // Receipts and invoices open a blank window and print it: allow those.
  // Everything else goes to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank" || isAppUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
          icon: path.join(__dirname, "assets", "icon.png"),
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    openExternally(url);
    return { action: "deny" };
  });

  // No connection (or the server can't be reached): show the offline screen.
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted by a newer navigation */) return;
    if (isAppUrl(url) || url === APP_URL) showOffline();
  });

  win.webContents.on("context-menu", (_e, p) => buildContextMenu(p).popup({ window: win }));

  // While a page loads, the taskbar button shows a moving bar (no
  // percentage). The website draws its own bar for moves between pages;
  // this covers full loads (starting up, reloading after an update). An
  // update download owns the taskbar bar, so it's left alone then.
  const pageLoading = (on) => {
    if (!win || win.isDestroyed() || updates.stage !== "idle") return;
    win.setProgressBar(on ? 2 : -1, { mode: on ? "indeterminate" : "none" });
  };
  win.webContents.on("did-start-loading", () => pageLoading(true));
  win.webContents.on("did-stop-loading", () => pageLoading(false));

  win.loadURL(APP_URL);
}

// ── Right-click menu (cut/copy/paste, spelling suggestions, links) ─────────
function buildContextMenu(p) {
  const items = [];
  if (p.misspelledWord) {
    for (const s of p.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    }
    if (p.dictionarySuggestions.length) items.push({ type: "separator" });
  }
  if (p.linkURL && !isAppUrl(p.linkURL)) {
    items.push({ label: "Open link in browser", click: () => openExternally(p.linkURL) }, { type: "separator" });
  }
  if (p.isEditable) {
    items.push(
      { role: "undo", enabled: p.editFlags.canUndo }, { role: "redo", enabled: p.editFlags.canRedo }, { type: "separator" },
      { role: "cut", enabled: p.editFlags.canCut }, { role: "copy", enabled: p.editFlags.canCopy },
      { role: "paste", enabled: p.editFlags.canPaste }, { type: "separator" }, { role: "selectAll" },
    );
  } else if (p.selectionText) {
    items.push({ role: "copy" });
  } else {
    items.push(
      { label: "Back", enabled: win.webContents.navigationHistory.canGoBack(), click: () => win.webContents.navigationHistory.goBack() },
      { label: "Reload", click: () => win.webContents.reload() },
      { type: "separator" }, { label: "Print…", click: () => win.webContents.print() },
    );
  }
  return Menu.buildFromTemplate(items);
}

// ── Application menu (press Alt to show; shortcuts always work) ────────────
function buildMenu() {
  const go = (p) => () => win && win.loadURL(new URL(p, APP_URL).toString());
  const template = [
    {
      label: "&File",
      submenu: [
        { label: "Home", accelerator: "Ctrl+H", click: go("/") },
        { type: "separator" },
        { label: "Print…", accelerator: "Ctrl+P", click: () => win && win.webContents.print() },
        { type: "separator" },
        { role: "quit", label: "Exit" },
      ],
    },
    {
      label: "&Edit",
      submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
    },
    {
      label: "&Go",
      submenu: [
        { label: "Dashboard", click: go("/") },
        { label: "Stock / Vehicles", click: go("/items") },
        { label: "Sales", click: go("/sales") },
        { label: "Customers", click: go("/partners") },
        { label: "Expenses", click: go("/expenses") },
        { label: "Reports", click: go("/reports") },
        { type: "separator" },
        { label: "Back", accelerator: "Alt+Left", click: () => win && win.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: "Alt+Right", click: () => win && win.webContents.navigationHistory.canGoForward() && win.webContents.navigationHistory.goForward() },
      ],
    },
    {
      label: "&View",
      submenu: [
        { role: "reload", accelerator: "F5" },
        { role: "forceReload", accelerator: "Ctrl+F5" },
        { type: "separator" },
        { role: "resetZoom", label: "Actual size" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen", accelerator: "F11" },
        ...(app.isPackaged ? [] : [{ type: "separator" }, { role: "toggleDevTools" }]),
      ],
    },
    {
      label: "&Help",
      submenu: [
        { label: "Higoverse website", click: () => shell.openExternal("https://higoverse.com") },
        { label: "Privacy policy", click: () => shell.openExternal("https://higoverse.com/privacy") },
        { label: "Contact support", click: () => shell.openExternal("mailto:higoverse@gmail.com") },
        { type: "separator" },
        { label: "Check for updates…", click: () => checkForUpdates(true) },
        {
          label: "About Higoverse",
          click: () => dialog.showMessageBox(win, {
            type: "info",
            title: "About Higoverse",
            message: `Higoverse ${app.getVersion()}`,
            detail: "Business records, sales and stock.\n\nhttps://higoverse.com\nhigoverse@gmail.com",
            icon: path.join(__dirname, "assets", "icon.png"),
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Self-updating ──────────────────────────────────────────────────────────
// One Higoverse update system for Android and Windows: the app asks
// GET /svc/settings/api/app-updates/latest?platform=windows in the
// background (8 s after start, then at most every 4 hours; never blocking),
// and only when a newer version exists shows the update window:
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
const UPDATE_API = process.env.HIGOVERSE_UPDATE_API
  || new URL("/svc/settings/api/app-updates/latest?platform=windows", APP_ORIGIN).toString();
const UPDATE_ALLOW_HTTP = UPDATE_API.startsWith("http://"); // local test servers only

const updates = {
  win: null, ready: false, hidden: false,
  stage: "idle", // idle | prompt | downloading | verifying | ready | installing | failed
  release: null, kind: "none", manual: false, checking: false,
  percent: null, received: 0, total: 0, error: null,
};
const updateStateFile = () => path.join(app.getPath("userData"), "update-state.json");
function readUpdateState() {
  try { return JSON.parse(fs.readFileSync(updateStateFile(), "utf8")); } catch { return {}; }
}
function writeUpdateState(patch) {
  try { fs.writeFileSync(updateStateFile(), JSON.stringify({ ...readUpdateState(), ...patch })); } catch { /* not critical */ }
}

function setupUpdates() {
  // The app is quitting (for example quitAndInstall): windows must close freely,
  // or the old copy stays running while the installer starts the new one.
  app.on("before-quit", () => { updates.quitting = true; });
  ipcMain.on("hgv-update", (e, action) => {
    if (updates.win && !updates.win.isDestroyed() && e.sender === updates.win.webContents) onUpdateAction(action);
  });
  if (process.env.HIGOVERSE_UPDATE_PREVIEW && !app.isPackaged) {
    win.once("ready-to-show", () => setTimeout(previewUpdates, 1500));
    return;
  }
  if (!app.isPackaged) return; // nothing to update while developing
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false; // only once our SHA-256 check passed
  autoUpdater.on("download-progress", (p) => {
    if (updates.stage !== "downloading") return;
    updates.percent = Math.floor(p.percent || 0);
    updates.received = p.transferred || 0;
    updates.total = p.total || 0;
    if (win && !win.isDestroyed()) win.setProgressBar(Math.max(0, Math.min(1, (p.percent || 0) / 100)));
    renderUpdate();
  });
  autoUpdater.on("update-downloaded", (info) => { onUpdateDownloaded(info).catch((err) => failUpdate("storage", err)); });
  autoUpdater.on("error", (err) => { if (updates.stage === "downloading") failUpdate("network", err); });
  setTimeout(() => checkForUpdates(false), 8_000);
  setInterval(() => checkForUpdates(false), 60 * 60 * 1000); // dueForCheck keeps it to every 4 h
}

async function checkForUpdates(manual) {
  if (!app.isPackaged) {
    if (manual && win) dialog.showMessageBox(win, { type: "info", title: "Higoverse", message: "Updates are checked in the installed app." });
    return;
  }
  if (!["idle", "failed", "prompt"].includes(updates.stage)) { showUpdateWindow(); return; } // already under way
  if (updates.checking) return;
  const state = readUpdateState();
  let release = null;
  let reached = false;
  if (manual || dueForCheck(state)) {
    updates.checking = true;
    try {
      const res = await fetch(UPDATE_API, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const raw = await res.json();
        release = parseRelease(raw, { allowHttp: UPDATE_ALLOW_HTTP });
        reached = true;
        writeUpdateState({ checkedAt: Date.now(), release: release ? raw : null });
      } else if (res.status === 404) {
        reached = true;
        writeUpdateState({ checkedAt: Date.now(), release: null });
      }
    } catch { /* offline or server down: use what we knew */ }
    updates.checking = false;
  }
  if (!reached) release = parseRelease(state.release, { allowHttp: UPDATE_ALLOW_HTTP });
  const kind = decide(release, app.getVersion());
  if (kind === "none") {
    if (manual && win) {
      dialog.showMessageBox(win, reached
        ? { type: "info", title: "Higoverse", message: `You have the latest version (${app.getVersion()}).` }
        : { type: "warning", title: "Higoverse", message: "Couldn't check for updates.", detail: "Check your internet connection and try again." });
    }
    return;
  }
  if (kind === "optional" && !manual && isSnoozed(state, release.version)) return;
  updates.release = release;
  updates.kind = kind;
  updates.stage = "prompt";
  updates.hidden = false;
  showUpdateWindow();
}

function onUpdateAction(action) {
  const required = updates.kind === "required";
  switch (action) {
    case "update-now":
    case "retry":
      startUpdateDownload();
      break;
    case "install":
      installUpdate();
      break;
    case "later":
      if (updates.stage === "ready") autoUpdater.autoInstallOnAppQuit = true; // installs when Higoverse closes
      else if (updates.release) writeUpdateState({ snooze: { version: updates.release.version, at: Date.now() } });
      if (updates.stage === "prompt" || updates.stage === "failed") updates.stage = "idle";
      closeUpdateWindow();
      break;
    case "hide":
      updates.hidden = true;
      closeUpdateWindow();
      break;
    case "quit":
      app.quit();
      break;
    case "escape":
      if (!required) onUpdateAction(updates.stage === "downloading" || updates.stage === "verifying" ? "hide" : "later");
      break;
  }
}

async function startUpdateDownload() {
  if (updates.preview) return previewDownload();
  const r = updates.release;
  if (!r || updates.stage === "downloading") return;
  Object.assign(updates, { stage: "downloading", percent: 0, received: 0, total: r.size || 0, error: null });
  renderUpdate();
  if (win && !win.isDestroyed()) win.setProgressBar(2); // indeterminate until the first bytes
  try {
    autoUpdater.setFeedURL({ provider: "generic", url: r.feedUrl });
    const result = await autoUpdater.checkForUpdates();
    // latest.yml must announce the same version the endpoint did.
    if (!result || !result.updateInfo || result.updateInfo.version !== r.version) throw Object.assign(new Error("feed"), { kind: "feed" });
    await autoUpdater.downloadUpdate();
  } catch (err) {
    if (updates.stage === "downloading") failUpdate(err && err.kind === "feed" ? "feed" : "network", err);
  }
}

async function onUpdateDownloaded(info) {
  const r = updates.release;
  if (!r || updates.stage !== "downloading") return;
  updates.stage = "verifying";
  renderUpdate();
  const file = info && info.downloadedFile;
  if (!file || (await sha256File(file)) !== r.sha256) {
    try { if (file) fs.unlinkSync(file); } catch { /* electron-updater cleans its cache too */ }
    failUpdate("corrupt");
    return;
  }
  if (win && !win.isDestroyed()) win.setProgressBar(-1);
  updates.stage = "ready";
  // Asked for with "Update now" and still watching: straight to installing.
  // Hidden while it downloaded: ask, since it closes the app.
  if (updates.hidden && updates.kind !== "required") showUpdateWindow();
  else installUpdate();
}

function installUpdate() {
  if (updates.stage !== "ready" && updates.stage !== "installing") return;
  updates.stage = "installing";
  updates.hidden = false;
  showUpdateWindow();
  autoUpdater.autoInstallOnAppQuit = true;
  // Give the window a moment to say so; then the app quits (all windows
  // close, nothing in use), the installer runs silently and restarts it.
  setTimeout(() => { if (updates.preview) closeUpdateWindow(); else autoUpdater.quitAndInstall(true, true); }, 1800);
}

function failUpdate(kind, err) {
  if (err) console.warn("update failed:", kind, err && err.message);
  Object.assign(updates, { stage: "failed", error: kind });
  if (win && !win.isDestroyed()) win.setProgressBar(-1);
  updates.hidden = false;
  showUpdateWindow();
}

// ── The update window ──────────────────────────────────────────────────────
function updateView() {
  const r = updates.release || {};
  const required = updates.kind === "required";
  const v = r.version || "";
  switch (updates.stage) {
    case "prompt":
      return required
        ? { title: "Update required", sub: `Higoverse ${v}`, text: "A new version of Higoverse is required to continue.", notes: r.notes,
            actions: [{ id: "update-now", label: "Update now", primary: true }] }
        : { title: "New update available", sub: `Higoverse ${v}`, text: `Higoverse ${v} is available.`, notes: r.notes,
            actions: [{ id: "later", label: "Later" }, { id: "update-now", label: "Update now", primary: true }] };
    case "downloading": {
      const known = updates.total > 0;
      return { title: "Updating Higoverse", sub: `Higoverse ${v}`, text: "Downloading update…",
        progress: { percent: known ? updates.percent : null,
          // A moving bar only: no percentage or megabyte count.
          figures: "" },
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
      }[updates.error] || "The download stopped. Check your internet connection and try again.";
      return { title: "Updating Higoverse", sub: `Higoverse ${v}`, text, error: true,
        actions: [required ? { id: "quit", label: "Quit" } : { id: "later", label: "Later" }, { id: "retry", label: "Try again", primary: true }] };
    }
    default:
      return null;
  }
}

function showUpdateWindow() {
  if (!win || win.isDestroyed() || updates.stage === "idle") return;
  if (updates.hidden && (updates.stage === "downloading" || updates.stage === "verifying")) return;
  if (updates.win && !updates.win.isDestroyed()) {
    renderUpdate();
    updates.win.show();
    return;
  }
  const required = updates.kind === "required";
  updates.ready = false;
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1b1e23" : "#ffffff",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "updater-preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  updates.win = w;
  const b = win.getBounds();
  w.setPosition(Math.round(b.x + (b.width - 460) / 2), Math.round(b.y + (b.height - 300) / 2));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.on("close", (e) => {
    // Closing a required update (Alt+F4) closes Higoverse; an optional one
    // counts as Later, or as Hide while downloading.
    if (updates.closing || updates.quitting) return; // quitting (also to install): let it close
    e.preventDefault();
    if (required && updates.stage !== "installing") app.quit();
    else if (!required) onUpdateAction(updates.stage === "downloading" || updates.stage === "verifying" ? "hide" : "later");
  });
  w.on("closed", () => { if (updates.win === w) updates.win = null; updates.closing = false; });
  w.webContents.on("did-finish-load", () => {
    updates.ready = true;
    renderUpdate();
    if (!w.isDestroyed()) w.show();
  });
  w.loadFile(path.join(__dirname, "updater.html"));
}

function renderUpdate() {
  const w = updates.win;
  const view = updateView();
  if (!updates.ready || !w || w.isDestroyed() || !view) return;
  w.webContents.executeJavaScript(`render(${JSON.stringify(view)})`).catch(() => {});
}

function closeUpdateWindow() {
  const w = updates.win;
  if (!w || w.isDestroyed()) return;
  updates.closing = true;
  w.close();
}

// Development only: `set HIGOVERSE_UPDATE_PREVIEW=optional && npm start`
// (or =required, =fail) shows the update window with a made-up release and
// a fake download, to work on it without publishing anything.
function previewUpdates() {
  const mode = process.env.HIGOVERSE_UPDATE_PREVIEW;
  updates.preview = mode;
  updates.release = parseRelease({
    version: "9.9.9", download_url: "https://higoverse.com/downloads/desktop/Higoverse-Setup-9.9.9.exe", sha256: "0".repeat(64),
    size: 96 * 1048576, release_notes: "Faster stock lists and clearer reports.",
  });
  updates.kind = mode === "required" ? "required" : "optional";
  updates.stage = "prompt";
  showUpdateWindow();
}
function previewDownload() {
  Object.assign(updates, { stage: "downloading", percent: 0, received: 0, total: 96 * 1048576 });
  renderUpdate();
  const timer = setInterval(() => {
    updates.percent = Math.min(100, updates.percent + 9);
    updates.received = updates.total * updates.percent / 100;
    if (win && !win.isDestroyed()) win.setProgressBar(updates.percent / 100);
    renderUpdate();
    if (updates.percent >= 100) {
      clearInterval(timer);
      if (win && !win.isDestroyed()) win.setProgressBar(-1);
      if (updates.preview === "fail") { updates.preview = "optional"; failUpdate("corrupt"); return; }
      updates.stage = "verifying";
      renderUpdate();
      setTimeout(() => { updates.stage = "ready"; if (updates.hidden) showUpdateWindow(); else installUpdate(); }, 900);
    }
  }, 350);
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  // Only what the website uses: location for the address map, clipboard
  // writes, notifications. Everything else (camera, microphone…) is refused.
  const allowed = new Set(["geolocation", "clipboard-sanitized-write", "notifications", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(allowed.has(permission) && isAppUrl(details.requestingUrl || wc.getURL()));
  });

  // Downloads (Excel/PDF exports) go through the normal Save dialog.
  session.defaultSession.on("will-download", (_e, item) => {
    item.setSaveDialogOptions({ title: "Save file", defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
  });

  buildMenu();
  createWindow();
  setupUpdates();
});

// Keep the window background in step with Windows' light/dark setting.
nativeTheme.on("updated", () => { if (win && !win.isDestroyed()) win.setBackgroundColor(bg()); });

app.on("window-all-closed", () => app.quit());

// Never let any window (including print popups) wander off-site.
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
