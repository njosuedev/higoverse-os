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
- No internet: a "Can't reach Higoverse" screen that retries automatically.

**Security:** the page is sandboxed with no Node.js or file access; only
higoverse.com loads inside the app (other links open in the default browser);
only location, clipboard and notification permissions are granted, and only to
higoverse.com.

## Develop

```bash
npm install
npm start                                   # opens https://higoverse.com
HIGOVERSE_URL=http://localhost:3000/ npm start   # against the local web app
```

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
