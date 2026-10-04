// Higoverse for Windows (Electron).
//
// A desktop window around https://higoverse.com with the things people expect
// from a real Windows program: its own icon and taskbar entry, one running
// copy, remembered window size, a native menu and right-click menu, printing,
// file downloads with a Save dialog, and a friendly screen when offline.
//
// Updates: the pages always come live from higoverse.com; the app itself
// checks https://higoverse.com/downloads/desktop/ on start and every few
// hours, downloads new versions in the background and installs them on
// restart (electron-updater).
//
// Appearance follows Windows (light/dark); the website's own Appearance
// setting can override it.
//
// Security: the page runs sandboxed with no Node.js access. Only the
// Higoverse site may load inside the app; any other link opens in the
// default browser.

const { app, BrowserWindow, Menu, shell, dialog, session, nativeTheme } = require("electron");
const { autoUpdater } = require("electron-updater");
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
// New versions are published to https://higoverse.com/downloads/desktop/
// (latest.yml + installer, see package.json "publish"). Downloads happen in
// the background; the update installs on restart or when the app closes.
// A small progress window (updater.html) shows the check when you ask for it
// from Help, and the download whenever a new version is found; the taskbar
// icon shows the download progress too.
let updateReadyShown = false;
let manualCheck = false;
function setupUpdates() {
  if (!app.isPackaged) return; // nothing to update while developing
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => {
    if (manualCheck) showProgress({ title: "Checking for updates…", detail: `Higoverse ${app.getVersion()}`, percent: null });
  });
  autoUpdater.on("update-available", (info) => {
    progressDismissed = false;
    showProgress({ title: `Downloading Higoverse ${info.version}…`, detail: "Starting download", percent: 0 });
    if (win && !win.isDestroyed()) win.setProgressBar(2); // indeterminate until the first bytes
  });
  autoUpdater.on("download-progress", (p) => {
    const percent = Math.round(p.percent || 0);
    showProgress({
      title: `Downloading update… ${percent}%`,
      detail: `${mb(p.transferred)} of ${mb(p.total)} MB · ${mb(p.bytesPerSecond)} MB/s`,
      percent,
    });
    if (win && !win.isDestroyed()) win.setProgressBar(Math.max(0, Math.min(1, (p.percent || 0) / 100)));
  });
  autoUpdater.on("update-downloaded", async (info) => {
    hideProgress();
    if (updateReadyShown || !win) return;
    updateReadyShown = true;
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Higoverse ${info.version} is ready to install.`,
      detail: "Restart Higoverse to finish updating. If you choose Later, it installs when you close the app.",
    });
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall());
  });
  autoUpdater.on("update-not-available", () => {
    hideProgress();
    if (manualCheck && win) dialog.showMessageBox(win, { type: "info", title: "Higoverse", message: `You have the latest version (${app.getVersion()}).` });
    manualCheck = false;
  });
  autoUpdater.on("error", (err) => {
    hideProgress();
    if (manualCheck && win) dialog.showMessageBox(win, { type: "warning", title: "Higoverse", message: "Couldn't check for updates.", detail: String(err && err.message || err).slice(0, 300) });
    manualCheck = false;
  });
  setTimeout(() => checkForUpdates(false), 10_000);
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);
}
function checkForUpdates(manual) {
  if (!app.isPackaged) {
    if (manual && win) dialog.showMessageBox(win, { type: "info", title: "Higoverse", message: "Updates are checked in the installed app." });
    return;
  }
  manualCheck = manual;
  if (manual) { updateReadyShown = false; progressDismissed = false; }
  autoUpdater.checkForUpdates().catch(() => {});
}

const mb = (bytes) => ((bytes || 0) / 1048576).toFixed(1);

// The progress window: small, at the bottom-right of the app window, never
// takes focus. Closing it (×) only hides it; the download carries on.
let progressWin = null;
let progressReady = false;
let progressState = null;
let progressDismissed = false;
function showProgress(state) {
  progressState = state;
  if (progressDismissed || !win || win.isDestroyed()) return;
  if (!progressWin || progressWin.isDestroyed()) {
    progressReady = false;
    progressWin = new BrowserWindow({
      parent: win,
      width: 400,
      height: 104,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#1b1e23" : "#ffffff",
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const b = win.getBounds();
    progressWin.setPosition(Math.round(b.x + b.width - 400 - 24), Math.round(b.y + b.height - 104 - 24));
    progressWin.on("closed", () => {
      // Closed by the user (×) while still working: keep it hidden.
      if (progressState) progressDismissed = true;
      progressWin = null;
    });
    progressWin.webContents.on("did-finish-load", () => {
      progressReady = true;
      renderProgress();
      if (progressWin && !progressWin.isDestroyed()) progressWin.showInactive();
    });
    progressWin.loadFile(path.join(__dirname, "updater.html"));
    return;
  }
  renderProgress();
}
function renderProgress() {
  if (!progressReady || !progressWin || progressWin.isDestroyed() || !progressState) return;
  progressWin.webContents.executeJavaScript(`render(${JSON.stringify(progressState)})`).catch(() => {});
}
function hideProgress() {
  progressState = null;
  if (progressWin && !progressWin.isDestroyed()) progressWin.close();
  if (win && !win.isDestroyed()) win.setProgressBar(-1);
}

// Development only: `set HIGOVERSE_UPDATE_PREVIEW=1 && npm start` plays a fake
// check and download so the progress window can be seen without a release.
function previewUpdateProgress() {
  manualCheck = true;
  showProgress({ title: "Checking for updates…", detail: `Higoverse ${app.getVersion()}`, percent: null });
  let percent = 0;
  setTimeout(() => {
    const total = 92.4 * 1048576;
    const timer = setInterval(() => {
      percent = Math.min(100, percent + 7);
      showProgress({
        title: `Downloading update… ${percent}%`,
        detail: `${mb(total * percent / 100)} of ${mb(total)} MB · 4.2 MB/s`,
        percent,
      });
      win.setProgressBar(percent / 100);
      if (percent >= 100) { clearInterval(timer); setTimeout(hideProgress, 1500); }
    }, 600);
  }, 2500);
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
  if (!app.isPackaged && process.env.HIGOVERSE_UPDATE_PREVIEW) win.once("ready-to-show", () => setTimeout(previewUpdateProgress, 1500));
});

// Keep the window background in step with Windows' light/dark setting.
nativeTheme.on("updated", () => { if (win && !win.isDestroyed()) win.setBackgroundColor(bg()); });

app.on("window-all-closed", () => app.quit());

// Never let any window (including print popups) wander off-site.
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
