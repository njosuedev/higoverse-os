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
// website's Sales → Proforma tab (sale-service /proforma). A proforma lists
// the vehicles and the customer's details; it changes no stock. The owner or
// a manager approves it, and once the customer decides to buy, "Customer
// buys" records the sales (stock goes down). Each one can be shared or
// printed as an A4 PDF straight from the phone.

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;

/// Roles that may approve a proforma (APPROVER_ROLES in sale-service).
const proformaApprovers = {'owner', 'admin', 'manager'};

/// draft → approved → sold; expired once the validity date has passed.
/// "sent" and "accepted" are older statuses (draft and approved).
String proformaStage(Map p) {
  final st = '${p['status'] ?? 'draft'}';
  final stage = switch (st) { 'accepted' || 'approved' => 'approved', 'sold' => 'sold', 'expired' => 'expired', _ => 'draft' };
  final until = '${p['valid_until'] ?? ''}';
  if (stage != 'sold' && until.isNotEmpty && until.compareTo(_ymd(DateTime.now())) < 0) return 'expired';
  return stage;
}

Color _statusColor(BuildContext context, String s) {
  final c = Hgv.of(context);
  return switch (s) { 'approved' => c.ink, 'sold' => c.success, 'expired' => c.faint, _ => c.warning };
}

/// "Neta V · RAJ402D, …" — what the proforma is for.
String _what(Map p) => (p['lines'] as List? ?? [])
    .whereType<Map>()
    .map((l) => ['${l['product_name'] ?? ''}', '${l['plate_no'] ?? ''}'].where((x) => x.isNotEmpty).join(' · '))
    .join(', ');

/// Form checks: each returns the i18n key of the problem, or null.
String? pfRequired(String? v) => (v ?? '').trim().isEmpty ? 'pf.err_required' : null;

/// 07XXXXXXXX in Rwanda, or an international number (+250…).
String? pfPhone(String? v, {bool required = false}) {
  final x = (v ?? '').trim();
  if (x.isEmpty) return required ? 'pf.err_required' : null;
  final d = x.replaceAll(RegExp(r'\D'), '');
  if (!RegExp(r'^\+?[\d\s-]+$').hasMatch(x) || d.length < 9 || d.length > 15) return 'pf.err_phone';
  if (x.startsWith('0') && !RegExp(r'^07\d{8}$').hasMatch(d)) return 'pf.err_phone';
  return null;
}

