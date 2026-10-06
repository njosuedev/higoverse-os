import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:phosphor_icons/phosphor_icons.dart';
import 'package:printing/printing.dart';

import 'config.dart';
import 'format.dart';
import 'forms.dart';
import 'i18n.dart';
import 'live/scoped_route.dart';
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';

// Proforma invoices on the phone, in Sales: the same records as the
// website's Proforma page (sale-service /proforma). A proforma is a quote
// sent before a sale: it changes no stock and no figures. Each one can be
// shared or printed as an A4 PDF straight from the phone.

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
const proformaStatuses = ['draft', 'sent', 'accepted', 'expired'];

Color _statusColor(BuildContext context, String s) {
  final c = Hgv.of(context);
  return switch (s) { 'sent' => c.ink, 'accepted' => c.success, 'expired' => c.faint, _ => c.warning };
}

String _ymd(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _shortDate(T t, String? ymd) {
  final d = DateTime.tryParse(ymd ?? '');
  return d == null ? (ymd ?? '') : '${t.date(d)} ${d.year}';
}

/// The proformas, newest first, with search; tap one to see, share or
/// change it. Shown in the Sales tab.
class ProformaList extends StatefulWidget {
  const ProformaList({super.key});

  @override
  State<ProformaList> createState() => ProformaListState();
}

class ProformaListState extends State<ProformaList> {
  final _q = TextEditingController();
  List<Map<String, dynamic>>? _items;
  Object? _error;
  int _gen = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) reload();
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> reload() async {
    final gen = ++_gen;
    try {
      final res = await SessionScope.of(context).api.get('${Svc.sales}/proforma',
          query: {'page': '1', 'limit': '50', if (_q.text.trim().isNotEmpty) 'search': _q.text.trim()});
      final data = (res as Map)['data'] as Map? ?? {};
      if (!mounted || gen != _gen) return;
      setState(() {
        _items = (data['items'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _error = null;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  Future<void> _open(Map<String, dynamic> p) async {
    final changed = await pushScoped<bool>(context, ProformaScreen(proforma: p));
    if (changed == true) reload();
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final items = _items;
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.only(bottom: 96), children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: SearchField(
            controller: _q,
            hint: t('pf.search'),
            onChanged: (_) => reload(),
          ),
        ),
        if (_error != null && items == null)
          EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: reload)
        else if (items == null)
          const ListSkeleton(count: 6)
        else if (items.isEmpty)
          EmptyState(icon: PhosphorIconsRegular.fileText, message: t('pf.none'))
        else
          for (final p in items)
            ListTile(
              onTap: () => _open(p),
              leading: CircleAvatar(backgroundColor: c.paper, child: Icon(PhosphorIconsRegular.fileText, color: c.ink, size: 20)),
              title: Row(children: [
                Expanded(
                  child: Text('${p['customer'] ?? ''}'.isEmpty ? t('pf.no_customer') : '${p['customer']}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                Text(money(_n(p['grand_total']), '${p['currency'] ?? s.currency}'), style: const TextStyle(fontWeight: FontWeight.w800)),
              ]),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Row(children: [
                  StatusChip(t('pf.status_${p['status'] ?? 'draft'}'), _statusColor(context, '${p['status'] ?? 'draft'}')),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('${p['invoice_no']} · ${t('pf.valid_until_short', {'date': _shortDate(t, p['valid_until'] as String?)})}',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: c.faint)),
                  ),
                ]),
              ),
            ),
      ]),
    );
  }
}

/// One proforma: the document as the customer sees it, Share PDF / Print,
/// status, delete.
class ProformaScreen extends StatefulWidget {
  const ProformaScreen({super.key, required this.proforma});
  final Map<String, dynamic> proforma;

  @override
  State<ProformaScreen> createState() => _ProformaScreenState();
}

class _ProformaScreenState extends State<ProformaScreen> {
  late Map<String, dynamic> _p = widget.proforma;
  bool _changed = false, _busy = false;

