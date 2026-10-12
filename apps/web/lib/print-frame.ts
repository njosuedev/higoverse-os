// Prints a ready-made HTML document (pay slips, the payroll sheet…) without
// opening a window: it goes into a hidden frame in the page, the frame's own
// script opens the print dialog once, and the frame is removed afterwards.
// So only the print dialog shows, not a second window behind it.

export function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Off screen but laid out at A4 width, so the papers print at their size.
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "210mm", height: "297mm", border: "0", opacity: "0" });
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) { frame.remove(); return; }
  let gone = false;
  const cleanUp = () => { if (gone) return; gone = true; setTimeout(() => frame.remove(), 500); };
  win.addEventListener("afterprint", cleanUp);
  // A print dialog left open can't be detected everywhere: tidy up later anyway.
  setTimeout(cleanUp, 10 * 60_000);
  doc.open();
  doc.write(html);
  doc.close();
}
