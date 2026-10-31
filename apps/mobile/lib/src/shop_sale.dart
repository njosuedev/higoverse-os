import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'config.dart';
import 'format.dart';
import 'forms.dart';
import 'i18n.dart';
import 'live/scoped_route.dart';
import 'session.dart';
import 'sheets.dart' show payLabel;
import 'theme.dart';
import 'widgets.dart';

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;

/// One item of a shop sale: the product, how many, at what price.
class SaleLine {
  SaleLine(this.product, {this.qty = 1}) : price = TextEditingController(text: amountText(_n(product['selling_price'])));
  final Map<String, dynamic> product;
  int qty;
  final TextEditingController price;

  int get stock => _n(product['quantity']).toInt();
  num get unit => parseAmount(price.text) ?? 0;
  num get total => unit * qty;

  /// Profit at this price (shops only see it; never car companies).
  num get profit => (unit - _n(product['cost_price'])) * qty;
}

/// What the customer handed over goes to the items in order, each up to
/// its own total (so a receipt and each sale say what was really paid).
List<num> sharePaid(List<num> totals, num paid) {
  var left = paid;
  return [
    for (final t in totals)
      () {
        final share = left < t ? (left < 0 ? 0 : left) : t;
        left -= share;
        return share;
      }(),
  ];
}

/// A shop sale with several items, as on the website: each item is its own
/// sale (stock goes down for each), paid together. On credit, one debt for
/// the whole amount. True when something was sold.
class ShopSaleFormScreen extends StatefulWidget {
  const ShopSaleFormScreen({super.key, this.product});
  final Map<String, dynamic>? product;

  @override
  State<ShopSaleFormScreen> createState() => _ShopSaleFormScreenState();
}

