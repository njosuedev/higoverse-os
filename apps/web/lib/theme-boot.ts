// Shared by the server layout (inline <head> script) and lib/theme.ts.
export const THEME_KEY = "hgv_theme";

/** Runs in <head> before the page paints, so there is no light flash in dark mode. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("hgv_theme");var d=p==="dark"||((p!=="light")&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;
