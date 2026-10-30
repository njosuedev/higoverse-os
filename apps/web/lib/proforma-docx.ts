// The proforma as a Word document (.docx): the same content and order as the
// printed one (lib/proforma-print.ts), but as ordinary editable text and
// tables, so a customer's own wording can be changed in Word before sending.
// The company header and the footer repeat on every page, as on the print.
//
// The `docx` library is loaded only when someone downloads one.

import type { Proforma } from "./proforma-api";
import type { PrintShop } from "./proforma-print";
import type * as Docx from "docx";

type T = (key: string) => string;

const NAVY = "1F3A68";
const GREY = "F3F3F3";
const LINE = "D4D4D4";
const PAGE_W = 11906;          // A4 width, twentieths of a point
const MARGIN = 850;            // ~15 mm
const CONTENT_W = PAGE_W - MARGIN * 2;

const money = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const dotDate = (s: string) => (s || "").replaceAll("-", ".");

/** An image as PNG bytes and its size, or null (missing, blocked, broken). */
async function pngOf(src: string): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width; canvas.height = bmp.height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    return blob ? { data: new Uint8Array(await blob.arrayBuffer()), w: bmp.width, h: bmp.height } : null;
  } catch {
    return null;   // the document is made without it
  }
}

async function qrPng(code: string): Promise<Uint8Array | null> {
  try {
    const QRCode = (await import("qrcode")).default;
    const url = await QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 1, width: 300 });
    const bin = atob(url.split(",")[1]);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Builds the .docx file for a proforma. */