  Future<void> _setStatus(String status) async {
    final s = SessionScope.of(context);
    setState(() => _busy = true);
    try {
      final res = await s.api.put('${Svc.sales}/proforma/${_p['id']}', {'status': status});
      final d = (res as Map)['data'];
      if (mounted && d is Map) setState(() => _p = Map<String, dynamic>.from(d));
      _changed = true;
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(T.of(context), e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final t = T.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(t('pf.delete_q')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('app.cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: Hgv.of(context).danger),
            onPressed: () => Navigator.pop(c, true),
            child: Text(t('pf.delete')),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    try {
      await SessionScope.of(context).api.delete('${Svc.sales}/proforma/${_p['id']}');
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(t, e))));
    }
  }

  Future<void> _pdf({required bool print}) async {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final bytes = await proformaPdf(_p, s, t);
    final name = '${_p['invoice_no'] ?? 'proforma'}.pdf';
    if (print) {
      await Printing.layoutPdf(onLayout: (_) async => bytes, name: name);
    } else {
      await Printing.sharePdf(bytes: bytes, filename: name);
    }
    if ('${_p['status']}' == 'draft' && !print) await _setStatus('sent');
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final cur = '${_p['currency'] ?? s.currency}';
    final lines = (_p['lines'] as List? ?? []).whereType<Map>().toList();
    final status = '${_p['status'] ?? 'draft'}';
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.pop(context, _changed);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text('${_p['invoice_no'] ?? ''}'),
          actions: [
            IconButton(tooltip: t('pf.print'), onPressed: () => _pdf(print: true), icon: const Icon(PhosphorIconsRegular.printer)),
            IconButton(tooltip: t('pf.delete'), onPressed: _delete, icon: Icon(PhosphorIconsRegular.trash, color: c.danger)),
          ],
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
            child: FilledButton.icon(
              onPressed: _busy ? null : () => _pdf(print: false),
              icon: const Icon(PhosphorIconsBold.shareNetwork, size: 18),
              label: Text(t('pf.share')),
            ),
          ),
        ),
        body: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 24), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text(t('pf.title_doc'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 0.4))),
                  StatusChip(t('pf.status_$status'), _statusColor(context, status)),
                ]),
                const SizedBox(height: 8),
                InfoRow(t('pf.number'), '${_p['invoice_no'] ?? ''}'),
                InfoRow(t('pf.date'), _shortDate(t, _p['date'] as String?)),
                InfoRow(t('pf.valid_until'), _shortDate(t, _p['valid_until'] as String?)),
                const Divider(height: 22),
                Text(t('pf.customer').toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: c.faint)),
                const SizedBox(height: 4),
                Text('${_p['customer'] ?? ''}'.isEmpty ? t('pf.no_customer') : '${_p['customer']}',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                if ('${_p['customer_phone'] ?? ''}'.isNotEmpty) Text('${_p['customer_phone']}', style: TextStyle(color: c.muted)),
                if ('${_p['customer_address'] ?? ''}'.isNotEmpty) Text('${_p['customer_address']}', style: TextStyle(color: c.muted)),
                const Divider(height: 22),
                for (final l in lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${l['product_name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('${groupDigits(_n(l['qty']))} × ${money(_n(l['unit_price']), cur)}', style: TextStyle(fontSize: 12.5, color: c.faint)),
                        ]),
                      ),
                      Text(money(_n(l['qty']) * _n(l['unit_price']), cur), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ]),
                  ),
                const Divider(height: 22),
                InfoRow(t('pf.subtotal'), money(_n(_p['subtotal']), cur)),
                if (_n(_p['tax_rate']) > 0) InfoRow(t('pf.tax', {'rate': _n(_p['tax_rate'])}), money(_n(_p['tax_amount']), cur)),
                InfoRow(t('pf.total'), money(_n(_p['grand_total']), cur), strong: true),
                if ('${_p['notes'] ?? ''}'.trim().isNotEmpty) ...[
                  const Divider(height: 22),
                  Text('${_p['notes']}', style: TextStyle(color: c.muted)),
                ],
              ]),
            ),
          ),
          SectionTitle(t('pf.status')),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final st in proformaStatuses)
              ChoiceChip(
                label: Text(t('pf.status_$st')),
                selected: status == st,
                showCheckmark: false,
                onSelected: _busy || status == st ? null : (_) => _setStatus(st),
              ),
          ]),
        ]),
      ),
    );
  }
}

/// A new proforma: customer, how long it's valid, lines (from stock or typed),
/// tax at the business's rate, notes. Numbered PRO-… like the website.
class ProformaFormScreen extends StatefulWidget {
  const ProformaFormScreen({super.key});

