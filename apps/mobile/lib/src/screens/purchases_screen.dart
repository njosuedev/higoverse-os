import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config.dart';
import '../format.dart';
import '../forms.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'partners_screen.dart';

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;

void openPurchases(BuildContext context) => pushScoped<void>(context, const PurchasesScreen());

/// Stock bought from suppliers (the website's Purchases page, for shops):
/// what is in stock and what it is worth, and every purchase recorded —
/// restocking an item or bringing in a new one adds it to the stock.
class PurchasesScreen extends StatefulWidget {
  const PurchasesScreen({super.key});

  @override
  State<PurchasesScreen> createState() => _PurchasesScreenState();
}

class _PurchasesScreenState extends State<PurchasesScreen> with LiveListener {
  /// History (true) or what is in stock (false).
  bool _history = true;

  /// 0: this month; otherwise the last 7 or 90 days.
  int _days = 0;
  List<Map<String, dynamic>>? _purchases;
  int _total = 0;
  List<Map<String, dynamic>>? _products;
  Map<String, Partner> _suppliers = const {};
  String _stockFilter = 'all';
  final _q = TextEditingController();
  Object? _error;
  int _gen = 0;
  final _debounce = Debouncer(const Duration(milliseconds: 700));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) _load();
  }

  @override
  void dispose() {
    _q.dispose();
    _debounce.dispose();
    super.dispose();
  }

  @override
  void onLive(LiveEvent e) {
    if (e.topic == 'purchase' || e.topic == 'product' || e.isResync) _debounce(() => _load(quiet: true));
  }

  ({String from, String to}) get _range {
    if (_days > 0) return lastDays(_days);
    final now = DateTime.now();
    return (from: ymd(DateTime(now.year, now.month, 1)), to: ymd(now));
  }

  Future<void> _load({bool quiet = false}) async {
    final gen = ++_gen;
    final s = SessionScope.of(context);
    if (!quiet) {
      setState(() {
        _purchases = null;
        _error = null;
      });
    }
    final range = _range;
    try {
      final r = await Future.wait([
        s.api.get('${Svc.purchases}/purchases', query: {'page': '1', 'limit': '200', 'from_date': range.from, 'to_date': range.to}),
        s.api.get('${Svc.products}/products', query: {'page': '1', 'limit': '500'}),
        loadSuppliers(s).catchError((_) => <Partner>[]),
      ]);
      if (!mounted || gen != _gen) return;
      final pd = (r[0] as Map?)?['data'] as Map? ?? {};
      final prod = (r[1] as Map?)?['data'] as Map? ?? {};
      setState(() {
        _purchases = (pd['items'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _total = (pd['total'] as num? ?? 0).toInt();
        _products = (prod['items'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _suppliers = {for (final p in r[2] as List<Partner>) p.id: p};
        _error = null;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  Future<void> _record({Map<String, dynamic>? product}) async {
    if (await recordPurchase(context, product: product) != null) _load(quiet: true);
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t('nav.purchases'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _record,
        icon: const Icon(Icons.add),
        label: Text(t('purchases.add')),
      ),
      body: Column(children: [
        Container(
          color: c.chrome,
          padding: const EdgeInsets.fromLTRB(10, 2, 10, 8),
          child: Column(children: [
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: true, icon: const Icon(Icons.history), label: Text(t('purchases.history'))),
                ButtonSegment(value: false, icon: const Icon(Icons.inventory_2_outlined), label: Text(t('purchases.inventory'))),
              ],
              selected: {_history},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() => _history = v.first),
            ),
            if (_history) ...[
              const SizedBox(height: 8),
              SegmentedButton<int>(
                segments: [
                  ButtonSegment(value: 0, label: Text(t('m.this_month'))),
                  ButtonSegment(value: 7, label: Text(t('sales.7d'))),
                  ButtonSegment(value: 90, label: Text(t('exp.90d'))),
                ],
                selected: {_days},
                showSelectedIcon: false,
                onSelectionChanged: (v) {
                  _days = v.first;
                  _load();
                },
              ),
            ],
          ]),
        ),
        const Divider(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _load(quiet: true),
            child: _error != null && _purchases == null
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)])
                : _purchases == null
                    ? ListView(children: const [ListSkeleton(count: 8)])
                    : _history
                        ? _historyList(context)
                        : _stockList(context),
          ),
        ),
      ]),
    );
  }

  Widget _historyList(BuildContext context) {
    final t = T.of(context);
    final s = SessionScope.of(context);
    final items = _purchases!;
    final spent = items.fold<num>(0, (a, p) => a + _n(p['total_cost']));
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 96),
      children: [
        FigureTile(
          label: t('reports.spent_on_restocking'),
          value: money(spent, s.currency),
          detail: '$_total ${t('reports.purchase_records')}',
          icon: Icons.local_shipping_outlined,
        ),
        if (items.isEmpty)
          EmptyState(icon: Icons.local_shipping_outlined, message: t('purchases.no_history'))
        else ...[
          const SizedBox(height: 8),
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(children: [
              for (var i = 0; i < items.length; i++) ...[
                if (i > 0) const Divider(indent: 16, endIndent: 16),
                ListTile(
                  onTap: () async {
                    if (await _showPurchase(context, items[i])) _load(quiet: true);
                  },
                  title: Text('${items[i]['product_name'] ?? ''}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                    [
                      if (parseTimestamp(items[i]['created_at']) case final d?) t.date(d),
                      if (_suppliers['${items[i]['supplier_id'] ?? ''}'] case final sup?) sup.name,
                      '${groupDigits(_n(items[i]['quantity_added']))} × ${groupDigits(_n(items[i]['cost_price']))}',
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: Text(money(_n(items[i]['total_cost']), s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
            ]),
          ),
          if (_total > items.length)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(t('m.showing_n_of', {'n': items.length, 'total': _total}),
                  textAlign: TextAlign.center, style: TextStyle(color: Hgv.of(context).faint, fontSize: 12)),
            ),
        ],
      ],
    );
  }

  Widget _stockList(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final all = _products ?? const [];
    final low = s.lowStock;
    final cost = all.fold<num>(0, (a, p) => a + _n(p['cost_price']) * _n(p['quantity']));
    final retail = all.fold<num>(0, (a, p) => a + _n(p['selling_price']) * _n(p['quantity']));
    final lowCount = all.where((p) => _n(p['quantity']) > 0 && _n(p['quantity']) <= low).length;
    final outCount = all.where((p) => _n(p['quantity']) <= 0).length;
    final q = _q.text.trim().toLowerCase();
    final shown = all.where((p) {
      final qty = _n(p['quantity']);
      final ok = switch (_stockFilter) {
        'in' => qty > low,
        'low' => qty > 0 && qty <= low,
        'out' => qty <= 0,
        _ => true,
      };
      if (!ok) return false;
      if (q.isEmpty) return true;
      final sup = _suppliers['${p['supplier_id'] ?? ''}']?.name.toLowerCase() ?? '';
      return '${p['name'] ?? ''}'.toLowerCase().contains(q) || sup.contains(q);
    }).toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 96),
      children: [
        GridView(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisExtent: 92),
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            FigureTile(label: t('purchases.stat_total_products'), value: groupDigits(all.length), icon: Icons.inventory_2_outlined),
            if (s.canSeeFinancials) ...[
              FigureTile(label: t('purchases.stat_what_you_paid'), value: compactMoney(cost, s.currency), icon: Icons.payments_outlined),
              FigureTile(label: t('purchases.stat_if_sell_all'), value: compactMoney(retail, s.currency), icon: Icons.sell_outlined),
            ],
            if (s.showsProfit)
              FigureTile(
                label: t('purchases.stat_profit_to_make'),
                value: compactMoney(retail - cost, s.currency),
                icon: Icons.trending_up,
                color: retail - cost >= 0 ? c.success : c.danger,
              ),
            FigureTile(
                label: t('purchases.stat_almost_finished'),
                value: '$lowCount',
                icon: Icons.warning_amber_rounded,
                color: lowCount > 0 ? c.warning : null),
            FigureTile(
                label: t('purchases.stat_finished_empty'),
                value: '$outCount',
                icon: Icons.remove_shopping_cart_outlined,
                color: outCount > 0 ? c.danger : null),
          ],
        ),
        const SizedBox(height: 8),
        SearchField(controller: _q, hint: t('stock.search'), onChanged: (_) => setState(() {})),
        const SizedBox(height: 8),
        Wrap(spacing: 6, children: [
          for (final (k, label) in [
            ('all', t('m.all')),
            ('in', t('m.in_stock')),
            ('low', t('purchases.stat_almost_finished')),
            ('out', t('purchases.stat_finished_empty')),
          ])
            ChoiceChip(label: Text(label), selected: _stockFilter == k, showCheckmark: false, onSelected: (_) => setState(() => _stockFilter = k)),
        ]),
        const SizedBox(height: 8),
        if (shown.isEmpty)
          EmptyState(icon: Icons.search_off, message: t('m.nothing_here'))
        else
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(children: [
              for (var i = 0; i < shown.length; i++) ...[
                if (i > 0) const Divider(indent: 16, endIndent: 16),
                Builder(builder: (context) {
                  final p = shown[i];
                  final qty = _n(p['quantity']);
                  final sup = _suppliers['${p['supplier_id'] ?? ''}'];
                  return ListTile(
                    onTap: () => _record(product: p),
                    leading: ProductThumb(p['thumbnail'] as String?, isCar: false),
                    title:
                        Text('${p['name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(
                      [
                        if (sup != null) sup.name,
                        if (s.canSeeFinancials) '${groupDigits(_n(p['cost_price']))} → ${groupDigits(_n(p['selling_price']))}',
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text(groupDigits(qty),
                          style:
                              TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: qty <= 0 ? c.danger : (qty <= low ? c.warning : c.text))),
                      Text(t('purchases.restock'), style: TextStyle(fontSize: 11, color: c.ink, fontWeight: FontWeight.w700)),
                    ]),
                  );
                }),
              ],
            ]),
          ),
      ],
    );
  }

  /// One purchase: what, from whom, how many at what cost; Delete.
  Future<bool> _showPurchase(BuildContext context, Map<String, dynamic> p) async {
    var changed = false;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Hgv.of(context).elevated,
      builder: (sheet) {
        final t = T.of(sheet);
        final c = Hgv.of(sheet);
        final s = SessionScope.of(sheet);
        final date = parseTimestamp(p['created_at']);
        final sup = _suppliers['${p['supplier_id'] ?? ''}'];
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              IconAvatar(icon: Icons.local_shipping_outlined, color: c.ink, size: 46),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${p['product_name'] ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                  if (date != null) Text('${t.weekday(date.weekday)} ${t.date(date)} ${date.year}', style: TextStyle(color: c.faint)),
                ]),
              ),
            ]),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(14)),
              child: Column(children: [
                Text(t('purchases.total_cost'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                FittedBox(
                  child: Text(money(_n(p['total_cost']), s.currency),
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                ),
              ]),
            ),
            const SizedBox(height: 10),
            InfoRow(t('purchases.qty_added'), groupDigits(_n(p['quantity_added']))),
            InfoRow(t('purchases.cost_price'), money(_n(p['cost_price']), s.currency)),
            if (p['selling_price'] != null) InfoRow(t('purchases.selling_price'), money(_n(p['selling_price']), s.currency)),
            if (sup != null) InfoRow(t('purchases.col_supplier'), sup.name),
            if ('${p['notes'] ?? ''}'.trim().isNotEmpty) InfoRow(t('sale.notes'), '${p['notes']}'),
            const SizedBox(height: 8),
            Text(t('m.purchase_delete_note'), style: TextStyle(fontSize: 12, color: c.faint)),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50), foregroundColor: c.danger, side: BorderSide(color: c.danger)),
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: sheet,
                  builder: (d) => AlertDialog(
                    title: Text(t('m.delete_record_q')),
                    content: Text(t('m.purchase_delete_note')),
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
                if (ok != true || !sheet.mounted) return;
                try {
                  await s.api.delete('${Svc.purchases}/purchases/${p['id']}');
                  changed = true;
                  if (sheet.mounted) Navigator.pop(sheet);
                } catch (e) {
                  if (sheet.mounted) say(sheet, errorText(t, e));
                }
              },
              icon: const Icon(Icons.delete_outline),
              label: Text(t('app.delete')),
            ),
          ]),
        );
      },
    );
    return changed;
  }
}