class _ShopSaleFormScreenState extends State<ShopSaleFormScreen> {
  static const _methods = ['cash', 'mtn', 'airtel', 'bank', 'card', 'debt'];
  final _form = GlobalKey<FormState>();
  final List<SaleLine> _lines = [];
  final _sent = TextEditingController();
  final _debtor = TextEditingController();
  final _phone = TextEditingController();
  final _notes = TextEditingController();
  String _method = 'cash';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.product != null && _n(widget.product!['quantity']) > 0) _lines.add(_line(widget.product!));
    _sent.addListener(() => setState(() {}));
    // Straight to the product list when nothing is picked yet.
    if (_lines.isEmpty) WidgetsBinding.instance.addPostFrameCallback((_) => _addItem());
  }

  @override
  void dispose() {
    for (final l in _lines) {
      l.price.dispose();
    }
    for (final c in [_sent, _debtor, _phone, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  SaleLine _line(Map<String, dynamic> p) => SaleLine(p)..price.addListener(() => setState(() {}));

  num get _total => _lines.fold<num>(0, (a, l) => a + l.total);
  num get _profit => _lines.fold<num>(0, (a, l) => a + l.profit);

  Future<void> _addItem() async {
    final p = await pushScoped<Map<String, dynamic>>(context, const ProductPickerScreen());
    if (p == null || !mounted) return;
    setState(() {
      final same = _lines.where((l) => '${l.product['id']}' == '${p['id']}').firstOrNull;
      if (same != null) {
        if (same.qty < same.stock) same.qty++;
      } else {
        _lines.add(_line(p));
      }
    });
  }

  Future<void> _save() async {
    final t = T.of(context);
    final s = SessionScope.of(context);
    if (_lines.isEmpty) return say(context, t('form.pick_product_first'));
    if (!_form.currentState!.validate()) return;
    final debt = _method == 'debt';
    final notes = _notes.text.trim();
    final sent = parseAmount(_sent.text);
    final total = _total;
    final shares = sent == null ? null : sharePaid([for (final l in _lines) l.total], sent);
    setState(() => _saving = true);
    final created = <Map<String, dynamic>>[];
    final failed = <String>[];
    for (final (i, l) in _lines.indexed) {
      try {
        final res = await s.api.post('${Svc.sales}/sales', {
          'product_id': '${l.product['id']}',
          'quantity': l.qty,
          'unit_price': l.unit,
          if (notes.isNotEmpty) 'notes': notes,
          'payment_method': _method,
          if (debt) 'amount_paid': 0 else if (shares != null) 'amount_paid': shares[i],
        });
        final sale = (res as Map?)?['data'];
        if (sale is Map) created.add(Map<String, dynamic>.from(sale));
      } catch (e) {
        failed.add('${l.product['name'] ?? ''}: ${errorText(t, e)}');
      }
    }
    if (debt && created.isNotEmpty) {
      // As on the website: the sale stands even if the debt can't be written.
      try {
        await s.api.post('${Svc.sales}/debts', {
          'debtor_name': _debtor.text.trim(),
          if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
          'amount_owed': created.fold<num>(0, (a, x) => a + _n(x['total_amount'])),
          'amount_paid': 0,
          if (notes.isNotEmpty) 'notes': notes,
          'sale_id': '${created.first['id']}',
        });
      } catch (_) {
        failed.add(t('form.debt_not_saved'));
      }
    }
    if (!mounted) return;
    setState(() => _saving = false);
    if (created.isEmpty) return say(context, failed.join('\n'));
    HapticFeedback.mediumImpact();
    if (failed.isNotEmpty) say(context, '${t('m.some_items_failed')}\n${failed.join('\n')}');
    final paid = debt ? 0 : (sent ?? total);
    await showReceiptDone(
      context,
      created,
      method: _method,
      paid: paid,
      change: !debt && sent != null && sent > total ? sent - total : 0,
      customer: debt ? _debtor.text.trim() : null,
    );
    if (mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final sent = parseAmount(_sent.text) ?? 0;
    final change = sent > _total ? sent - _total : 0;
    return FormPage(
      title: t('form.new_sale'),
      formKey: _form,
      saving: _saving,
      saveLabel: t('form.save_sale'),
      onSave: _save,
      children: [
        LabeledField(
          t('m.items_n', {'n': _lines.length}),
          Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (final (i, l) in _lines.indexed)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 4, 10),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      ProductThumb(l.product['thumbnail'] as String?, isCar: false, width: 40, height: 32),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${l.product['name'] ?? ''}',
                              maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(
                            [
                              t('stock.in_stock_n', {'n': groupDigits(l.stock)}),
                              if (s.canSeeFinancials && l.product['cost_price'] != null)
                                '${t('form.cost_price')} ${groupDigits(_n(l.product['cost_price']))}',
                            ].join(' · '),
                            style: TextStyle(fontSize: 12, color: l.stock <= s.lowStock ? c.warning : c.muted),
                          ),
                        ]),
                      ),
                      IconButton(
                        tooltip: t('app.delete'),
                        onPressed: () => setState(() => _lines.removeAt(i).price.dispose()),
                        icon: Icon(Icons.close, color: c.faint),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Row(children: [
                      IconButton.outlined(
                        visualDensity: VisualDensity.compact,
                        onPressed: l.qty > 1 ? () => setState(() => l.qty--) : null,
                        icon: const Icon(Icons.remove, size: 18),
                      ),
                      SizedBox(
                        width: 40,
                        child: Text('${l.qty}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      ),
                      IconButton.outlined(
                        visualDensity: VisualDensity.compact,
                        onPressed: l.qty < l.stock ? () => setState(() => l.qty++) : null,
                        icon: const Icon(Icons.add, size: 18),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child:
                            moneyField(l.price, suffix: s.currency, validator: (v) => (parseAmount(v ?? '') ?? -1) < 0 ? t('form.need_price') : null),
                      ),
                      const SizedBox(width: 6),
                    ]),
                    Padding(
                      padding: const EdgeInsets.only(top: 6, right: 8),
                      child: Row(children: [
                        if (s.showsProfit)
                          Text('${l.profit >= 0 ? '+' : ''}${groupDigits(l.profit)}',
                              style: TextStyle(fontSize: 12, color: l.profit >= 0 ? c.success : c.danger, fontWeight: FontWeight.w600)),
                        const Spacer(),
                        Text(money(l.total, s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                      ]),
                    ),
                  ]),
                ),
              ),
            OutlinedButton.icon(
              onPressed: _addItem,
              icon: const Icon(Icons.add_shopping_cart_outlined),
              label: Text(_lines.isEmpty ? t('form.pick_product') : t('m.add_item')),
            ),
          ]),
        ),
        LabeledField(
          t('sale.payment'),
          Choices<String>(
            options: [for (final m in _methods) (m, payLabel(t, m))],
            value: _method,
            onChanged: (m) => setState(() {
              _method = m;
              _sent.clear();
            }),
          ),
        ),
        if (_method != 'debt')
          LabeledField(
            t('m.amount_sent'),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: moneyField(_sent, suffix: s.currency)),
              const SizedBox(width: 8),
              SizedBox(
                height: 48,
                child: OutlinedButton(
                  onPressed: _total <= 0 ? null : () => _sent.text = amountText(_total),
                  child: Text(t('m.exact_amount')),
                ),
              ),
            ]),
            hint: change > 0 ? t('m.change_n', {'amount': money(change, s.currency)}) : t('m.amount_sent_hint'),
          )
        else ...[
          LabeledField(
            t('form.debtor_name'),
            textField(_debtor, validator: (v) => (v ?? '').trim().isEmpty ? t('form.need_debtor') : null),
          ),
          LabeledField(t('form.phone'), textField(_phone, keyboard: TextInputType.phone, caps: false)),
        ],
        LabeledField(t('sale.notes'), textField(_notes, hint: t('form.optional'), lines: 2)),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
          child: Column(children: [
            Row(children: [
              Expanded(child: Text(t('sale.total'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
              const SizedBox(width: 8),
              Text(money(_total, s.currency), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            ]),
            if (s.showsProfit && _lines.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(children: [
                  Expanded(child: Text(t('m.est_profit'), style: TextStyle(color: c.muted), overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 8),
                  Text('${_profit >= 0 ? '+' : ''}${money(_profit, s.currency)}',
                      style: TextStyle(fontWeight: FontWeight.w800, color: _profit >= 0 ? c.success : c.danger)),
                ]),
              ),
            if (change > 0)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(children: [
                  Expanded(child: Text(t('m.change'), style: TextStyle(color: c.muted), overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 8),
                  Text(money(change, s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                ]),
              ),
          ]),
        ),
      ],
    );
  }
}

/// After a sale: what was sold, and the receipt to print or share.
Future<void> showReceiptDone(BuildContext context, List<Map<String, dynamic>> sales,
    {required String method, num paid = 0, num change = 0, String? customer}) {
  final t = T.of(context);
  final s = SessionScope.of(context);
  final total = sales.fold<num>(0, (a, x) => a + _n(x['total_amount']));
  Future<void> pdf(BuildContext ctx, {required bool print}) async {
    try {
      final bytes = await receiptPdf(sales, s, t, method: method, paid: paid, change: change, customer: customer);
      final name = 'receipt-${'${sales.first['id'] ?? ''}'.padRight(8).substring(0, 8).trim().toUpperCase()}.pdf';
      if (print) {
        await Printing.layoutPdf(onLayout: (_) async => bytes, name: name);
      } else {
        await Printing.sharePdf(bytes: bytes, filename: name);
      }
    } catch (e) {
      if (ctx.mounted) say(ctx, errorText(t, e));
    }
  }

  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    backgroundColor: Hgv.of(context).elevated,
    builder: (sheet) {
      final c = Hgv.of(sheet);
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Icon(Icons.check_circle_rounded, color: c.success, size: 52),
          const SizedBox(height: 8),
          Text(t('form.sale_saved', {'amount': money(total, s.currency)}),
              textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(
            [
              payLabel(t, method),
              if (change > 0) t('m.change_n', {'amount': money(change, s.currency)})
            ].join(' · '),
            textAlign: TextAlign.center,
            style: TextStyle(color: c.muted),
          ),
          const SizedBox(height: 18),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                  onPressed: () => pdf(sheet, print: false), icon: const Icon(Icons.share_outlined), label: Text(t('m.share_receipt'))),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                  onPressed: () => pdf(sheet, print: true), icon: const Icon(Icons.print_outlined), label: Text(t('m.print_receipt'))),
            ),
          ]),
          const SizedBox(height: 8),
          TextButton(onPressed: () => Navigator.pop(sheet), child: Text(t('m.done'))),
        ]),
      );
    },
  );
}