  @override
  State<ProformaFormScreen> createState() => _ProformaFormScreenState();
}

class _Line {
  _Line({String name = '', num qty = 1, num price = 0})
      : name = TextEditingController(text: name),
        qty = TextEditingController(text: qty == 0 ? '' : '$qty'),
        price = TextEditingController(text: price == 0 ? '' : groupDigits(price));
  final TextEditingController name, qty, price;
  num get total => (num.tryParse(qty.text.trim()) ?? 0) * (parseAmount(price.text) ?? 0);
  void dispose() {
    name.dispose();
    qty.dispose();
    price.dispose();
  }
}

class _ProformaFormScreenState extends State<ProformaFormScreen> {
  final _form = GlobalKey<FormState>();
  final _customer = TextEditingController(), _phone = TextEditingController(), _address = TextEditingController(), _notes = TextEditingController();
  final List<_Line> _lines = [_Line()];
  int _days = 14;
  late num _tax;
  bool _saving = false, _taxSet = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_taxSet) {
      _tax = SessionScope.of(context).taxRate;
      _taxSet = true;
    }
  }

  @override
  void dispose() {
    for (final c in [_customer, _phone, _address, _notes]) {
      c.dispose();
    }
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  num get _subtotal => _lines.fold<num>(0, (a, l) => a + l.total);
  num get _taxAmount => (_subtotal * _tax / 100).roundToDouble();

  Future<void> _pickProduct(int i) async {
    final p = await pushScoped<Map<String, dynamic>>(context, const ProductPickerScreen(allowSoldOut: true));
    if (p == null || !mounted) return;
    setState(() {
      _lines[i].name.text = '${p['name'] ?? ''}';
      if (p['selling_price'] != null) _lines[i].price.text = groupDigits(_n(p['selling_price']));
      if (_lines[i].qty.text.trim().isEmpty) _lines[i].qty.text = '1';
    });
  }

  Future<void> _save() async {
    final t = T.of(context);
    if (!_form.currentState!.validate()) return;
    final lines = [
      for (final l in _lines)
        if (l.name.text.trim().isNotEmpty)
          {'product_name': l.name.text.trim(), 'qty': num.tryParse(l.qty.text.trim()) ?? 1, 'unit_price': parseAmount(l.price.text) ?? 0},
    ];
    if (lines.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('pf.need_line'))));
      return;
    }
    final s = SessionScope.of(context);
    final now = DateTime.now();
    final body = {
      'invoice_no': 'PRO-${now.millisecondsSinceEpoch.toString().substring(7)}',
      'date': _ymd(now),
      'valid_until': _ymd(now.add(Duration(days: _days))),
      'customer': _customer.text.trim(),
      'customer_phone': _phone.text.trim(),
      'customer_address': _address.text.trim(),
      'notes': _notes.text.trim(),
      'lines': lines,
      'subtotal': _subtotal,
      'tax_rate': _tax,
      'tax_amount': _taxAmount,
      'grand_total': _subtotal + _taxAmount,
      'currency': s.currency,
      'status': 'draft',
    };
    setState(() => _saving = true);
    try {
      final res = await s.api.post('${Svc.sales}/proforma', body);
      final d = (res as Map)['data'];
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      Navigator.pop(context, d is Map ? Map<String, dynamic>.from(d) : body);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(t, e))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    InputDecoration dec(String hint) => InputDecoration(hintText: hint, isDense: true);
    return Scaffold(
      appBar: AppBar(title: Text(t('pf.new'))),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: Row(children: [
            Expanded(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t('pf.total'), style: TextStyle(fontSize: 12, color: c.faint, fontWeight: FontWeight.w600)),
                FittedBox(child: Text(money(_subtotal + _taxAmount, s.currency), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900))),
              ]),
            ),
            const SizedBox(width: 12),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(140, 46)),
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                  : Text(t('form.save')),
            ),
          ]),
        ),
      ),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.fromLTRB(14, 8, 14, 24), children: [
          SectionTitle(t('pf.customer')),
          TextFormField(controller: _customer, textCapitalization: TextCapitalization.words, decoration: dec(t('pf.customer_name'))),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextFormField(controller: _phone, keyboardType: TextInputType.phone, decoration: dec(t('form.phone')))),
            const SizedBox(width: 8),
            Expanded(child: TextFormField(controller: _address, decoration: dec(t('pf.address')))),
          ]),
          SectionTitle(t('pf.valid_for')),
          Wrap(spacing: 6, children: [
            for (final d in const [7, 14, 30])
              ChoiceChip(label: Text(t('pf.days', {'n': d})), selected: _days == d, showCheckmark: false, onSelected: (_) => setState(() => _days = d)),
          ]),
          SectionTitle(t('pf.items')),
          for (var i = 0; i < _lines.length; i++)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 4, 8),
                child: Column(children: [
                  Row(children: [
                    Expanded(
                      child: TextFormField(
                        controller: _lines[i].name,
                        decoration: dec(t('pf.item_name')).copyWith(
                          suffixIcon: IconButton(
                            tooltip: t('pf.from_stock'),
                            icon: Icon(PhosphorIconsRegular.package, color: c.ink),
                            onPressed: () => _pickProduct(i),
                          ),
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    if (_lines.length > 1)
                      IconButton(
                        tooltip: t('pf.remove_line'),
                        onPressed: () => setState(() => _lines.removeAt(i).dispose()),
                        icon: Icon(PhosphorIconsRegular.x, color: c.faint),
                      ),
                  ]),
                  const SizedBox(height: 6),
                  Row(children: [
                    SizedBox(
                      width: 80,
                      child: TextFormField(
                        controller: _lines[i].qty,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                        decoration: dec(t('pf.qty')),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextFormField(
                        controller: _lines[i].price,
                        keyboardType: TextInputType.number,
                        decoration: dec(t('sale.unit_price')).copyWith(suffixText: s.currency),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      width: 96,
                      child: Text(money(_lines[i].total, s.currency),
                          textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                    const SizedBox(width: 6),
                  ]),
                ]),
              ),
            ),
          OutlinedButton.icon(
            onPressed: () => setState(() => _lines.add(_Line())),
            icon: const Icon(PhosphorIconsRegular.plus, size: 18),
            label: Text(t('pf.add_line')),
          ),
          SectionTitle(t('pf.tax_rate')),
          Row(children: [
            SizedBox(
              width: 110,
              child: TextFormField(
                initialValue: _tax == 0 ? '' : '$_tax',
                keyboardType: TextInputType.number,
                decoration: dec('0').copyWith(suffixText: '%'),
                onChanged: (v) => setState(() => _tax = num.tryParse(v.trim()) ?? 0),
              ),
            ),
            const Spacer(),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('${t('pf.subtotal')}: ${money(_subtotal, s.currency)}', style: TextStyle(color: c.muted)),
              if (_tax > 0) Text('${t('pf.tax', {'rate': _tax})}: ${money(_taxAmount, s.currency)}', style: TextStyle(color: c.muted)),
            ]),
          ]),
          SectionTitle(t('sale.notes')),
          TextFormField(controller: _notes, minLines: 2, maxLines: 4, decoration: dec(t('pf.notes_hint'))),
        ]),
      ),
    );
  }
}

