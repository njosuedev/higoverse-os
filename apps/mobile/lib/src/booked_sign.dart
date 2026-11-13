import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'i18n.dart';
import 'media.dart';
import 'session.dart';

// The "BOOKED" sign: one landscape A4 sheet put on (or in) a car once a
// customer has booked it with a proforma. The same sheet as the website's
// (apps/web/lib/booked-print.ts), laid out like the dealer's paper sign:
// logo, customer and phone, a large BOOKED, the car(s), proforma number and
// booked-until date, salesperson and date. No amounts: the sign sits on the
// car where any visitor can read it. An empty field leaves a line to write on.

Future<Uint8List> bookedSignPdf(Map<String, dynamic> p, Session s, T t) async {
  // Open Sans, as on the paper sign; the PDF's built-in font without a
  // connection. A slow connection must not hold the sign up: 6 s at most.
  pw.ThemeData? theme;
  try {
    Future<pw.Font> font(Future<pw.Font> f) => f.timeout(const Duration(seconds: 6));
    final base = await font(PdfGoogleFonts.openSansRegular()), bold = await font(PdfGoogleFonts.openSansBold());
    theme = pw.ThemeData.withFont(base: base, bold: bold, fontFallback: [if (t.lang == 'zh') await font(PdfGoogleFonts.notoSansSCRegular())]);
  } catch (_) {}
  final doc = pw.Document(title: '${t('pf.booked')} ${p['invoice_no'] ?? ''}', author: s.shop?.name ?? 'Higoverse', theme: theme);
  final logoBytes = dataUrlBytes(s.shop?.logoUrl);
  final logo = logoBytes != null && logoBytes.isNotEmpty ? pw.MemoryImage(logoBytes) : null;
  final lines = (p['lines'] as List? ?? []).whereType<Map>().toList();
  const ink = PdfColor.fromInt(0xFF2F2F33);
  const muted = PdfColor.fromInt(0xFF555555);
  String v(Object? x) => '${x ?? ''}'.trim();
  String dot(Object? d) => v(d).replaceAll('-', '.');

  // A label, then the value on a line (blank line when there's no value).
  pw.Widget field(String label, String value, {double size = 13, bool bold = false}) => pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.end,
        children: [
          pw.Text(label, style: pw.TextStyle(fontSize: size, color: ink)),
          pw.SizedBox(width: 8),
          pw.Expanded(
            child: pw.Container(
              padding: const pw.EdgeInsets.symmetric(horizontal: 5),
              decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: ink, width: 0.8))),
              child: pw.Text(value.isEmpty ? ' ' : value, style: pw.TextStyle(fontSize: size, color: ink, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
            ),
          ),
        ],
      );

  pw.Widget th(String x) => pw.Padding(padding: const pw.EdgeInsets.fromLTRB(5, 0, 5, 3), child: pw.Text(x, style: pw.TextStyle(fontSize: 9, color: muted, fontWeight: pw.FontWeight.bold)));
  pw.Widget td(String x, {bool bold = false}) => pw.Padding(padding: const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 4), child: pw.Text(x, style: pw.TextStyle(fontSize: 10.5, color: ink, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)));

  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.a4.landscape,
    margin: const pw.EdgeInsets.fromLTRB(45, 40, 45, 45),
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Expanded(
          child: pw.Align(
            alignment: pw.Alignment.topLeft,
            child: logo != null
                ? pw.Container(height: 45, width: 170, alignment: pw.Alignment.topLeft, child: pw.Image(logo, fit: pw.BoxFit.contain))
                : pw.Text((s.shop?.name ?? '').toUpperCase(), style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: ink)),
          ),
        ),
        pw.SizedBox(
          width: 345,
          child: pw.Column(children: [
            field(t('pf.customer'), v(p['customer'])),
            pw.SizedBox(height: 12),
            field(t('pf.booked_number'), v(p['customer_phone'])),
          ]),
        ),
      ]),
      // The word fills the space left, whatever the language.
      pw.Expanded(
        child: pw.Padding(
          padding: const pw.EdgeInsets.symmetric(horizontal: 25, vertical: 10),
          child: pw.FittedBox(fit: pw.BoxFit.contain, child: pw.Text(t('pf.booked'), style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: ink))),
        ),
      ),
      if (lines.isNotEmpty)
        pw.Table(
          columnWidths: const {0: pw.FlexColumnWidth(2.2), 1: pw.FlexColumnWidth(0.9), 2: pw.FlexColumnWidth(1.1), 3: pw.FlexColumnWidth(1.6), 4: pw.FlexColumnWidth(2.6), 5: pw.FlexColumnWidth(1.4)},
          border: const pw.TableBorder(horizontalInside: pw.BorderSide(color: PdfColors.grey400, width: 0.5), bottom: pw.BorderSide(color: PdfColors.grey400, width: 0.5)),
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: ink, width: 0.8))),
              children: [th(t('pf.booked_car')), th(t('pf.year')), th(t('pf.colour')), th(t('pf.plate')), th(t('pf.chassis')), th(t('pf.mileage'))],
            ),
            for (final l in lines)
              pw.TableRow(children: [
                td(v(l['product_name']), bold: true), td(v(l['year'])), td(v(l['color'])),
                td(v(l['plate_no']), bold: true), td(v(l['chassis_no'])), td(v(l['mileage'])),
              ]),
          ],
        ),
      pw.SizedBox(height: 14),
      pw.Row(children: [
        pw.Expanded(child: field(t('pf.booked_proforma_no'), v(p['invoice_no']), size: 11.5, bold: true)),
        pw.SizedBox(width: 28),
        pw.Expanded(child: field(t('pf.booked_until'), dot(p['valid_until']), size: 11.5, bold: true)),
      ]),
      pw.SizedBox(height: 18),
      pw.Row(children: [
        pw.Expanded(child: field(t('pf.booked_salesperson'), v(p['salesperson']))),
        pw.SizedBox(width: 60),
        pw.Expanded(child: field(t('pf.date'), dot(p['date']))),
      ]),
    ]),
  ));
  return doc.save();
}

/// Opens the phone's print dialog with the sign (it can be saved as PDF there too).
Future<void> printBookedSign(Map<String, dynamic> p, Session s, T t) async {
  final bytes = await bookedSignPdf(p, s, t);
  await Printing.layoutPdf(onLayout: (_) async => bytes, name: 'BOOKED-${p['invoice_no'] ?? ''}.pdf', format: PdfPageFormat.a4.landscape);
}
