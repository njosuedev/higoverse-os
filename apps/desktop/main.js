// Higoverse for Windows (Electron).
//
// A desktop window around https://higoverse.com with the things people expect
// from a real Windows program: its own icon and taskbar entry, one running
// copy, remembered window size, a native menu and right-click menu, printing,
// file downloads with a Save dialog, and a friendly screen when offline.
//
// Security: the page runs sandboxed with no Node.js access. Only the
// Higoverse site may load inside the app; any other link opens in the
// default browser.

const { app, BrowserWindow, Menu, shell, dialog, session, nativeTheme } = require("electron");
const fs = require("fs");
const path = require("path");

const APP_URL = process.env.HIGOVERSE_URL || "https://higoverse.com/";
const APP_ORIGIN = new URL(APP_URL).origin;
const BG = "#F3F2EF";

app.setAppUserModelId("com.higoverse.desktop");
nativeTheme.themeSource = "light";

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
    backgroundColor: BG,
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
});

app.on("window-all-closed", () => app.quit());

// Never let any window (including print popups) wander off-site.
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
