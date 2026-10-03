// Runs in the page before the website loads. Exposes only a small, read-only
// marker so the website can tell it is inside the desktop app. No Node.js
// or file access is given to the page.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("higoverseDesktop", {
  isDesktop: true,
  platform: process.platform,
});