/// A till receipt (80 mm roll), as the website prints it.
Future<Uint8List> receiptPdf(List<Map<String, dynamic>> sales, Session s, T t,
    {required String method, num paid = 0, num change = 0, String? customer}) async {
  pw.ThemeData? theme;
  try {
    Future<pw.Font> font(Future<pw.Font> f) => f.timeout(const Duration(seconds: 6));
    theme = pw.ThemeData.withFont(base: await font(PdfGoogleFonts.notoSansRegular()), bold: await font(PdfGoogleFonts.notoSansBold()));
  } catch (_) {}
  final doc = pw.Document(theme: theme, author: s.shop?.name ?? 'Higoverse');
  final total = sales.fold<num>(0, (a, x) => a + _n(x['total_amount']));
  final no = '${sales.first['id'] ?? ''}'.padRight(8).substring(0, 8).trim().toUpperCase();
  final when = parseTimestamp(sales.first['created_at']) ?? DateTime.now();
  final date = '${t.date(when)} ${when.year}, ${when.hour.toString().padLeft(2, '0')}:${when.minute.toString().padLeft(2, '0')}';
  final address = (s.shop?.address ?? '').startsWith('TIN:')
      ? (s.shop!.address.split('|').skip(1).where((x) => x.startsWith('Addr:')).map((x) => x.substring(5)).join(', '))
      : (s.shop?.address ?? '').split('|Lat:').first;
  const grey = PdfColor.fromInt(0xFF555555);
  pw.Widget row(String a, String b, {bool bold = false}) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 2),
        child: pw.Row(children: [
          pw.Expanded(
              child:
                  pw.Text(a, style: pw.TextStyle(fontSize: 8, color: bold ? PdfColors.black : grey, fontWeight: bold ? pw.FontWeight.bold : null))),
          pw.Text(b, style: pw.TextStyle(fontSize: bold ? 10 : 8, fontWeight: bold ? pw.FontWeight.bold : null)),
        ]),
      );
  pw.Widget dash() => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 4),
        child: pw.Divider(height: 1, thickness: 0.5, borderStyle: pw.BorderStyle.dashed, color: grey),
      );
  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.roll80.copyWith(marginLeft: 10, marginRight: 10, marginTop: 10, marginBottom: 10),
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Text((s.shop?.name ?? '').toUpperCase(), textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
      if (address.isNotEmpty) pw.Text(address, textAlign: pw.TextAlign.center, style: const pw.TextStyle(fontSize: 7, color: grey)),
      if ((s.shop?.phone ?? '').isNotEmpty)
        pw.Text(s.shop!.phone, textAlign: pw.TextAlign.center, style: const pw.TextStyle(fontSize: 7, color: grey)),
      if ((s.shop?.tin ?? '').isNotEmpty)
        pw.Text('TIN ${s.shop!.tin}', textAlign: pw.TextAlign.center, style: const pw.TextStyle(fontSize: 7, color: grey)),
      pw.SizedBox(height: 3),
      pw.Text(t('m.receipt').toUpperCase(), textAlign: pw.TextAlign.center, style: const pw.TextStyle(fontSize: 8, color: grey, letterSpacing: 1)),
      dash(),
      row(t('m.receipt_no'), no),
      row(t('sale.time'), date),
      if ((customer ?? '').isNotEmpty) row(t('m.customer'), customer!),
      dash(),
      for (final x in sales)
        pw.Padding(
          padding: const pw.EdgeInsets.only(bottom: 3),
          child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Expanded(
              child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                pw.Text('${x['product_name'] ?? ''}', style: const pw.TextStyle(fontSize: 8)),
                pw.Text('${groupDigits(_n(x['quantity']))} × ${groupDigits(_n(x['unit_price']))}',
                    style: const pw.TextStyle(fontSize: 7, color: grey)),
              ]),
            ),
            pw.Text(groupDigits(_n(x['total_amount'])), style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold)),
          ]),
        ),
      pw.Divider(height: 6, thickness: 0.8),
      row(t('sale.total'), money(total, s.currency), bold: true),
      dash(),
      row(t('sale.payment'), payLabel(t, method)),
      if (method != 'debt' && paid > 0) row(t('sale.paid'), money(paid, s.currency)),
      if (change > 0) row(t('m.change'), money(change, s.currency)),
      if (method == 'debt') row(t('m.on_credit'), money(total, s.currency), bold: true),
      dash(),
      pw.Text(t('m.thank_you'), textAlign: pw.TextAlign.center, style: const pw.TextStyle(fontSize: 8, color: grey)),
      pw.Text('Higoverse', textAlign: pw.TextAlign.center, style: const pw.TextStyle(fontSize: 6, color: grey)),
    ]),
  ));
  return doc.save();
}