/// 16-digit national ID, or a passport number (6–12 letters/digits).
String? pfIdNo(String? v, {bool required = false}) {
  final x = (v ?? '').replaceAll(' ', '');
  if (x.isEmpty) return required ? 'pf.err_required' : null;
  return RegExp(r'^(\d{16}|[A-Za-z0-9]{6,12})$').hasMatch(x) ? null : 'pf.err_id';
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
                  StatusChip(t('pf.status_${proformaStage(p)}'), _statusColor(context, proformaStage(p))),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text([if (_what(p).isNotEmpty) _what(p), '${p['invoice_no']}', t('pf.valid_until_short', {'date': _shortDate(t, p['valid_until'] as String?)})].join(' · '),
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
/// approve (owner or manager), "Customer buys" once approved, delete.
class ProformaScreen extends StatefulWidget {
  const ProformaScreen({super.key, required this.proforma});
  final Map<String, dynamic> proforma;

  @override
  State<ProformaScreen> createState() => _ProformaScreenState();
}

class _ProformaScreenState extends State<ProformaScreen> {
  late Map<String, dynamic> _p = widget.proforma;
  bool _changed = false, _busy = false;

  /// Runs a request that returns the updated proforma.
  Future<void> _run(Future<dynamic> Function(Session s) call, {String? done}) async {
    final s = SessionScope.of(context);
    final t = T.of(context);
    setState(() => _busy = true);
    try {
      final res = await call(s);
      final d = (res as Map)['data'];
      if (mounted && d is Map) setState(() => _p = Map<String, dynamic>.from(d));
      _changed = true;
      if (mounted && done != null) {
        HapticFeedback.mediumImpact();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t(done))));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(t, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approve() => _run((s) => s.api.post('${Svc.sales}/proforma/${_p['id']}/approve', null), done: 'pf.approved_ok');

  Future<void> _sell() async {
    final body = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _SellSheet(proforma: _p),
    );
    if (body == null || !mounted) return;
    await _run((s) => s.api.post('${Svc.sales}/proforma/${_p['id']}/sell', body), done: 'pf.sold_ok');
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
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final cur = '${_p['currency'] ?? s.currency}';
    final lines = (_p['lines'] as List? ?? []).whereType<Map>().toList();
    final stage = proformaStage(_p);
    final approved = const {'approved', 'accepted'}.contains('${_p['status']}');
    final canApprove = proformaApprovers.contains(s.user?.role);
    String v(String k) => '${_p[k] ?? ''}'.trim();
    final deposit = _n(_p['deposit_amount']);
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
            if (stage != 'sold')
              IconButton(tooltip: t('pf.delete'), onPressed: _delete, icon: Icon(PhosphorIconsRegular.trash, color: c.danger)),
          ],
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
            child: Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _pdf(print: false),
                  icon: const Icon(PhosphorIconsBold.shareNetwork, size: 18),
                  label: Text(t('pf.share')),
                ),
              ),
              if (stage == 'draft' && canApprove) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _approve,
                    icon: const Icon(PhosphorIconsBold.checkCircle, size: 18),
                    label: Text(t('pf.approve')),
                  ),
                ),
              ],
              if (approved) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: c.success),
                    onPressed: _busy ? null : _sell,
                    icon: const Icon(PhosphorIconsBold.shoppingBag, size: 18),
                    label: Text(t('pf.sell')),
                  ),
                ),
              ],
            ]),
          ),
        ),
        body: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 24), children: [
          _Steps(stage: stage),
          if (stage == 'draft' && !canApprove)
            Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 8), child: Text(t('pf.wait_approval'), style: TextStyle(fontSize: 12.5, color: c.muted))),
          if (v('approved_by').isNotEmpty && stage != 'draft')
            Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 8), child: Text(t('pf.approved_by', {'name': v('approved_by')}), style: TextStyle(fontSize: 12.5, color: c.muted))),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text(t('pf.title_doc'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 0.4))),
                  StatusChip(t('pf.status_$stage'), _statusColor(context, stage)),
                ]),
                const SizedBox(height: 8),
                InfoRow(t('pf.number'), '${_p['invoice_no'] ?? ''}'),
                InfoRow(t('pf.date'), _shortDate(t, _p['date'] as String?)),
                InfoRow(t('pf.valid_until'), _shortDate(t, _p['valid_until'] as String?)),
                if (v('salesperson').isNotEmpty) InfoRow(t('pf.salesperson'), v('salesperson')),
                const Divider(height: 22),
                Text(t('pf.customer').toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: c.faint)),
                const SizedBox(height: 4),
                Text(v('customer').isEmpty ? t('pf.no_customer') : v('customer'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                for (final (k, label) in [
                  ('customer_id_no', 'pf.id_no'), ('customer_phone', 'form.phone'), ('customer_address', 'pf.address'),
                  ('customer_tin', 'pf.tin'), ('customer_email', 'pf.email'), ('customer_country', 'pf.country'), ('customer_company', 'pf.company'),
                ])
                  if (v(k).isNotEmpty) InfoRow(t(label), v(k)),
                const Divider(height: 22),
                for (final l in lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${l['product_name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          if (_vehicleLine(l).isNotEmpty) Text(_vehicleLine(l), style: TextStyle(fontSize: 12.5, color: c.muted)),
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
                if (deposit > 0) ...[
                  InfoRow(t('pf.deposit'), money(deposit, cur)),
                  InfoRow(t('pf.balance_due'), money(_n(_p['grand_total']) - deposit, cur), strong: true),
                ],
                if (v('payment_method').isNotEmpty) InfoRow(t('pf.payment_method'), v('payment_method')),
                if (v('bank_details').isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(v('bank_details'), style: TextStyle(color: c.muted, fontSize: 12.5)),
                ],
                if (v('notes').isNotEmpty) ...[
                  const Divider(height: 22),
                  Text(v('notes'), style: TextStyle(color: c.muted)),
                ],
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

/// "SUV · 2020 · WHITE · Plate RAJ402D" under a vehicle on the proforma.
String _vehicleLine(Map l) => [
      for (final k in ['car_type', 'year', 'color', 'energy', 'condition'])
        if ('${l[k] ?? ''}'.trim().isNotEmpty) '${l[k]}',
      if ('${l['plate_no'] ?? ''}'.isNotEmpty) '${l['plate_no']}',
      if ('${l['chassis_no'] ?? ''}'.isNotEmpty) '${l['chassis_no']}',
    ].join(' · ');

/// 1. Draft → 2. Approved → 3. Sold
class _Steps extends StatelessWidget {
  const _Steps({required this.stage});
  final String stage;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    const order = ['draft', 'approved', 'sold'];
    final at = stage == 'expired' ? 1 : order.indexOf(stage);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 2, 4, 10),
      child: Row(children: [
        for (var i = 0; i < order.length; i++) ...[
          Text('${i + 1}. ${t('pf.status_${order[i]}')}',
              style: TextStyle(fontSize: 12.5, fontWeight: i <= at ? FontWeight.w800 : FontWeight.w500, color: i <= at ? _statusColor(context, order[i]) : c.faint)),
          if (i < order.length - 1) Padding(padding: const EdgeInsets.symmetric(horizontal: 6), child: Icon(PhosphorIconsRegular.arrowRight, size: 14, color: c.faint)),
        ],
      ]),
    );
  }
}

/// The customer decided to buy: who, how they pay, how much now.
class _SellSheet extends StatefulWidget {
  const _SellSheet({required this.proforma});
  final Map<String, dynamic> proforma;

  @override
  State<_SellSheet> createState() => _SellSheetState();
}

class _SellSheetState extends State<_SellSheet> {
  List<Map<String, dynamic>>? _customers;
  String? _customerId;
  String _method = 'bank';
  late final _paid = TextEditingController(text: groupDigits(_n(widget.proforma['grand_total'])));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_customers != null) return;
    _customers = const [];
    final want = '${widget.proforma['customer_id'] ?? ''}';
    loadCustomers(SessionScope.of(context)).then((list) {
      if (!mounted) return;
      setState(() {
        _customers = list..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
        if (list.any((c) => c['id'] == want)) _customerId = want;
      });
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _paid.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final p = widget.proforma;
    final cur = '${p['currency'] ?? s.currency}';
    final total = _n(p['grand_total']);
    final owed = total - (parseAmount(_paid.text) ?? 0);
    final typed = (p['lines'] as List? ?? []).whereType<Map>().where((l) => '${l['product_id'] ?? ''}'.isEmpty).toList();
    final needCustomer = s.isCar && _customerId == null;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(t('pf.sell_title'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
        Text('${p['invoice_no']} · ${money(total, cur)}', style: TextStyle(color: c.muted)),
        if (typed.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text('${t('pf.typed_cant_sell')} ${typed.map((l) => l['product_name']).join(', ')}', style: TextStyle(color: c.danger)),
          ),
        SectionTitle(t('pf.buyer')),
        DropdownButtonFormField<String>(
          initialValue: _customerId,
          isExpanded: true,
          hint: Text(t(s.isCar ? 'pf.pick_buyer' : 'pf.no_saved_customer')),
          items: [
            for (final cu in _customers ?? const <Map<String, dynamic>>[])
              DropdownMenuItem(value: '${cu['id']}', child: Text('${cu['name']}${'${cu['phone'] ?? ''}'.isEmpty ? '' : ' · ${cu['phone']}'}', overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (x) => setState(() => _customerId = x),
        ),
        SectionTitle(t('sale.payment')),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final m in const ['cash', 'mtn', 'airtel', 'bank', 'card', 'debt'])
            ChoiceChip(
              label: Text(t('pm.$m')),
              selected: _method == m,
              showCheckmark: false,
              onSelected: (_) => setState(() {
                _method = m;
                if (m == 'debt') _paid.text = '0';
              }),
            ),
        ]),
        SectionTitle(t('sale.paid')),
        TextField(
          controller: _paid,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(isDense: true, suffixText: cur),
          onChanged: (_) => setState(() {}),
        ),
        if (owed > 0)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text(t('pf.rest_as_debt', {'amount': money(owed, cur)}), style: TextStyle(color: c.warning, fontSize: 12.5))),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: c.success, minimumSize: const Size.fromHeight(48)),
          onPressed: typed.isNotEmpty || needCustomer
              ? null
              : () => Navigator.pop(context, {
                    'payment_method': _method,
                    'amount_paid': parseAmount(_paid.text) ?? 0,
                    if (_customerId != null) 'customer_id': _customerId,
                  }),
          child: Text(t('pf.confirm_sale')),
        ),
      ]),
    );
  }
}