export async function proformaDocx(
  p: Proforma, shop: PrintShop, t: T, isCar: boolean, opts: { qr?: boolean } = {},
): Promise<Blob> {
  const d = await import("docx");
  const {
    AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber,
    Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun, WidthType,
  } = d;

  const [logo, qr] = await Promise.all([
    shop.logo_url ? pngOf(shop.logo_url) : Promise.resolve(null),
    opts.qr !== false && p.doc_code ? qrPng(p.doc_code) : Promise.resolve(null),
  ]);

  const cur = p.currency || "";
  const size = 20;   // 10 pt, in half-points
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const thin = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  const boxBorders = { top: thin, bottom: thin, left: thin, right: thin };

  const run = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number; caps?: boolean } = {}) =>
    new TextRun({ text, bold: o.bold, italics: o.italics, color: o.color, size: o.size ?? size, allCaps: o.caps, font: "Arial" });
  const para = (children: Docx.TextRun[] | string, o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number } = {}) =>
    new Paragraph({
      children: typeof children === "string" ? [run(children)] : children,
      alignment: o.align, spacing: { after: o.after ?? 0, before: o.before ?? 0 },
    });
  /** Multi-line text as one paragraph per line. */
  const lines = (text: string, o: { bold?: boolean } = {}) =>
    (text || "").split("\n").map((s) => para([run(s, o)]));

  const cell = (content: Docx.Paragraph[] | string, o: { w: number; shade?: string; bold?: boolean; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; span?: number; borders?: object } = { w: 0 }) =>
    new TableCell({
      children: typeof content === "string" ? [para([run(content, { bold: o.bold, color: o.color })], { align: o.align })] : content,
      width: { size: o.w, type: WidthType.DXA },
      columnSpan: o.span,
      shading: o.shade ? { type: ShadingType.CLEAR, color: "auto", fill: o.shade } : undefined,
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      borders: o.borders ?? boxBorders,
    });

  const table = (rows: Docx.TableRow[], widths: number[], borders?: object) =>
    new Table({
      rows, columnWidths: widths, layout: TableLayoutType.FIXED,
      width: { size: CONTENT_W, type: WidthType.DXA }, borders,
    });

  // A details grid: label | value | label | value, as on the print.
  const GW = [0.21, 0.29, 0.21, 0.29].map((f) => Math.round(CONTENT_W * f));
  const gridRow = (a: string, av: string, b?: string, bv?: string, boldA = false, boldB = false) =>
    new TableRow({
      cantSplit: true,
      children: [
        cell(a, { w: GW[0], shade: GREY, bold: true, color: "444444" }),
        cell(av, { w: GW[1], bold: boldA }),
        ...(b !== undefined
          ? [cell(b, { w: GW[2], shade: GREY, bold: true, color: "444444" }), cell(bv ?? "", { w: GW[3], bold: boldB })]
          : [cell("", { w: GW[2] + GW[3], span: 2, borders: { top: none, bottom: none, left: thin, right: none } })]),
      ],
    });
  const grid = (rows: Docx.TableRow[]) => table(rows, GW);
  const na = (v: unknown) => String(v || "N/A");

  const h2 = (text: string) => new Paragraph({
    children: [run(text, { bold: true, color: NAVY, caps: true, size: 22 })],
    spacing: { before: 280, after: 120 }, indent: { left: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 4 } },
    keepNext: true,
  });

  // ── Header (every page): logo, company, title ──────────────────────────
  const LOGO = 1400, TITLE = 3200;
  const company = [
    para([run(shop.name, { caps: true, size: 24 })]),
    ...(shop.tin ? [para([run(`TIN: ${shop.tin}`, { bold: true })])] : []),
    ...(shop.phone ? [para([run(`Tel: ${shop.phone}`, { bold: true })])] : []),
    ...(shop.email ? [para([run(`EMAIL: ${shop.email}`, { bold: true })])] : []),
    ...(shop.address ? [para([run(shop.address.toUpperCase(), { bold: true })])] : []),
  ];
  const logoSide = 80;   // px at 96 dpi ≈ 21 mm
  const headTable = table([new TableRow({
    children: [
      ...(logo ? [cell([new Paragraph({ children: [new ImageRun({
        type: "png", data: logo.data,
        transformation: logo.w >= logo.h
          ? { width: logoSide, height: Math.round(logoSide * logo.h / logo.w) }
          : { width: Math.round(logoSide * logo.w / logo.h), height: logoSide },
      })] })], { w: LOGO, borders: noBorders })] : []),
      cell(company, { w: CONTENT_W - TITLE - (logo ? LOGO : 0), borders: noBorders }),
      cell([
        para([run(t("proforma.print_title_1"), { size: 40, caps: true })], { align: AlignmentType.CENTER }),
        para([run(t("proforma.print_title_2"), { size: 40, caps: true })], { align: AlignmentType.CENTER }),
        para([run(t("proforma.non_binding"), { size: 16, color: "444444" })], { align: AlignmentType.CENTER }),
      ], { w: TITLE, borders: noBorders }),
    ],
  })], logo ? [LOGO, CONTENT_W - TITLE - LOGO, TITLE] : [CONTENT_W - TITLE, TITLE], noBorders);

  const footer = new Footer({
    children: [new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 4 } },
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      children: [
        run(`${shop.name} — ${t("proforma.print_title")}   `, { size: 16, color: "555555" }),
        run(t("proforma.not_tax_invoice"), { size: 16, color: "555555", italics: true }),
        new TextRun({ children: ["\t", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 16, color: "555555", font: "Arial" }),
      ],
    })],
  });

  // ── Body ────────────────────────────────────────────────────────────────
  const body: (Docx.Paragraph | Docx.Table)[] = [];

  body.push(grid([
    gridRow(t("proforma.number_short"), p.invoice_no, t("proforma.date_issued"), dotDate(p.date)),
    gridRow(t("proforma.valid_until"), dotDate(p.valid_until), t("proforma.salesperson"), p.salesperson || shop.name),
  ]));

  body.push(h2(t("proforma.customer_info")), grid([
    gridRow(t("proforma.full_name"), p.customer, t("proforma.id_passport"), na(p.customer_id_no), true),
    gridRow("TIN", na(p.customer_tin), t("proforma.phone"), na(p.customer_phone)),
    gridRow(t("proforma.address"), na(p.customer_address), t("proforma.email"), na(p.customer_email)),
    gridRow(t("proforma.country"), na(p.customer_country), t("proforma.company"), na(p.customer_company)),
  ]));

  body.push(h2(t(isCar ? "proforma.vehicle_details" : "proforma.items_services")));
  if (isCar) {
    p.lines.forEach((l, i) => {
      if (p.lines.length > 1) body.push(para([run(`${t("proforma.vehicle")} ${i + 1}`, { bold: true, color: NAVY })], { before: 120, after: 80 }));
      body.push(grid([
        gridRow(t("proforma.brand"), l.product_name, t("proforma.genre"), l.car_type || "", true),
        gridRow(t("vehicle.year"), String(l.year || ""), t("proforma.energy"), l.energy || ""),
        gridRow(t("proforma.colour"), l.color || "", t("proforma.condition"), l.condition ? t(`proforma.condition_${l.condition}`) : ""),
        gridRow(t("proforma.mileage"), String(l.mileage || ""), t("proforma.quantity"), String(l.qty)),
        gridRow(t("vehicle.chassis_no"), l.chassis_no || "", t("vehicle.plate_no"), l.plate_no || ""),
        gridRow(t("proforma.col_price"), `${money(l.unit_price)} ${cur}`, t("proforma.total_price"), `${money(l.unit_price * l.qty)} ${cur}`, false, true),
      ]));
    });
  } else {
    const IW = [0.06, 0.49, 0.1, 0.17, 0.18].map((f) => Math.round(CONTENT_W * f));
    const R = AlignmentType.RIGHT;
    const flat = { top: none, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E5E5" } };
    const headCell = (s: string, w: number, align?: typeof R) => cell([para([run(s, { bold: true, color: "FFFFFF", size: 18, caps: true })], { align })], { w, shade: NAVY, borders: noBorders });
    const total = (label: string, value: string, strong = false) => new TableRow({ cantSplit: true, children: [
      cell([para([run(label, { bold: strong, color: strong ? "FFFFFF" : "444444" })], { align: R })], { w: IW[0] + IW[1] + IW[2] + IW[3], span: 4, shade: strong ? NAVY : undefined, borders: noBorders }),
      cell([para([run(value, { bold: strong, color: strong ? "FFFFFF" : "444444" })], { align: R })], { w: IW[4], shade: strong ? NAVY : undefined, borders: noBorders }),
    ] });
    body.push(table([
      new TableRow({ tableHeader: true, children: [
        headCell("#", IW[0]), headCell(t("proforma.description_col"), IW[1]), headCell(t("proforma.col_qty"), IW[2], R),
        headCell(t("proforma.col_price"), IW[3], R), headCell(t("proforma.col_total"), IW[4], R),
      ] }),
      ...p.lines.map((l, i) => new TableRow({ cantSplit: true, children: [
        cell(String(i + 1), { w: IW[0], borders: flat }),
        cell(l.product_name, { w: IW[1], borders: flat }),
        cell(String(l.qty), { w: IW[2], align: R, borders: flat }),
        cell(money(l.unit_price), { w: IW[3], align: R, borders: flat }),
        cell(money(l.unit_price * l.qty), { w: IW[4], align: R, borders: flat }),
      ] })),
      total(t("proforma.subtotal"), money(p.subtotal)),
      ...(p.tax_rate > 0 ? [total(`${t("proforma.tax")} (${p.tax_rate}%)`, money(p.tax_amount))] : []),
      total(t("proforma.grand_total"), `${money(p.grand_total)} ${cur}`, true),
    ], IW, noBorders));
  }

  const paid = (p.deposits ?? []).reduce((a, x) => a + (Number(x.amount) || 0), 0) || (p.deposit_amount || 0);
  const due = Math.max(0, p.grand_total - paid);
  const deps = (p.deposits ?? []).map((x, i) => [
    `${t("deposit.n")} ${i + 1}`,
    `${money(x.amount)} · ${t(`sales.pm_${x.method}`)} · ${dotDate(x.date)}${x.reference ? ` · ${x.reference}` : ""}`,
  ] as const);
  body.push(h2(t("proforma.payment_terms")), grid([
    gridRow(t("proforma.payment_method"), p.payment_method || "", t("proforma.currency"), cur),
    gridRow(t("proforma.deposit"), money(paid), t("proforma.balance_due"), money(due), false, true),
    ...Array.from({ length: Math.ceil(deps.length / 2) }, (_, i) => {
      const [a, b] = [deps[i * 2], deps[i * 2 + 1]];
      return b ? gridRow(a[0], a[1], b[0], b[1]) : gridRow(a[0], a[1]);
    }),
  ]));

  if (p.bank_details) {
    const BW = [Math.round(CONTENT_W * 0.22), CONTENT_W - Math.round(CONTENT_W * 0.22)];
    body.push(para("", { after: 200 }), table([new TableRow({ cantSplit: true, children: [
      cell(t("proforma.bank_details"), { w: BW[0], shade: GREY, bold: true, color: "444444" }),
      cell(lines(p.bank_details), { w: BW[1] }),
    ] })], BW));
  }

  const terms = (p.terms || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (terms.length) {
    body.push(h2(t("proforma.terms")), table([new TableRow({ cantSplit: true, children: [
      cell(terms.map((s) => para([run(s, { size: 18, color: "333333" })], { after: 40 })), { w: CONTENT_W, shade: GREY }),
    ] })], [CONTENT_W]));
  }
  if (p.notes) body.push(para([run(`${t("proforma.notes")}: `, { bold: true, size: 18 }), run(p.notes, { size: 18, color: "333333" })], { before: 160 }));

  // Signatures: titles in one row, then the lines to sign and to write the
  // name and date on, each in a row of its own so they line up across.
  const signLine = (label: string) => [new Paragraph({
    children: [run(label, { size: 18, color: "555555" })],
    spacing: { before: 560 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 4 } },
  })];
  const QRW = qr ? 1700 : 0;
  const GAP = 500;
  const SW = Math.round((CONTENT_W - QRW - GAP) / 2);
  const sigRow = (a: Docx.Paragraph[], b: Docx.Paragraph[], qrCell?: Docx.TableCell) => new TableRow({ cantSplit: true, children: [
    cell(a, { w: SW, borders: noBorders }), cell([para("")], { w: GAP, borders: noBorders }), cell(b, { w: SW, borders: noBorders }),
    ...(qrCell ? [qrCell] : []),
  ] });
  const qrCell = qr ? new TableCell({
    rowSpan: 3, width: { size: QRW, type: WidthType.DXA }, borders: noBorders,
    margins: { top: 70, bottom: 70, left: 120, right: 120 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: qr, transformation: { width: 90, height: 90 } })] }),
      para([run(t("print.qr_caption"), { size: 14, color: "555555" })], { align: AlignmentType.CENTER }),
    ],
  }) : undefined;
  const sigTitle = (s: string) => [para([run(s, { bold: true, color: NAVY, caps: true })])];
  body.push(h2(t("proforma.signatures")), table([
    sigRow(sigTitle(t("proforma.sig_customer")), sigTitle(t("proforma.sig_dealer")), qrCell),
    sigRow(signLine(t("proforma.signature")), signLine(t("proforma.signature"))),
    sigRow(signLine(t("proforma.name_date")), signLine(t("proforma.name_date"))),
  ], qr ? [SW, GAP, SW, QRW] : [SW, GAP, SW], noBorders));
  body.push(para([run(t("proforma.thanks").replace("{shop}", shop.name), { italics: true, color: "444444" })], { align: AlignmentType.CENTER, before: 360 }));

  const doc = new Document({
    creator: shop.name,
    title: `${t("proforma.print_title")} ${p.invoice_no}`,
    styles: { default: { document: { run: { font: "Arial", size } } } },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 500, footer: 400 } } },
      headers: { default: new Header({ children: [headTable, para("", { after: 120 })] }) },
      footers: { default: footer },
      children: body,
    }],
  });
  return Packer.toBlob(doc);
}

/** Builds the .docx and saves it as "Proforma <number>.docx". */
export async function downloadProformaDocx(...args: Parameters<typeof proformaDocx>): Promise<void> {
  const [p, , t] = args;
  const blob = await proformaDocx(...args);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${t("proforma.print_title")} ${p.invoice_no}.docx`.replace(/[\\/:*?"<>|]+/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