/// Records a purchase: restocks [product] (or one picked from the stock),
/// or brings in a new product. Returns the purchase saved.
Future<Map<String, dynamic>?> recordPurchase(BuildContext context, {Map<String, dynamic>? product}) =>
    pushScoped<Map<String, dynamic>>(context, PurchaseFormScreen(product: product));

class PurchaseFormScreen extends StatefulWidget {
  const PurchaseFormScreen({super.key, this.product});
  final Map<String, dynamic>? product;

  @override
  State<PurchaseFormScreen> createState() => _PurchaseFormScreenState();
}

class _PurchaseFormScreenState extends State<PurchaseFormScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _qty = TextEditingController();
  final _cost = TextEditingController();
  final _price = TextEditingController();

  /// Restocking an item already in stock, or a brand-new one.
  late bool _restock = true;
  Map<String, dynamic>? _product;
  String? _supplierId;
  Future<List<Partner>>? _suppliers;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.product != null) _setProduct(widget.product!);
    for (final c in [_qty, _cost, _price]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _suppliers ??= loadSuppliers(SessionScope.of(context));
  }

  @override
  void dispose() {
    for (final c in [_name, _description, _qty, _cost, _price]) {
      c.dispose();
    }
    super.dispose();
  }

  void _setProduct(Map<String, dynamic> p) {
    _product = p;
    _cost.text = amountText(_n(p['cost_price']));
    _price.text = amountText(_n(p['selling_price']));
    final sid = '${p['supplier_id'] ?? ''}';
    _supplierId = sid.isEmpty ? null : sid;
  }

  Future<void> _pick() async {
    final p = await pushScoped<Map<String, dynamic>>(context, const ProductPickerScreen(allowSoldOut: true));
    if (p != null && mounted) setState(() => _setProduct(p));
  }

  Future<void> _addSupplier() async {
    final s = SessionScope.of(context);
    final all = await loadPartners(s).catchError((_) => <Partner>[]);
    if (!mounted) return;
    final added = await editPartner(context, others: all, asSupplier: true);
    if (added == null || !mounted) return;
    setState(() {
      _suppliers = loadSuppliers(s);
      if (added.isSupplier) _supplierId = added.id;
    });
  }

  Future<void> _save() async {
    final t = T.of(context);
    final s = SessionScope.of(context);
    if (_restock && _product == null) return say(context, t('form.pick_product_first'));
    if (!_form.currentState!.validate()) return;
    final price = parseAmount(_price.text);
    final body = <String, dynamic>{
      'cost_price': parseAmount(_cost.text),
      if (price != null && price > 0) 'selling_price': price,
      'quantity_added': int.parse(_qty.text.trim()),
      if (_supplierId != null) 'supplier_id': _supplierId,
      if (_restock)
        'product_id': '${_product!['id']}'
      else ...{
        'product_name': _name.text.trim(),
        if (_description.text.trim().isNotEmpty) 'description': _description.text.trim(),
      },
    };
    setState(() => _saving = true);
    try {
      final res = await s.api.post('${Svc.purchases}/purchases', body);
      final data = (res as Map?)?['data'];
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      say(context, t('m.purchase_saved'));
      Navigator.pop(context, data is Map ? Map<String, dynamic>.from(data) : body);
    } catch (e) {
      if (mounted) say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final p = _product;
    final qty = int.tryParse(_qty.text.trim()) ?? 0;
    final cost = parseAmount(_cost.text) ?? 0;
    final price = parseAmount(_price.text) ?? 0;
    return FormPage(
      title: t(_restock ? 'purchases.restock_title' : 'purchases.new_title'),
      formKey: _form,
      saving: _saving,
      saveLabel: t('purchases.submit'),
      onSave: _save,
      children: [
        if (widget.product == null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: true, icon: const Icon(Icons.inventory_2_outlined), label: Text(t('purchases.restock'))),
                ButtonSegment(value: false, icon: const Icon(Icons.add_box_outlined), label: Text(t('purchases.new_product'))),
              ],
              selected: {_restock},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() => _restock = v.first),
            ),
          ),
        if (_restock)
          LabeledField(
            t('form.product'),
            Card(
              margin: EdgeInsets.zero,
              child: ListTile(
                onTap: widget.product == null ? _pick : null,
                leading: p == null ? null : ProductThumb(p['thumbnail'] as String?, isCar: false),
                title: Text(p == null ? t('form.pick_product') : '${p['name'] ?? ''}',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, color: p == null ? c.faint : c.text)),
                subtitle: p == null ? null : Text(t('stock.in_stock_n', {'n': groupDigits(_n(p['quantity']))})),
                trailing: widget.product == null ? const Icon(Icons.chevron_right) : null,
              ),
            ),
          )
        else ...[
          LabeledField(
            t('purchases.product_name'),
            textField(_name, hint: t('purchases.placeholder_product_name'), validator: (v) => (v ?? '').trim().isEmpty ? t('form.need_name') : null),
          ),
          LabeledField(t('form.description'), textField(_description, hint: t('form.optional'), lines: 2)),
        ],
        LabeledField(
          t('purchases.col_supplier'),
          FutureBuilder<List<Partner>>(
            future: _suppliers,
            builder: (context, snap) {
              final list = snap.data ?? const <Partner>[];
              final known = list.any((x) => x.id == _supplierId);
              return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                DropdownButtonFormField<String?>(
                  isExpanded: true,
                  initialValue: known ? _supplierId : null,
                  key: ValueKey('${list.length}-$_supplierId'),
                  hint: Text(t('form.optional')),
                  items: [
                    DropdownMenuItem<String?>(value: null, child: Text(t('m.no_supplier'))),
                    for (final x in list) DropdownMenuItem<String?>(value: x.id, child: Text(x.name, overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _supplierId = v),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(onPressed: _addSupplier, icon: const Icon(Icons.add, size: 18), label: Text(t('m.add_supplier'))),
                ),
              ]);
            },
          ),
        ),
        LabeledField(
          t('purchases.qty_added'),
          TextFormField(
            controller: _qty,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(hintText: '0'),
            validator: (v) => (int.tryParse((v ?? '').trim()) ?? 0) <= 0 ? t('form.need_quantity') : null,
          ),
        ),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: LabeledField(
              t('purchases.cost_price'),
              moneyField(_cost, suffix: s.currency, validator: (v) => (parseAmount(v ?? '') ?? 0) <= 0 ? t('form.need_amount') : null),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: LabeledField(t('purchases.selling_price'), moneyField(_price, suffix: s.currency))),
        ]),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
          child: Column(children: [
            Row(children: [
              Expanded(
                  child: Text(t('purchases.total_cost'),
                      overflow: TextOverflow.ellipsis, style: TextStyle(color: c.muted, fontWeight: FontWeight.w700))),
              const SizedBox(width: 8),
              Text(money(qty * cost, s.currency), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            ]),
            if (s.showsProfit && cost > 0 && price > 0) ...[
              const SizedBox(height: 6),
              Row(children: [
                Expanded(
                    child: Text('${t('purchases.unit_profit_label')} · ${t('purchases.margin_label')}',
                        overflow: TextOverflow.ellipsis, style: TextStyle(color: c.muted))),
                const SizedBox(width: 8),
                Text('${money(price - cost, s.currency)} · ${((price - cost) / cost * 100).toStringAsFixed(1)}%',
                    style: TextStyle(fontWeight: FontWeight.w700, color: price >= cost ? c.success : c.danger)),
              ]),
            ],
          ]),
        ),
      ],
    );
  }
}
