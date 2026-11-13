// Runs in the page before the website loads. Exposes only a small
// marker so the website can tell it is inside the desktop app, and a way to
// print a paper in landscape. No Node.js
// or file access is given to the page.
//
// It also tells the app which theme and language the website is showing
// (<html data-theme>, its "hgv_theme" choice and "app_lang"), so the window's background
// follows a theme change at once and the next start opens in the same
// colours and language. Nothing is sent from the app's own local pages.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("higoverseDesktop", {
  isDesktop: true,
  platform: process.platform,
  // Prints a ready-made HTML paper with the print dialog set to A4 in the
  // given orientation (window.print() here always starts on portrait).
  printHtml: (html, opts) => ipcRenderer.invoke("hgv-print-html", { html: String(html), landscape: !!(opts && opts.landscape) }),
});

if (location.protocol === "https:" || location.protocol === "http:") {
  let last = "";
  const report = () => {
    let lang = "", pref = "";
    try {
      lang = localStorage.getItem("app_lang") || "";
      pref = localStorage.getItem("hgv_theme") || ""; // "dark" | "light" | unset (follow Windows)
    } catch { /* storage blocked */ }
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const now = `${theme}|${pref}|${lang}`;
    if (now === last) return;
    last = now;
    ipcRenderer.send("hgv-look", { theme, pref, lang });
  };
  window.addEventListener("DOMContentLoaded", () => {
    report();
    new MutationObserver(report).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "lang"] });
  });
}