/// The proforma as an A4 PDF, to share (WhatsApp, email…) or print.
Future<Uint8List> proformaPdf(Map<String, dynamic> p, Session s, T t) async {
  // Noto Sans covers Kinyarwanda, French and Swahili accents (and Chinese
  // when needed); without a connection the PDF's built-in font is used.
  pw.ThemeData? theme;
  try {
    final base = await PdfGoogleFonts.notoSansRegular(), bold = await PdfGoogleFonts.notoSansBold();
    theme = pw.ThemeData.withFont(base: base, bold: bold, fontFallback: [if (t.lang == 'zh') await PdfGoogleFonts.notoSansSCRegular()]);
  } catch (_) {}
  final doc = pw.Document(title: '${p['invoice_no']}', author: s.shop?.name ?? 'Higoverse', theme: theme);
  final cur = '${p['currency'] ?? s.currency}';
  final lines = (p['lines'] as List? ?? []).whereType<Map>().toList();
  final logoBytes = dataUrlBytes(s.shop?.logoUrl);
  final logo = logoBytes != null && logoBytes.isNotEmpty ? pw.MemoryImage(logoBytes) : null;
  const ink = PdfColor.fromInt(0xFF0A66C2);
  const muted = PdfColor.fromInt(0xFF555555);
  pw.Widget kv(String k, String v, {bool strong = false}) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 2),
        child: pw.Row(children: [
          pw.Expanded(child: pw.Text(k, style: const pw.TextStyle(color: muted, fontSize: 10))),
          pw.Text(v, style: pw.TextStyle(fontSize: strong ? 13 : 10, fontWeight: strong ? pw.FontWeight.bold : pw.FontWeight.normal)),
        ]),
      );
  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.fromLTRB(40, 40, 40, 36),
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        if (logo != null) pw.Container(width: 56, height: 56, margin: const pw.EdgeInsets.only(right: 12), child: pw.Image(logo)),
        pw.Expanded(
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text(s.shop?.name ?? '', style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
            for (final x in [s.shop?.address, s.shop?.phone, s.shop?.email])
              if ((x ?? '').isNotEmpty) pw.Text(x!, style: const pw.TextStyle(fontSize: 10, color: muted)),
          ]),
        ),
        pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
          pw.Text(t('pf.title_doc').toUpperCase(), style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold, color: ink)),
          pw.Text('${p['invoice_no']}', style: const pw.TextStyle(fontSize: 11)),
        ]),
      ]),
      pw.SizedBox(height: 18),
      pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Expanded(
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text(t('pf.customer').toUpperCase(), style: pw.TextStyle(fontSize: 9, color: muted, fontWeight: pw.FontWeight.bold)),
            pw.Text('${p['customer'] ?? ''}', style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
            for (final x in [p['customer_phone'], p['customer_address']])
              if ('${x ?? ''}'.isNotEmpty) pw.Text('$x', style: const pw.TextStyle(fontSize: 10, color: muted)),
          ]),
        ),
        pw.SizedBox(
          width: 190,
          child: pw.Column(children: [
            kv(t('pf.date'), '${p['date'] ?? ''}'),
            kv(t('pf.valid_until'), '${p['valid_until'] ?? ''}'),
          ]),
        ),
      ]),
      pw.SizedBox(height: 16),
      pw.TableHelper.fromTextArray(
        headers: [t('pf.item_name'), t('pf.qty'), t('sale.unit_price'), t('pf.amount')],
        data: [
          for (final l in lines)
            ['${l['product_name'] ?? ''}', groupDigits(_n(l['qty'])), money(_n(l['unit_price']), cur), money(_n(l['qty']) * _n(l['unit_price']), cur)],
        ],
        headerStyle: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
        headerDecoration: const pw.BoxDecoration(color: ink),
        cellStyle: const pw.TextStyle(fontSize: 10),
        cellAlignments: {0: pw.Alignment.centerLeft, 1: pw.Alignment.centerRight, 2: pw.Alignment.centerRight, 3: pw.Alignment.centerRight},
        headerAlignments: {0: pw.Alignment.centerLeft, 1: pw.Alignment.centerRight, 2: pw.Alignment.centerRight, 3: pw.Alignment.centerRight},
        border: const pw.TableBorder(horizontalInside: pw.BorderSide(color: PdfColors.grey300, width: 0.5)),
        cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 5),
      ),
      pw.SizedBox(height: 10),
      pw.Align(
        alignment: pw.Alignment.centerRight,
        child: pw.SizedBox(
          width: 220,
          child: pw.Column(children: [
            kv(t('pf.subtotal'), money(_n(p['subtotal']), cur)),
            if (_n(p['tax_rate']) > 0) kv(t('pf.tax', {'rate': _n(p['tax_rate'])}), money(_n(p['tax_amount']), cur)),
            pw.Divider(color: PdfColors.grey400),
            kv(t('pf.total'), money(_n(p['grand_total']), cur), strong: true),
          ]),
        ),
      ),
      if ('${p['notes'] ?? ''}'.trim().isNotEmpty) ...[
        pw.SizedBox(height: 14),
        pw.Text('${p['notes']}', style: const pw.TextStyle(fontSize: 10, color: muted)),
      ],
      pw.Spacer(),
      pw.Divider(color: PdfColors.grey300),
      pw.Text(t('pf.footer', {'date': '${p['valid_until'] ?? ''}'}), style: const pw.TextStyle(fontSize: 9, color: muted)),
    ]),
  ));
  return doc.save();
}
