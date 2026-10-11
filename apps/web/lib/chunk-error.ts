// A page that fails because one of its code files is gone: the tab runs a
// version of the website older than the server's (a deploy happened since
// it opened). Loading the page again fixes it, so that's done for the
// person, once (a second failure within a minute shows the error instead,
// so a real outage never loops).

const KEY = "hgv_chunk_reload_at";

export function isChunkError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  return e?.name === "ChunkLoadError"
    || /Loading (CSS )?chunk|Failed to load chunk|dynamically imported module|Importing a module script failed/i.test(e?.message ?? "");
}

/** Whether `error` is a missing code file that a reload should fix (not
 *  tried in the last minute). Reads only; see reloadForChunkError. */
export function chunkReloadDue(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkError(error)) return false;
  try {
    return Date.now() - Number(sessionStorage.getItem(KEY) || 0) >= 60_000;
  } catch {
    return true;
  }
}

/** Loads the page again, noting when, so it's tried once. */
export function reloadForChunkError(): void {
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
}
