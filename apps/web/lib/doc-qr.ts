// The QR code on every document Higoverse prints. It holds only the signed
// code the server gives the document ("HGV1.<kind>.<id>.<signature>",
// sale-service and expense-service core/doc_code.py): no readable details,
// so only the Higoverse app can check it, and only inside the business that
// printed it. Built synchronously as SVG, so the print builders stay pure.

import QRCode from "qrcode";

/** The QR code for `text` as SVG (sharp on any printer), or null. */
export function qrSvg(text: string | null | undefined): string | null {
  if (!text) return null;
  try {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
    const n = modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" style="width:100%;height:100%;display:block"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  } catch {
    return null;   // the document prints without it
  }
}

/** Whether scanned text is a Higoverse document code. */
export const isDocCode = (text: string) => /^HGV1\.[A-Z]\./.test(text.trim());

/** A QR block for a printed page: the code at `size`, with a short caption. */
export function qrBlockHtml(code: string | null | undefined, caption: string, size = "26mm"): string {
  const svg = qrSvg(code);
  if (!svg) return "";
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  return `<div class="hgv-qr" style="text-align:center;break-inside:avoid"><div style="width:${size};height:${size};margin:0 auto">${svg}</div>`
    + `<div style="font-size:9px;color:#555;margin-top:3px;max-width:${size};margin-left:auto;margin-right:auto">${esc(caption)}</div></div>`;
}