/// A new proforma: customer, how long it's valid, vehicles / lines (from
/// stock or typed), tax at the business's rate, notes. Numbered PRO-… like
/// the website; payment terms carry over from the business's last proforma.
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
  /// Set when picked from stock (only those can become a sale), with the
  /// vehicle's details for the proforma.
  String? productId;
  Map<String, String> vehicle = const {};
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
  final _idNo = TextEditingController();
  final List<_Line> _lines = [_Line()];
  late int _days;
  late num _tax;
  bool _saving = false, _taxSet = false;
  String? _customerId;
  /// Payment method, bank account and terms from the last proforma.
  Map<String, dynamic> _carry = const {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_taxSet) {
      final s = SessionScope.of(context);
      // Car prices are quoted with taxes included.
      _tax = s.isCar ? 0 : s.taxRate;
      _days = s.isCar ? 5 : 14;
      _taxSet = true;
      s.api.get('${Svc.sales}/proforma', query: {'page': '1', 'limit': '1'}).then((res) {
        final items = ((res as Map)['data'] as Map?)?['items'] as List? ?? const [];
        if (items.isNotEmpty && items.first is Map && mounted) _carry = Map<String, dynamic>.from(items.first as Map);
      }).catchError((_) {});
    }
  }

  Future<void> _pickCustomer() async {
    final list = await loadCustomers(SessionScope.of(context));
    if (!mounted) return;
    final c = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      builder: (_) => ListView(shrinkWrap: true, children: [
        for (final cu in list..sort((a, b) => '${a['name']}'.compareTo('${b['name']}')))
          ListTile(title: Text('${cu['name']}'), subtitle: Text('${cu['phone'] ?? ''}'), onTap: () => Navigator.pop(context, cu)),
      ]),
    );
    if (c == null) return;
    setState(() {
      _customerId = '${c['id']}';
      _customer.text = '${c['name'] ?? ''}';
      _phone.text = '${c['phone'] ?? ''}';
      _address.text = '${c['address'] ?? ''}';
      _idNo.text = '${c['id_number'] ?? ''}';
    });
  }

  @override
  void dispose() {
    for (final c in [_customer, _phone, _address, _notes, _idNo]) {
      c.dispose();
    }
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  String? _err(T t, String? key) => key == null ? null : t(key);

  num get _subtotal => _lines.fold<num>(0, (a, l) => a + l.total);
  num get _taxAmount => (_subtotal * _tax / 100).roundToDouble();

  Future<void> _pickProduct(int i) async {
    final p = await pushScoped<Map<String, dynamic>>(context, const ProductPickerScreen(allowSoldOut: true));
    if (p == null || !mounted) return;
    if (_lines.indexed.any((e) => e.$1 != i && e.$2.productId == '${p['id']}')) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(T.of(context)('pf.err_same_car'))));
      return;
    }
    final a = attributesOf(p['attributes']);
    setState(() {
      _lines[i].productId = '${p['id']}';
      _lines[i].vehicle = {
        for (final k in ['car_type', 'year', 'color', 'chassis_no', 'plate_no'])
          if ((a[k] ?? '').isNotEmpty) k: a[k]!,
        if ((a['battery_range'] ?? '').isNotEmpty) 'energy': 'Full electric',
      };
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
          {
            'product_name': l.name.text.trim(),
            'qty': num.tryParse(l.qty.text.trim()) ?? 1,
            'unit_price': parseAmount(l.price.text) ?? 0,
            if (l.productId != null) 'product_id': l.productId,
            ...l.vehicle,
          },
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
      'salesperson': '${_carry['salesperson'] ?? s.user?.name ?? ''}',
      if (_customerId != null) 'customer_id': _customerId,
      'customer': _customer.text.trim(),
      'customer_id_no': _idNo.text.trim(),
      'customer_country': '${_carry['customer_country'] ?? ''}',
      'payment_method': '${_carry['payment_method'] ?? ''}',
      'bank_details': '${_carry['bank_details'] ?? ''}',
      'terms': '${_carry['terms'] ?? t('pf.default_terms')}',
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
          SectionTitle(t('pf.customer'),
              trailing: TextButton.icon(onPressed: _pickCustomer, icon: const Icon(PhosphorIconsRegular.users, size: 16), label: Text(t('pf.saved_customer')))),
          TextFormField(
            controller: _customer,
            textCapitalization: TextCapitalization.words,
            decoration: dec(t('pf.customer_name')),
            validator: (v) => (v ?? '').trim().length < 2 ? t('pf.err_required') : null,
            onChanged: (_) => _customerId = null,
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _idNo,
            decoration: dec(t('pf.id_no')),
            validator: (v) => _err(t, pfIdNo(v, required: s.isCar)),
          ),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: dec(t('form.phone')),
                validator: (v) => _err(t, pfPhone(v, required: s.isCar)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextFormField(
                controller: _address,
                decoration: dec(t('pf.address')),
                validator: (v) => s.isCar ? _err(t, pfRequired(v)) : null,
              ),
            ),
          ]),
          SectionTitle(t('pf.valid_for')),
          Wrap(spacing: 6, children: [
            for (final d in const [5, 7, 14, 30])
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
                        // A typed name is no longer the vehicle picked from stock.
                        onChanged: (_) => setState(() {
                          _lines[i].productId = null;
                          _lines[i].vehicle = const {};
                        }),
                      ),
                    ),
                    if (_lines.length > 1)
                      IconButton(
                        tooltip: t('pf.remove_line'),
                        onPressed: () => setState(() => _lines.removeAt(i).dispose()),
                        icon: Icon(PhosphorIconsRegular.x, color: c.faint),
                      ),
                  ]),
                  if (_lines[i].vehicle.isNotEmpty)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(_vehicleLine(_lines[i].vehicle), style: TextStyle(fontSize: 12.5, color: c.muted)),
                      ),
                    ),
                  const SizedBox(height: 6),
                  Row(children: [
                    SizedBox(
                      width: 80,
                      child: TextFormField(
                        controller: _lines[i].qty,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                        decoration: dec(t('pf.qty')),
                        validator: (v) => _lines[i].name.text.trim().isEmpty || (int.tryParse((v ?? '').trim()) ?? 0) >= 1 ? null : t('pf.err_qty'),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextFormField(
                        controller: _lines[i].price,
                        keyboardType: TextInputType.number,
                        decoration: dec(t('sale.unit_price')).copyWith(suffixText: s.currency),
                        validator: (v) => _lines[i].name.text.trim().isEmpty || (parseAmount(v ?? '') ?? 0) > 0 ? null : t('pf.err_price'),
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

/// The proforma as an A4 PDF, to share (WhatsApp, email…) or print. Laid out
/// like a car dealer's proforma: customer information, vehicle details,
/// payment terms, terms & conditions and signatures.
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
  const navy = PdfColor.fromInt(0xFF1F3A68);
  const muted = PdfColor.fromInt(0xFF555555);
  const grey = PdfColor.fromInt(0xFFF3F3F3);
  const line = PdfColor.fromInt(0xFFD4D4D4);
  String v(Object? x) => '${x ?? ''}'.trim();
  String na(Object? x) => v(x).isEmpty ? 'N/A' : v(x);
  String dot(Object? d) => v(d).replaceAll('-', '.');
  final address = s.shop?.address ?? '';
  final tin = address.startsWith('TIN:') ? address.substring(4).split('|').first : '';
  final publicAddress = address.startsWith('TIN:')
      ? address.split('|').skip(1).where((x) => x.startsWith('Addr:')).map((x) => x.substring(5)).join(', ')
      : address.split('|Lat:').first;

  pw.Widget h2(String text) => pw.Container(
        margin: const pw.EdgeInsets.only(top: 16, bottom: 8),
        padding: const pw.EdgeInsets.only(left: 8, bottom: 4),
        decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: navy, width: 0.8))),
        child: pw.Text(text.toUpperCase(), style: pw.TextStyle(fontSize: 11.5, color: navy, fontWeight: pw.FontWeight.bold)),
      );
  pw.Widget cell(String text, {bool head = false, bool bold = false}) => pw.Container(
        color: head ? grey : null,
        padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 5),
        child: pw.Text(text, style: pw.TextStyle(fontSize: 9.5, color: head ? muted : PdfColors.black, fontWeight: head || bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
      );
  // Two label/value pairs per row, like the dealer's form.
  pw.Widget grid(List<(String, String, bool)> pairs) => pw.Table(
        border: pw.TableBorder.all(color: line, width: 0.6),
        columnWidths: const {0: pw.FlexColumnWidth(1.2), 1: pw.FlexColumnWidth(2), 2: pw.FlexColumnWidth(1.2), 3: pw.FlexColumnWidth(2)},
        children: [
          for (var i = 0; i < pairs.length; i += 2)
            pw.TableRow(children: [
              cell(pairs[i].$1, head: true), cell(pairs[i].$2, bold: pairs[i].$3),
              if (i + 1 < pairs.length) ...[cell(pairs[i + 1].$1, head: true), cell(pairs[i + 1].$2, bold: pairs[i + 1].$3)] else ...[pw.SizedBox(), pw.SizedBox()],
            ]),
        ],
      );

  final total = _n(p['grand_total']);
  final deposit = _n(p['deposit_amount']);
  final terms = v(p['terms']).split('\n').map((x) => x.trim()).where((x) => x.isNotEmpty).toList();
  final approved = const {'approved', 'accepted', 'sold'}.contains(v(p['status']));

  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.fromLTRB(36, 32, 36, 32),
    footer: (ctx) => pw.Container(
      padding: const pw.EdgeInsets.only(top: 4),
      decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: navy, width: 0.6))),
      child: pw.Row(children: [
        pw.Expanded(child: pw.Text('${s.shop?.name ?? ''} — ${t('pf.title_doc')}   ${t('pf.not_tax_invoice')}', style: const pw.TextStyle(fontSize: 8, color: muted))),
        pw.Text('${ctx.pageNumber}/${ctx.pagesCount}', style: const pw.TextStyle(fontSize: 8, color: muted)),
      ]),
    ),
    build: (_) => [
      pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
        if (logo != null) pw.Container(width: 72, height: 72, margin: const pw.EdgeInsets.only(right: 14), child: pw.Image(logo)),
        pw.Expanded(
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text((s.shop?.name ?? '').toUpperCase(), style: const pw.TextStyle(fontSize: 13)),
            if (tin.isNotEmpty) pw.Text('TIN: $tin', style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
            if ((s.shop?.phone ?? '').isNotEmpty) pw.Text('Tel: ${s.shop!.phone}', style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
            if ((s.shop?.email ?? '').isNotEmpty) pw.Text('EMAIL: ${s.shop!.email}', style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
            if (publicAddress.isNotEmpty) pw.Text(publicAddress.toUpperCase(), style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
          ]),
        ),
        pw.Column(children: [
          pw.Text(t('pf.title_doc').toUpperCase(), textAlign: pw.TextAlign.center, style: const pw.TextStyle(fontSize: 17)),
          pw.Text(t('pf.non_binding'), style: const pw.TextStyle(fontSize: 8.5, color: muted)),
          if (approved)
            pw.Container(
              margin: const pw.EdgeInsets.only(top: 4),
              padding: const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: pw.BoxDecoration(border: pw.Border.all(color: navy, width: 0.6), borderRadius: pw.BorderRadius.circular(3)),
              child: pw.Text('${t('pf.status_approved')}${v(p['approved_by']).isEmpty ? '' : ' · ${v(p['approved_by'])}'}', style: const pw.TextStyle(fontSize: 8, color: navy)),
            ),
        ]),
      ]),
      pw.SizedBox(height: 14),
      grid([
        (t('pf.number'), v(p['invoice_no']), false), (t('pf.date'), dot(p['date']), false),
        (t('pf.valid_until'), dot(p['valid_until']), false), (t('pf.salesperson'), v(p['salesperson']).isEmpty ? (s.shop?.name ?? '') : v(p['salesperson']), false),
      ]),
      h2(t('pf.customer_info')),
      grid([
        (t('pf.full_name'), v(p['customer']), true), (t('pf.id_no'), na(p['customer_id_no']), false),
        (t('pf.tin'), na(p['customer_tin']), false), (t('form.phone'), na(p['customer_phone']), false),
        (t('pf.address'), na(p['customer_address']), false), (t('pf.email'), na(p['customer_email']), false),
        (t('pf.country'), na(p['customer_country']), false), (t('pf.company'), na(p['customer_company']), false),
      ]),
      h2(t(s.isCar ? 'pf.vehicle_details' : 'pf.items')),
      if (s.isCar)
        for (final (i, l) in lines.indexed) ...[
          if (lines.length > 1) pw.Padding(padding: const pw.EdgeInsets.only(top: 4, bottom: 4), child: pw.Text('${t('pf.vehicle')} ${i + 1}', style: pw.TextStyle(color: navy, fontWeight: pw.FontWeight.bold, fontSize: 10))),
          grid([
            (t('pf.brand'), v(l['product_name']), true), (t('pf.genre'), v(l['car_type']), false),
            (t('pf.year'), v(l['year']), false), (t('pf.energy'), v(l['energy']), false),
            (t('pf.colour'), v(l['color']), false), (t('pf.condition'), v(l['condition']).isEmpty ? '' : t('pf.condition_${v(l['condition'])}'), false),
            (t('pf.mileage'), v(l['mileage']), false), (t('pf.qty'), groupDigits(_n(l['qty'])), false),
            (t('pf.chassis'), v(l['chassis_no']), false), (t('pf.plate'), v(l['plate_no']), false),
            (t('sale.unit_price'), money(_n(l['unit_price']), cur), false), (t('pf.total_price'), money(_n(l['qty']) * _n(l['unit_price']), cur), true),
          ]),
        ]
      else ...[
        pw.TableHelper.fromTextArray(
          headers: [t('pf.item_name'), t('pf.qty'), t('sale.unit_price'), t('pf.amount')],
          data: [
            for (final l in lines)
              ['${l['product_name'] ?? ''}', groupDigits(_n(l['qty'])), money(_n(l['unit_price']), cur), money(_n(l['qty']) * _n(l['unit_price']), cur)],
          ],
          headerStyle: pw.TextStyle(fontSize: 9.5, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
          headerDecoration: const pw.BoxDecoration(color: navy),
          cellStyle: const pw.TextStyle(fontSize: 9.5),
          cellAlignments: {0: pw.Alignment.centerLeft, 1: pw.Alignment.centerRight, 2: pw.Alignment.centerRight, 3: pw.Alignment.centerRight},
          headerAlignments: {0: pw.Alignment.centerLeft, 1: pw.Alignment.centerRight, 2: pw.Alignment.centerRight, 3: pw.Alignment.centerRight},
          border: const pw.TableBorder(horizontalInside: pw.BorderSide(color: PdfColors.grey300, width: 0.5)),
          cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 5),
        ),
        pw.SizedBox(height: 6),
        pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Text(
            [
              '${t('pf.subtotal')}: ${money(_n(p['subtotal']), cur)}',
              if (_n(p['tax_rate']) > 0) '${t('pf.tax', {'rate': _n(p['tax_rate'])})}: ${money(_n(p['tax_amount']), cur)}',
              '${t('pf.total')}: ${money(total, cur)}',
            ].join('\n'),
            textAlign: pw.TextAlign.right,
            style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold),
          ),
        ),
      ],
      h2(t('pf.payment_terms')),
      grid([
        (t('pf.payment_method'), v(p['payment_method']), false), (t('pf.currency'), cur, false),
        (t('pf.deposit'), groupDigits(deposit), false), (t('pf.balance_due'), groupDigits(total - deposit), true),
        if (v(p['bank_details']).isNotEmpty) (t('pf.bank_details'), v(p['bank_details']), false),
      ]),
      if (terms.isNotEmpty) ...[
        h2(t('pf.terms')),
        pw.Container(
          padding: const pw.EdgeInsets.all(8),
          decoration: pw.BoxDecoration(color: grey, border: pw.Border.all(color: line, width: 0.6)),
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            for (final x in terms) pw.Padding(padding: const pw.EdgeInsets.symmetric(vertical: 1.5), child: pw.Text(x, style: const pw.TextStyle(fontSize: 8.8))),
          ]),
        ),
      ],
      if (v(p['notes']).isNotEmpty) pw.Padding(padding: const pw.EdgeInsets.only(top: 8), child: pw.Text(v(p['notes']), style: const pw.TextStyle(fontSize: 9.5, color: muted))),
      h2(t('pf.signatures')),
      pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        for (final who in [t('pf.sig_customer'), t('pf.sig_dealer')])
          pw.Expanded(
            child: pw.Padding(
              padding: const pw.EdgeInsets.only(right: 24),
              child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                pw.Text(who.toUpperCase(), style: pw.TextStyle(fontSize: 10, color: navy, fontWeight: pw.FontWeight.bold)),
                pw.SizedBox(height: 30),
                pw.Divider(color: PdfColors.grey700, height: 1),
                pw.Text(t('pf.signature'), style: const pw.TextStyle(fontSize: 8.5, color: muted)),
                pw.SizedBox(height: 22),
                pw.Divider(color: PdfColors.grey700, height: 1),
                pw.Text(t('pf.name_date'), style: const pw.TextStyle(fontSize: 8.5, color: muted)),
              ]),
            ),
          ),
      ]),
      pw.SizedBox(height: 16),
      pw.Center(child: pw.Text(t('pf.thanks', {'shop': s.shop?.name ?? ''}), style: pw.TextStyle(fontSize: 9.5, color: muted))),
    ],
  ));
  return doc.save();
}
