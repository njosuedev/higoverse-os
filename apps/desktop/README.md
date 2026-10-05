# Higoverse for Windows (Electron)

A desktop app around https://higoverse.com, packaged with a standard Windows
installer (electron-builder / NSIS).

## What it does

- Own window, taskbar entry and Start menu / Desktop shortcuts with the Higoverse icon.
- One running copy: opening it again brings the existing window forward.
- Remembers its size and position (and whether it was maximised).
- Menu (press **Alt**): File, Edit, Go (Dashboard, Stock, Sales, Customers,
  Expenses, Reports), View (reload, zoom, full screen), Help (website, privacy,
  support, About). Shortcuts: Ctrl+P print, F5 reload, F11 full screen,
  Ctrl +/− zoom, Alt+←/→ back/forward.
- Right-click menu: cut/copy/paste, spelling suggestions, open links in the browser.
- Receipts and proforma invoices print as on the website; Excel/PDF exports use a Save dialog.
- Opens at once on the website's own loading layout (`loading.html`), in the
  colours and language last used on the website; after 8 s it says the
  connection is slow.
- Its own screens when Higoverse can't be shown (`offline.html`), in the
  website's five languages: no internet, the server answering with an error
  (e.g. 502 during a deploy), no answer within 30 s, or the page crashing.
  They go back to the page you were on, retrying after 5, 10, 20, then 30 s.
- Stays up: a crashed page reloads by itself (a second crash within a minute
  shows the crash screen); a frozen page offers Wait / Reload; if the graphics
  card fails twice, the next start draws with the processor.
- Live updates keep running while minimised (no background timer throttling).
- A window last seen on a monitor that is no longer connected opens on the
  main screen.

**Security:** the page is sandboxed with no Node.js or file access; only
higoverse.com loads inside the app (other links open in the default browser);
only location, clipboard and notification permissions are granted, and only to
higoverse.com.

## Develop

```bash
npm install
npm start                                   # opens https://higoverse.com
HIGOVERSE_URL=http://localhost:3000/ npm start   # against the local web app
HIGOVERSE_USER_DATA=D:/tmp/hgv npm start       # settings apart from the installed app
npm test                                    # window placement, screen texts, updates
```

Files: `main.js` (window, navigation, recovery, menus), `updates.js`
(self-updating), `window-state.js` (where the window opens), `shell-text.js`
(texts and colours of the app's own screens), `preload.js` (the page's only
bridge: a read-only marker, and its theme/language for the next start).

## Build the installer

```bash
npm run dist        # → dist/Higoverse-Setup-<version>.exe
```

The installer offers "Only for me" / "All users", lets you choose the folder,
creates Desktop and Start menu shortcuts, registers in **Settings → Apps** with
an uninstaller, and can start Higoverse when it finishes.

Raise `version` in `package.json` for each release. The installer is not
code-signed; Windows SmartScreen may warn until a code-signing certificate is
configured (`win.certificateFile` / `certificatePassword`, or Azure Trusted Signing).

If drive C: is short of space, point the caches elsewhere before building, e.g.
`ELECTRON_CACHE`, `ELECTRON_BUILDER_CACHE`, `npm_config_cache`, `TEMP`/`TMP` on D:.
