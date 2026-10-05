// Higoverse for Windows (Electron).
//
// A desktop window around https://higoverse.com with the things people expect
// from a real Windows program: its own icon and taskbar entry, one running
// copy, remembered window size, a native menu and right-click menu, printing,
// file downloads with a Save dialog, and its own screens when Higoverse can't
// be shown (no internet, server trouble, too slow, a crash).
//
// Starting: the window opens at once on the website's loading layout
// (loading.html), in the colours and language last used on the website, and
// higoverse.com takes its place as soon as it answers.
//
// Staying up: a crashed page reloads by itself (twice in a minute: the crash
// screen asks first), a frozen one offers Wait / Reload, the graphics card
// failing twice switches drawing to the processor, and timers keep running
// while the window is minimised so live updates and alerts don't drop.
//
// Updates: the pages always come live from higoverse.com; the app itself
// updates in the background (updates.js).
//
// Security: the page runs sandboxed with no Node.js access. Only the
// Higoverse site (and this app's own screens) may load in any of its
// windows, including after a redirect; any other link opens in the default
// browser. Only location, clipboard and notification permissions exist, and
// only for higoverse.com.

const { app, BrowserWindow, Menu, shell, dialog, session, nativeTheme, ipcMain, screen } = require("electron");
const path = require("path");
const windowState = require("./window-state");
const shellText = require("./shell-text");
const updates = require("./updates");

const APP_URL = process.env.HIGOVERSE_URL || "https://higoverse.com/";
const APP_ORIGIN = new URL(APP_URL).origin;
const ICON = path.join(__dirname, "assets", "icon.png");

/** No answer from higoverse.com within this: the "taking too long" screen.
 *  Each retry in a row waits 30 s longer (up to 2 minutes), so a slow but
 *  working connection gets there instead of being cut off again and again. */
const slowMs = (attempt) => Math.min(120_000, 30_000 * (attempt + 1));

app.setAppUserModelId("com.higoverse.desktop");
// Development: HIGOVERSE_USER_DATA=<folder> keeps test runs out of the
// installed app's settings (%APPDATA%\Higoverse).
if (!app.isPackaged && process.env.HIGOVERSE_USER_DATA) app.setPath("userData", process.env.HIGOVERSE_USER_DATA);
nativeTheme.themeSource = "system";

// ── One running copy: a second launch focuses the existing window ──────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── Look (theme and language last seen on the website) and GPU fallback ────
const lookFile = () => path.join(app.getPath("userData"), "look.json");
const look = windowState.load(lookFile());
const saveLook = windowState.saver(lookFile(), () => look);

// The graphics card failed twice last time on this version: draw with the
// processor (a blank or black window otherwise). Tried again after an update.
if (look.gpuOff === app.getVersion()) app.disableHardwareAcceleration();

function theme() { return look.theme === "dark" || look.theme === "light" ? look.theme : (nativeTheme.shouldUseDarkColors ? "dark" : "light"); }
function lang() { return shellText.pickLang(look.lang, app.getPreferredSystemLanguages()); }
const bg = () => shellText.COLORS[theme()].paper;

let win = null;

// ── Which pages may load ───────────────────────────────────────────────────
const isAppUrl = (url) => {
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
};
const LOCAL_PAGES = ["loading.html", "offline.html"].map((f) => path.join(__dirname, f).toLowerCase());
const isLocalPage = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "file:" && LOCAL_PAGES.includes(decodeURIComponent(u.pathname).replace(/^\/+/, "").replace(/\//g, path.sep).toLowerCase());
  } catch { return false; }
};

function openExternally(url) {
  try {
    const { protocol } = new URL(url);
    if (["http:", "https:", "mailto:", "tel:"].includes(protocol)) shell.openExternal(url);
  } catch { /* ignore malformed links */ }
}

// ── Showing Higoverse, and what to show when it can't be ───────────────────
const nav = {
  lastUrl: APP_URL, // the Higoverse page to come back to
  attempt: 0,       // problem screens in a row (the retry waits longer each time)
  slowTimer: null,
  crashes: [],      // when the page crashed, for "twice in a minute"
  hung: null,       // AbortController of the "not responding" dialog
  expectCrash: false,
};

/** Loads a Higoverse page (watchPage times it). */
function open(url) {
  if (!win || win.isDestroyed()) return;
  win.loadURL(isAppUrl(url) ? url : APP_URL).catch(() => { /* did-fail-load shows the reason */ });
}

/** reason: offline | server | slow | crash */
function showProblem(reason, url) {
  if (!win || win.isDestroyed()) return;
  clearTimeout(nav.slowTimer);
  const t = shellText.text(lang());
  const key = { offline: "offline", server: "server", slow: "slow", crash: "crash" }[reason] || "offline";
  win.loadFile(path.join(__dirname, "offline.html"), {
    query: {
      reason: key, url: isAppUrl(url) ? url : nav.lastUrl, attempt: String(nav.attempt++),
      theme: theme(), lang: lang(),
      title: t[`${key}_title`], body: t[`${key}_body`], button: key === "crash" ? t.reload : t.retry, auto: t.auto,
    },
  }).catch(() => {});
}

