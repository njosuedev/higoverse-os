"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

/**
 * In-app replacements for the browser's confirm() and alert(), which show an
 * unstyled "higoverse.com says" box that blocks the whole page.
 *
 *   if (!(await askConfirm({ message: t("items.confirm_delete"), danger: true }))) return;
 *   notify(t("items.add_failed"));                 // error (default)
 *   notify(t("items.added_successfully"), "success");
 *
 * <DialogHost /> is mounted once in the root layout.
 */

export type Tone = "error" | "success" | "warning" | "info";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon, for deletes and other irreversible actions. */
  danger?: boolean;
}

interface Toast { id: number; message: string; tone: Tone }
interface PendingConfirm extends ConfirmOptions { resolve: (ok: boolean) => void }
interface State { confirm: PendingConfirm | null; toasts: Toast[] }

let state: State = { confirm: null, toasts: [] };
const listeners = new Set<() => void>();
const emit = (next: State) => { state = next; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const SERVER_STATE: State = { confirm: null, toasts: [] };

/** Ask the user to confirm. Resolves true on confirm, false on cancel/escape. */
export function askConfirm(opts: ConfirmOptions | string): Promise<boolean> {
  const o = typeof opts === "string" ? { message: opts } : opts;
  state.confirm?.resolve(false); // a newer question replaces an unanswered one
  return new Promise((resolve) => emit({ ...state, confirm: { ...o, resolve } }));
}

let nextId = 1;
const TOAST_MS: Record<Tone, number> = { error: 7000, warning: 6000, success: 4000, info: 4000 };

/** Show a short, non-blocking message. */
export function notify(message: string, tone: Tone = "error") {
  const id = nextId++;
  emit({ ...state, toasts: [...state.toasts.slice(-3), { id, message, tone }] });
  setTimeout(() => dismiss(id), TOAST_MS[tone]);
}

function dismiss(id: number) {
  if (state.toasts.some((t) => t.id === id)) emit({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });
}

function answer(ok: boolean) {
  state.confirm?.resolve(ok);
  emit({ ...state, confirm: null });
}

const TOAST_STYLE: Record<Tone, { box: string; icon: React.ReactNode }> = {
  error:   { box: "border-accent/30 bg-white",   icon: <XCircle size={18} className="shrink-0 text-accent" /> },
  warning: { box: "border-warning/30 bg-white",  icon: <AlertTriangle size={18} className="shrink-0 text-warning" /> },
  success: { box: "border-success/30 bg-white",  icon: <CheckCircle2 size={18} className="shrink-0 text-success" /> },
  info:    { box: "border-ink/30 bg-white",      icon: <Info size={18} className="shrink-0 text-ink" /> },
};

export function DialogHost() {
  const { t } = useLanguage();
  const { confirm, toasts } = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape cancels; focus starts on the safe choice.
  useEffect(() => {
    if (!confirm) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") answer(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [confirm]);

  return (
    <>
      {confirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => answer(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="hgv-confirm-title"
            aria-describedby="hgv-confirm-msg"
            className="relative w-full max-w-md rounded-data border border-border bg-white p-6 shadow-[0_24px_60px_-12px_rgb(0_0_0_/_0.35)]"
          >
            <div className="flex gap-4">
              {confirm.danger && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                  <AlertTriangle size={20} className="text-accent" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 id="hgv-confirm-title" className="font-display text-lg font-semibold text-text">
                  {confirm.title ?? (confirm.danger ? t("dialog.delete_title") : t("dialog.confirm_title"))}
                </h2>
                <p id="hgv-confirm-msg" className="mt-1.5 text-[15px] leading-relaxed text-text-muted">{confirm.message}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                ref={cancelRef}
                onClick={() => answer(false)}
                className="h-10 rounded-full border border-border-strong bg-white px-5 text-sm font-semibold text-text transition hover:bg-paper-dim"
              >
                {confirm.cancelLabel ?? t("common.cancel")}
              </button>
              <button
                onClick={() => answer(true)}
                className={`h-10 rounded-full px-5 text-sm font-semibold text-white transition ${
                  confirm.danger ? "bg-accent hover:bg-accent-dark" : "bg-ink hover:bg-ink-dark"
                }`}
              >
                {confirm.confirmLabel ?? (confirm.danger ? t("common.delete") : t("common.confirm"))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts: bottom-right on desktop, full width at the bottom on phones */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[210] flex flex-col items-end gap-2 sm:left-auto sm:w-96">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full items-start gap-3 rounded-data border px-4 py-3 shadow-[0_12px_32px_-12px_rgb(0_0_0_/_0.35)] ${TOAST_STYLE[toast.tone].box}`}
          >
            {TOAST_STYLE[toast.tone].icon}
            <p className="flex-1 whitespace-pre-line text-sm text-text">{toast.message}</p>
            <button onClick={() => dismiss(toast.id)} aria-label={t("common.close")} className="-mr-1 shrink-0 rounded-full p-0.5 text-text-faint hover:bg-paper-dim hover:text-text">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