/// Changes a sale's quantity, price or notes (the stock follows on the
/// server). True when it was saved.
Future<bool> editSale(BuildContext context, Map<String, dynamic> sale) async {
  final t = T.of(context);
  final s = SessionScope.of(context);
  final qty = TextEditingController(text: '${_n(sale['quantity']).toInt()}');
  final price = TextEditingController(text: amountText(_n(sale['unit_price'])));
  final notes = TextEditingController(text: '${sale['notes'] ?? ''}');
  final key = GlobalKey<FormState>();
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(t('m.edit_sale')),
      content: Form(
        key: key,
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('${sale['product_name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            TextFormField(
              controller: qty,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(labelText: t('sale.quantity')),
              validator: (v) => (int.tryParse((v ?? '').trim()) ?? 0) <= 0 ? t('form.need_quantity') : null,
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: price,
              keyboardType: TextInputType.number,
              inputFormatters: [GroupedDigits()],
              decoration: InputDecoration(labelText: t('sale.unit_price'), suffixText: s.currency),
              validator: (v) => (parseAmount(v ?? '') ?? -1) < 0 ? t('form.need_price') : null,
            ),
            const SizedBox(height: 8),
            TextFormField(controller: notes, decoration: InputDecoration(labelText: t('sale.notes')), maxLines: 2),
          ]),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('app.cancel'))),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: () {
            if (key.currentState!.validate()) Navigator.pop(c, true);
          },
          child: Text(t('form.save')),
        ),
      ],
    ),
  );
  final body = {
    'quantity': int.tryParse(qty.text.trim()) ?? 1,
    'unit_price': parseAmount(price.text) ?? 0,
    'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
  };
  qty.dispose();
  price.dispose();
  notes.dispose();
  if (ok != true || !context.mounted) return false;
  try {
    await s.api.put('${Svc.sales}/sales/${sale['id']}', body);
    if (context.mounted) say(context, t('m.saved'));
    return true;
  } catch (e) {
    if (context.mounted) say(context, errorText(t, e));
    return false;
  }
}

/// Deletes a sale; its items go back into stock. True when deleted.
Future<bool> deleteSale(BuildContext context, Map<String, dynamic> sale) async {
  final t = T.of(context);
  final s = SessionScope.of(context);
  final c = Hgv.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text(t('m.delete_sale_q')),
      content: Text(t('m.delete_sale_body')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d, false), child: Text(t('app.cancel'))),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: c.danger),
          onPressed: () => Navigator.pop(d, true),
          child: Text(t('app.delete')),
        ),
      ],
    ),
  );
  if (ok != true || !context.mounted) return false;
  try {
    await s.api.delete('${Svc.sales}/sales/${sale['id']}');
    if (context.mounted) say(context, t('m.sale_deleted'));
    return true;
  } catch (e) {
    if (context.mounted) say(context, errorText(t, e));
    return false;
  }
}