function watchPage(wc) {
  // Every full page load (starting, Reload, a problem screen's retry) is
  // timed; moves inside the website are not.
  wc.on("did-start-navigation", (d) => {
    if (!d.isMainFrame || d.isSameDocument || !isAppUrl(d.url)) return;
    clearTimeout(nav.slowTimer);
    nav.slowTimer = setTimeout(() => {
      if (wc.isDestroyed()) return;
      wc.stop(); // reported as "aborted", which is ignored below
      showProblem("slow", d.url);
    }, slowMs(nav.attempt));
  });
  // Committed: the server answered. An error page from it (502 while the
  // server restarts during an update) gets our screen, which retries.
  wc.on("did-navigate", (_e, url, code) => {
    if (!isAppUrl(url)) return;
    clearTimeout(nav.slowTimer);
    if (code >= 500) { showProblem("server", url); return; }
    nav.lastUrl = url;
    nav.attempt = 0;
  });
  wc.on("did-navigate-in-page", (_e, url, isMainFrame) => { if (isMainFrame && isAppUrl(url)) nav.lastUrl = url; });

  // No answer at all: no internet, or the server can't be reached.
  wc.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted by a newer navigation */ || !isAppUrl(url)) return;
    showProblem(code === -7 || code === -118 /* timed out */ ? "slow" : "offline", url);
  });

  // The page's process died (out of memory, a crash): back to where it was
  // by itself once; a second crash within a minute waits for the user.
  wc.on("render-process-gone", (_e, details) => {
    if (details.reason === "clean-exit") return;
    nav.hung?.abort();
    const now = Date.now();
    if (!nav.expectCrash) nav.crashes = [...nav.crashes.filter((t) => now - t < 60_000), now];
    nav.expectCrash = false;
    console.warn("page process gone:", details.reason);
    if (nav.crashes.length >= 2) showProblem("crash", nav.lastUrl);
    else open(nav.lastUrl);
  });

  // Frozen (a script busy for a long time): Wait or Reload, and the
  // question goes away by itself if the page recovers.
  wc.on("unresponsive", async () => {
    if (nav.hung) return;
    const t = shellText.text(lang());
    nav.hung = new AbortController();
    const { response } = await dialog.showMessageBox(win, {
      type: "warning", title: "Higoverse", message: t.hung_title, detail: t.hung_body,
      buttons: [t.wait, t.reload], defaultId: 0, cancelId: 0, noLink: true, signal: nav.hung.signal,
    }).catch(() => ({ response: 0 }));
    nav.hung = null;
    if (response === 1 && !wc.isDestroyed()) {
      nav.expectCrash = true; // the restart below is not a crash
      wc.forcefullyCrashRenderer();
    }
  });
  wc.on("responsive", () => nav.hung?.abort());
}

