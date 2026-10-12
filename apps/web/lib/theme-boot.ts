// Shared by the server layout (inline <head> script) and lib/theme.ts.
export const THEME_KEY = "hgv_theme";

/**
 * Runs in <head> before the page paints, so there is no light flash in dark mode.
 * Dark mode belongs to the signed-in app only: the public pages (home, sign-in,
 * download, privacy, 404) are always light. "/" is the app only with the
 * signed-in cookie (otherwise next.config.ts rewrites it to the home page).
 * The app's sections are the folders of app/(dashboard).
 */
export const THEME_BOOT_SCRIPT = `(function(){var r=document.documentElement;try{var l=location.pathname;var app=/^[/](admin|business|expenses|items|messages|partners|payroll|proforma|purchases|reports|sales|settings|team)([/]|$)/.test(l)||(l==="/"&&/(^|; )hgv_signed_in=1/.test(document.cookie));var p=localStorage.getItem("hgv_theme");var d=app&&(p==="dark"||(p!=="light"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches));r.dataset.theme=d?"dark":"light";}catch(e){r.dataset.theme="light";}})();`;