// ── The main window ────────────────────────────────────────────────────────
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function createWindow() {
  const saved = windowState.load(stateFile());
  const bounds = windowState.fitBounds(saved.bounds, [screen.getPrimaryDisplay(), ...screen.getAllDisplays()].map((d) => d.workArea));
  win = new BrowserWindow({
    ...bounds,
    minWidth: windowState.MIN.width,
    minHeight: windowState.MIN.height,
    show: false,
    title: "Higoverse",
    backgroundColor: bg(),
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      // Live updates and sale alerts keep their connection while minimised
      // (throttled timers miss the keep-alive and the server drops it).
      backgroundThrottling: false,
    },
  });

  // Identify the desktop app to the website (it can adapt if it wants to).
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} HigoverseDesktop/${app.getVersion()}`);

  const state = windowState.saver(stateFile(), () => {
    if (!win || win.isDestroyed()) return null;
    return { maximized: win.isMaximized(), bounds: win.isMaximized() ? win.getNormalBounds() : win.getBounds() };
  });
  win.on("resize", state.soon);
  win.on("move", state.soon);
  win.on("close", state.flush);
  win.on("closed", () => { win = null; });

  // Keep the window title simple and consistent.
  win.on("page-title-updated", (e, title) => {
    e.preventDefault();
    const clean = String(title || "").replace(/\s*[|·-]\s*Higoverse.*$/i, "").trim();
    // The site's default title ("Higoverse | Inventory, Sales…") is just "Higoverse".
    win.setTitle(clean && !/^higoverse\b/i.test(clean) ? `${clean} - Higoverse` : "Higoverse");
  });

  win.webContents.on("context-menu", (_e, p) => buildContextMenu(p).popup({ window: win }));

  // While a page loads, the taskbar button shows a moving bar (no
  // percentage). The website draws its own bar for moves between pages;
  // this covers full loads. An update download owns the taskbar bar.
  const pageLoading = (on) => {
    if (!win || win.isDestroyed() || updates.busy()) return;
    win.setProgressBar(on ? 2 : -1, { mode: on ? "indeterminate" : "none" });
  };
  win.webContents.on("did-start-loading", () => pageLoading(true));
  win.webContents.on("did-stop-loading", () => pageLoading(false));

  watchPage(win.webContents);

  // The loading layout paints in a few milliseconds from disk, so the window
  // can show right away; then higoverse.com loads behind it and replaces it.
  win.once("ready-to-show", () => {
    if (saved.maximized) win.maximize();
    win.show();
  });
  const t = shellText.text(lang());
  win.loadFile(path.join(__dirname, "loading.html"), { query: { theme: theme(), lang: lang(), loading: t.loading, slow: t.slow } })
    .catch(() => {})
    .finally(() => open(APP_URL));
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
      { label: "Reload", click: () => open(nav.lastUrl) },
      { type: "separator" }, { label: "Print…", click: () => win.webContents.print() },
    );
  }
  return Menu.buildFromTemplate(items);
}

// ── Application menu (press Alt to show; shortcuts always work) ────────────
function buildMenu() {
  const go = (p) => () => open(new URL(p, APP_URL).toString());
  const history = () => win && win.webContents.navigationHistory;
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
        { label: "Back", accelerator: "Alt+Left", click: () => history()?.canGoBack() && history().goBack() },
        { label: "Forward", accelerator: "Alt+Right", click: () => history()?.canGoForward() && history().goForward() },
      ],
    },
    {
      label: "&View",
      submenu: [
        // On a problem screen, Reload goes back to Higoverse, not the screen.
        { label: "Reload", accelerator: "F5", click: () => open(nav.lastUrl) },
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
        { label: "Check for updates…", click: () => updates.check(true) },
        {
          label: "About Higoverse",
          click: () => dialog.showMessageBox(win, {
            type: "info",
            title: "About Higoverse",
            message: `Higoverse ${app.getVersion()}`,
            detail: "Business records, sales and stock.\n\nhttps://higoverse.com\nhigoverse@gmail.com",
            icon: ICON,
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

// Every window the app ever has (main, print pop-ups, update window) stays
// on Higoverse: links, redirects and pop-ups elsewhere go to the browser.
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
  const guard = (e, url) => {
    if (e.isMainFrame === false || isAppUrl(url) || isLocalPage(url)) return;
    e.preventDefault();
    openExternally(url);
  };
  contents.on("will-navigate", guard);
  contents.on("will-redirect", guard);
  // Receipts and invoices open a blank window and print it: allow those.
  contents.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank" || isAppUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
          icon: ICON,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    openExternally(url);
    return { action: "deny" };
  });
});

// The graphics process keeps dying: Chromium falls back on its own for this
// run; the next start draws with the processor from the beginning.
let gpuCrashes = 0;
app.on("child-process-gone", (_e, details) => {
  if (details.type !== "GPU" || details.reason === "clean-exit") return;
  if (++gpuCrashes === 2) {
    look.gpuOff = app.getVersion();
    saveLook.flush();
  }
});

app.whenReady().then(() => {
  // Only what the website uses: location for the address map, clipboard
  // writes, notifications. Everything else (camera, microphone…) is refused,
  // both when asked for and when the page checks.
  const allowed = new Set(["geolocation", "clipboard-sanitized-write", "notifications", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(allowed.has(permission) && isAppUrl(details.requestingUrl || wc.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => allowed.has(permission) && isAppUrl(origin));

  // Downloads (Excel/PDF exports) go through the normal Save dialog.
  session.defaultSession.on("will-download", (_e, item) => {
    item.setSaveDialogOptions({ title: "Save file", defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
  });

  // The website's theme and language, from preload.js on Higoverse pages only.
  ipcMain.on("hgv-look", (e, v) => {
    if (!win || e.sender !== win.webContents || !isAppUrl(e.sender.getURL()) || !v || typeof v !== "object") return;
    // Only a theme picked on the website is kept; "follow Windows" stays that.
    if (v.pref === "dark" || v.pref === "light") look.theme = v.pref;
    else delete look.theme;
    if (shellText.LANGS.includes(v.lang)) look.lang = v.lang;
    win.setBackgroundColor(shellText.COLORS[v.theme === "dark" ? "dark" : "light"].paper);
    saveLook.soon();
  });

  buildMenu();
  createWindow();
  updates.init({
    getMainWindow: () => (win && !win.isDestroyed() ? win : null),
    api: process.env.HIGOVERSE_UPDATE_API || new URL("/svc/settings/api/app-updates/latest?platform=windows", APP_ORIGIN).toString(),
  });
});

// Windows' light/dark changed: follow it unless the website chose one.
nativeTheme.on("updated", () => { if (win && !win.isDestroyed()) win.setBackgroundColor(bg()); });

app.on("window-all-closed", () => app.quit());
