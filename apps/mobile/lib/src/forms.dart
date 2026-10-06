import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'car_photos.dart';
import 'api.dart';
import 'config.dart';
import 'format.dart';
import 'i18n.dart';
import 'live/scoped_route.dart';
import 'session.dart';
import 'sheets.dart';
import 'theme.dart';
import 'widgets.dart';

// Recording things from the phone: a sale, a debt and its payments, a product
// and its stock, an expense. Same calls and rules as the website's forms
// (apps/web/app/(dashboard)/sales, items, expenses); every change reaches the
// other phones and the website through the live connection.

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;

/// "1,500", "1 500" → 1500. Null when it is not a number.
num? parseAmount(String text) {
  final clean = text.replaceAll(RegExp(r'[\s,]'), '');
  return clean.isEmpty ? null : num.tryParse(clean);
}

/// Numbers with digits grouped as you type them ("1500000" → "1,500,000").
class _Grouped extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue old, TextEditingValue next) {
    final digits = next.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.isEmpty) return const TextEditingValue();
    final text = groupDigits(int.parse(digits));
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

String _amountText(num? v) => v == null || v <= 0 ? '' : groupDigits(v.round());

void _say(BuildContext context, String text) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

/// A form on its own page: fields that scroll, the save button kept above
/// the keyboard.
class _FormPage extends StatelessWidget {
  const _FormPage({required this.title, required this.formKey, required this.children, required this.saveLabel, required this.saving, required this.onSave});
  final String title, saveLabel;
  final GlobalKey<FormState> formKey;
  final List<Widget> children;
  final bool saving;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Form(
        key: formKey,
        child: ListView(padding: const EdgeInsets.fromLTRB(14, 8, 14, 24), children: children),
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: FilledButton(
            onPressed: saving ? null : onSave,
            child: saving
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                : Text(saveLabel),
          ),
        ),
      ),
    );
  }
}

/// A labelled field.
class _Field extends StatelessWidget {
  const _Field(this.label, this.child, {this.hint});
  final String label;
  final String? hint;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Hgv.of(context).muted)),
          const SizedBox(height: 6),
          child,
          if (hint != null) ...[
            const SizedBox(height: 4),
            Text(hint!, style: TextStyle(fontSize: 12, color: Hgv.of(context).faint)),
          ],
        ]),
      );
}

Widget _text(TextEditingController c,
        {String? hint, String? Function(String?)? validator, TextInputType? keyboard, int lines = 1, bool caps = true}) =>
    TextFormField(
      controller: c,
      validator: validator,
      keyboardType: keyboard ?? (lines > 1 ? TextInputType.multiline : TextInputType.text),
      textCapitalization: caps ? TextCapitalization.sentences : TextCapitalization.none,
      minLines: lines,
      maxLines: lines,
      decoration: InputDecoration(hintText: hint),
    );

Widget _moneyField(TextEditingController c, {String? suffix, String? Function(String?)? validator, ValueChanged<String>? onChanged}) =>
    TextFormField(
      controller: c,
      validator: validator,
      onChanged: onChanged,
      keyboardType: TextInputType.number,
      inputFormatters: [_Grouped()],
      decoration: InputDecoration(suffixText: suffix, hintText: '0'),
    );

/// Choice of one among a few, as chips.
class _Choices<V> extends StatelessWidget {
  const _Choices({required this.options, required this.value, required this.onChanged});
  final List<(V, String)> options;
  final V? value;
  final ValueChanged<V> onChanged;

  @override
  Widget build(BuildContext context) => Wrap(spacing: 6, runSpacing: 6, children: [
        for (final (v, label) in options)
          ChoiceChip(label: Text(label), selected: v == value, showCheckmark: false, onSelected: (_) => onChanged(v)),
      ]);
}

// ─────────────────────────── Sale ───────────────────────────

/// Opens the sale form, optionally for one product. True when a sale was recorded.
Future<bool> recordSale(BuildContext context, {Map<String, dynamic>? product}) async =>
    await pushScoped<bool>(context, SaleFormScreen(product: product)) == true;

class SaleFormScreen extends StatefulWidget {
  const SaleFormScreen({super.key, this.product});
  final Map<String, dynamic>? product;

  @override
  State<SaleFormScreen> createState() => _SaleFormScreenState();
}

class _SaleFormScreenState extends State<SaleFormScreen> {
  static const _methods = ['cash', 'mtn', 'airtel', 'bank', 'card', 'debt'];
  final _form = GlobalKey<FormState>();
  final _price = TextEditingController();
  final _debtor = TextEditingController();
  final _phone = TextEditingController();
  final _notes = TextEditingController();
  Map<String, dynamic>? _product;
  int _qty = 1;
  String _method = 'cash';
  bool _saving = false;
  bool _tried = false;

  /// Car companies: the buyer is one of the saved customers.
  Future<List<Map<String, dynamic>>>? _customers;
  Map<String, dynamic>? _customer;

  @override
  void initState() {
    super.initState();
    if (widget.product != null) _setProduct(widget.product!);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final s = SessionScope.of(context);
    if (s.isCar) _customers ??= loadCustomers(s);
  }

  @override
  void dispose() {
    for (final c in [_price, _debtor, _phone, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  void _setProduct(Map<String, dynamic> p) {
    _product = p;
    _qty = 1;
    final price = p['selling_price'];
    _price.text = price == null ? '' : _amountText(_n(price));
  }

  int get _stock => _n(_product?['quantity']).toInt();
  num get _total => (parseAmount(_price.text) ?? 0) * _qty;

  Future<void> _pickProduct() async {
    final p = await pushScoped<Map<String, dynamic>>(context, const ProductPickerScreen());
    if (p != null && mounted) setState(() => _setProduct(p));
  }

  void _pickCustomer(Map<String, dynamic>? c) => setState(() {
        _customer = c;
        if (c != null) {
          _debtor.text = '${c['name'] ?? ''}';
          _phone.text = '${c['phone'] ?? ''}';
        }
      });

  Future<void> _save() async {
    final t = T.of(context);
    final s = SessionScope.of(context);
    setState(() => _tried = true);
    if (_product == null) return _say(context, t('form.pick_product_first'));
    if (!_form.currentState!.validate()) return;
    if (s.isCar) {
      if (_customer == null) return _say(context, t('form.pick_buyer'));
      if (!customerComplete(_customer!)) return _say(context, t('form.buyer_incomplete'));
    }
    final debt = _method == 'debt';
    final debtor = _debtor.text.trim();
    final notes = _notes.text.trim();
    final total = _total;
    setState(() => _saving = true);
    try {
      final res = await s.api.post('${Svc.sales}/sales', {
        'product_id': '${_product!['id']}',
        if (_customer != null) 'customer_id': '${_customer!['id']}',
        'quantity': _qty,
        'unit_price': parseAmount(_price.text) ?? 0,
        if (notes.isNotEmpty) 'notes': notes,
        'payment_method': _method,
        if (debt) 'amount_paid': 0,
      });
      final sale = (res as Map?)?['data'];
      if (debt) {
        // As on the website: the sale stands even if the debt can't be written.
        try {
          await s.api.post('${Svc.sales}/debts', {
            'debtor_name': debtor,
            if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
            'amount_owed': total,
            'amount_paid': 0,
            if (notes.isNotEmpty) 'notes': notes,
            if (sale is Map && sale['id'] != null) 'sale_id': '${sale['id']}',
          });
        } catch (_) {
          if (mounted) _say(context, t('form.debt_not_saved'));
        }
      }
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      _say(context, t('form.sale_saved', {'amount': money(total, s.currency)}));
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) _say(context, errorText(t, e));
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
    return _FormPage(
      title: t('form.new_sale'),
      formKey: _form,
      saving: _saving,
      saveLabel: t('form.save_sale'),
      onSave: _save,
      children: [
        _Field(
          s.isCar ? t('form.vehicle') : t('form.product'),
          Card(
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
              side: BorderSide(color: _tried && p == null ? c.danger : c.border),
            ),
            child: ListTile(
              onTap: _pickProduct,
              leading: p == null ? null : ProductThumb(p['thumbnail'] as String?, isCar: s.isCar),
              title: Text(p == null ? t('form.pick_product') : '${p['name'] ?? ''}',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w700, color: p == null ? c.faint : c.text)),
              subtitle: p == null || s.isCar ? null : Text(t('stock.in_stock_n', {'n': groupDigits(_stock)})),
              trailing: const Icon(Icons.chevron_right),
            ),
          ),
        ),
        if (!s.isCar)
          _Field(
            t('sale.quantity'),
            Row(children: [
              IconButton.outlined(
                onPressed: _qty > 1 ? () => setState(() => _qty--) : null,
                icon: const Icon(Icons.remove),
              ),
              Expanded(
                child: Text('$_qty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              ),
              IconButton.outlined(
                onPressed: p != null && _qty < _stock ? () => setState(() => _qty++) : null,
                icon: const Icon(Icons.add),
              ),
            ]),
          ),
        _Field(
          t('sale.unit_price'),
          _moneyField(_price,
              suffix: s.currency,
              onChanged: (_) => setState(() {}),
              validator: (v) => (parseAmount(v ?? '') ?? -1) < 0 ? t('form.need_price') : null),
        ),
        if (s.isCar)
          _Field(
            t('form.buyer'),
            FutureBuilder<List<Map<String, dynamic>>>(
              future: _customers,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Shimmer(child: RowSkeleton(leading: RowLead.circle, titleWidth: 140));
                }
                final list = snap.data ?? const [];
                if (list.isEmpty) return Text(t('form.no_customers'), style: TextStyle(color: c.warning));
                return DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: _customer == null ? null : '${_customer!['id']}',
                  hint: Text(t('form.pick_buyer_hint')),
                  items: [
                    for (final cu in list)
                      DropdownMenuItem(
                        value: '${cu['id']}',
                        child: Text([cu['name'], cu['phone']].where((x) => '${x ?? ''}'.isNotEmpty).join(' · '),
                            overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (id) => _pickCustomer(list.firstWhere((x) => '${x['id']}' == id)),
                );
              },
            ),
            hint: _customer != null && !customerComplete(_customer!) ? t('form.buyer_incomplete') : null,
          ),
        _Field(
          t('sale.payment'),
          _Choices<String>(
            options: [for (final m in _methods) (m, payLabel(t, m))],
            value: _method,
            onChanged: (m) => setState(() => _method = m),
          ),
        ),
        if (_method == 'debt') ...[
          _Field(
            t('form.debtor_name'),
            _text(_debtor, validator: (v) => (v ?? '').trim().isEmpty ? t('form.need_debtor') : null),
          ),
          _Field(t('form.phone'), _text(_phone, keyboard: TextInputType.phone, caps: false)),
        ],
        _Field(t('sale.notes'), _text(_notes, hint: t('form.optional'), lines: 2)),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
          child: Row(children: [
            Text(t('sale.total'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text(money(_total, s.currency), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
          ]),
        ),
      ],
    );
  }
}

/// The business's customers (the website's Customers page; suppliers, saved
/// with a TIN, are left out).
Future<List<Map<String, dynamic>>> loadCustomers(Session s) async {
  final res = await s.api.get('${Svc.suppliers}/suppliers');
  final data = (res as Map?)?['data'];
  final list = data is Map ? data['items'] : data;
  return (list is List ? list : const [])
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .where((c) => !'${c['address'] ?? ''}'.startsWith('TIN:'))
      .toList();
}

/// A car buyer needs a name, phone, ID and address (website rule).
bool customerComplete(Map<String, dynamic> c) =>
    ['name', 'phone', 'id_number', 'address'].every((k) => '${c[k] ?? ''}'.trim().isNotEmpty);

/// Search the stock and pick one that can be sold.
class ProductPickerScreen extends StatefulWidget {
  const ProductPickerScreen({super.key, this.allowSoldOut = false});

  /// Quotes (proformas) may list items that are sold out right now. Car
  /// companies only ever see cars in stock that nobody has booked.
  final bool allowSoldOut;

  @override
  State<ProductPickerScreen> createState() => _ProductPickerScreenState();
}

class _ProductPickerScreenState extends State<ProductPickerScreen> {
  final _q = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>>? _items;
  Object? _error;
  int _gen = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final gen = ++_gen;
    final s = SessionScope.of(context);
    setState(() => _error = null);
    try {
      final res = await s.api.get('${Svc.products}/products', query: {
        'page': '1',
        'limit': '40',
        if (_q.text.trim().isNotEmpty) 'q': _q.text.trim(),
        if (s.isCar) 'status': 'available',
      });
      final data = (res as Map)['data'] as Map? ?? {};
      if (!mounted || gen != _gen) return;
      setState(() => _items = (data['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final items = _items;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsets.only(right: 12),
          child: SearchField(
            controller: _q,
            autofocus: true,
            hint: s.isCar ? t('stock.search_car') : t('stock.search'),
            onChanged: (_) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 300), _load);
            },
          ),
        ),
      ),
      body: _error != null && items == null
          ? EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)
          : items == null
              ? ListView(children: const [ListSkeleton(count: 8, leading: RowLead.thumb)])
              : items.isEmpty
                  ? EmptyState(icon: Icons.search_off, message: t('stock.no_match', {'q': _q.text}))
                  : ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const Divider(indent: 16, endIndent: 16),
                      itemBuilder: (context, i) {
                        final p = items[i];
                        final qty = _n(p['quantity']).toInt();
                        return ListTile(
                          enabled: qty > 0 || widget.allowSoldOut,
                          onTap: () => Navigator.pop(context, p),
                          leading: ProductThumb(p['thumbnail'] as String?, isCar: s.isCar),
                          // Cars read "BYD Yuan Up - LL31233343" (name - chassis).
                          title: Text(s.isCar && (attributesOf(p['attributes'])['chassis_no'] ?? '').isNotEmpty
                                  ? '${p['name'] ?? ''} - ${attributesOf(p['attributes'])['chassis_no']}'
                                  : '${p['name'] ?? ''}',
                              maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text(qty <= 0 ? t('dash.out_of_stock') : t('stock.in_stock_n', {'n': groupDigits(qty)}),
                              style: TextStyle(color: qty <= 0 ? c.danger : c.muted)),
                          trailing: p['selling_price'] == null
                              ? null
                              : Text(money(_n(p['selling_price']), s.currency), style: const TextStyle(fontWeight: FontWeight.w700)),
                        );
                      },
                    ),
    );
  }
}

// ─────────────────────────── Debts ───────────────────────────

/// Money received on a debt. True when it was recorded.
Future<bool> recordDebtPayment(BuildContext context, Map<String, dynamic> debt) async {
  final t = T.of(context);
  final s = SessionScope.of(context);
  final owed = _n(debt['amount_owed']), paid = _n(debt['amount_paid']);
  final balance = owed - paid;
  final ctrl = TextEditingController(text: _amountText(balance));
  final key = GlobalKey<FormState>();
  final amount = await showDialog<num>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(t('form.record_payment')),
      content: Form(
        key: key,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t('form.balance_left', {'amount': money(balance, s.currency)}), style: TextStyle(color: Hgv.of(c).muted)),
          const SizedBox(height: 12),
          TextFormField(
            controller: ctrl,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [_Grouped()],
            decoration: InputDecoration(labelText: t('form.amount_received'), suffixText: s.currency),
            validator: (v) {
              final a = parseAmount(v ?? '') ?? 0;
              if (a <= 0) return t('form.need_amount');
              if (a > balance) return t('form.more_than_balance');
              return null;
            },
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: Text(t('app.cancel'))),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: () {
            if (key.currentState!.validate()) Navigator.pop(c, parseAmount(ctrl.text));
          },
          child: Text(t('form.save')),
        ),
      ],
    ),
  );
  ctrl.dispose();
  if (amount == null || !context.mounted) return false;
  try {
    await s.api.put('${Svc.sales}/debts/${debt['id']}', {'amount_paid': paid + amount});
    if (context.mounted) {
      HapticFeedback.mediumImpact();
      _say(context, t(paid + amount >= owed ? 'form.debt_settled' : 'form.payment_saved', {'amount': money(amount, s.currency)}));
    }
    return true;
  } catch (e) {
    if (context.mounted) _say(context, errorText(t, e));
    return false;
  }
}

/// Someone owes money for something not sold here (or before the app).
Future<bool> recordDebt(BuildContext context) async => await pushScoped<bool>(context, const DebtFormScreen()) == true;

class DebtFormScreen extends StatefulWidget {
  const DebtFormScreen({super.key});

  @override
  State<DebtFormScreen> createState() => _DebtFormScreenState();
}

class _DebtFormScreenState extends State<DebtFormScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(), _phone = TextEditingController();
  final _owed = TextEditingController(), _paid = TextEditingController(), _notes = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_name, _phone, _owed, _paid, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final t = T.of(context);
    final s = SessionScope.of(context);
    setState(() => _saving = true);
    try {
      await s.api.post('${Svc.sales}/debts', {
        'debtor_name': _name.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
        'amount_owed': parseAmount(_owed.text) ?? 0,
        'amount_paid': parseAmount(_paid.text) ?? 0,
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
      });
      if (!mounted) return;
      _say(context, t('form.debt_saved'));
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) _say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final s = SessionScope.of(context);
    return _FormPage(
      title: t('form.new_debt'),
      formKey: _form,
      saving: _saving,
      saveLabel: t('form.save'),
      onSave: _save,
      children: [
        _Field(t('form.debtor_name'), _text(_name, validator: (v) => (v ?? '').trim().isEmpty ? t('form.need_debtor') : null)),
        _Field(t('form.phone'), _text(_phone, keyboard: TextInputType.phone, caps: false)),
        _Field(
          t('debts.owed'),
          _moneyField(_owed, suffix: s.currency, validator: (v) => (parseAmount(v ?? '') ?? 0) <= 0 ? t('form.need_amount') : null),
        ),
        _Field(
          t('form.already_paid'),
          _moneyField(_paid,
              suffix: s.currency,
              validator: (v) =>
                  (parseAmount(v ?? '') ?? 0) > (parseAmount(_owed.text) ?? 0) ? t('form.more_than_balance') : null),
        ),
        _Field(t('sale.notes'), _text(_notes, hint: t('form.optional'), lines: 2)),
      ],
    );
  }
}

// ─────────────────────────── Products (shops) ───────────────────────────

/// Adds a product, or edits [product]. Returns the saved product.
Future<Map<String, dynamic>?> editProduct(BuildContext context, {Map<String, dynamic>? product}) =>
    pushScoped<Map<String, dynamic>>(context, ProductFormScreen(product: product));

class ProductFormScreen extends StatefulWidget {
  const ProductFormScreen({super.key, this.product});
  final Map<String, dynamic>? product;

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  final _form = GlobalKey<FormState>();
  late final p = widget.product;
  late final _name = TextEditingController(text: '${p?['name'] ?? ''}');
  late final _category = TextEditingController(text: '${p?['category'] ?? ''}');
  late final _cost = TextEditingController(text: _amountText(p == null ? null : _n(p!['cost_price'])));
  late final _price = TextEditingController(text: _amountText(p == null ? null : _n(p!['selling_price'])));
  late final _qty = TextEditingController(text: p == null ? '' : '${_n(p!['quantity']).toInt()}');
  late final _barcode = TextEditingController(text: '${p?['barcode'] ?? ''}');
  late final _description = TextEditingController(text: '${p?['description'] ?? ''}');
  bool _saving = false;

  /// New products: up to 7 photos, the first is the cover. (An existing
  /// product's photos are managed on its page.)
  final List<CarPhoto> _photos = [];
  bool _picking = false;

  Future<void> _addPhotos() async {
    if (_picking) return;
    setState(() => _picking = true);
    try {
      final picked = await pickPhotos(context, room: maxCarPhotos - _photos.length);
      if (mounted) setState(() => _photos.addAll(picked.take(maxCarPhotos - _photos.length)));
    } catch (_) {
      if (mounted) _say(context, T.of(context)('photo.unreadable'));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _category, _cost, _price, _qty, _barcode, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final t = T.of(context);
    final s = SessionScope.of(context);
    String? opt(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    final price = parseAmount(_price.text);
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'category': opt(_category),
      'cost_price': parseAmount(_cost.text),
      // Left empty: sold at cost, as on the website.
      if (price != null && price > 0) 'selling_price': price,
      'quantity': int.tryParse(_qty.text.trim()) ?? 0,
      'barcode': opt(_barcode),
      'description': opt(_description),
      if (p == null && _photos.isNotEmpty) ...{
        'images': jsonEncode([for (final x in _photos) x.photo]),
        'thumbnail': _photos.first.thumb,
      },
    };
    setState(() => _saving = true);
    try {
      final res = p == null
          ? await s.api.post('${Svc.products}/products', body)
          : await s.api.put('${Svc.products}/products/${p!['id']}', body);
      final data = (res as Map?)?['data'];
      if (!mounted) return;
      _say(context, t(p == null ? 'form.product_added' : 'form.product_saved'));
      Navigator.pop(context, data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{...?p, ...body});
    } catch (e) {
      if (mounted) _say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final s = SessionScope.of(context);
    return _FormPage(
      title: t(p == null ? 'form.new_product' : 'form.edit_product'),
      formKey: _form,
      saving: _saving,
      saveLabel: t('form.save'),
      onSave: _save,
      children: [
        _Field(t('form.product_name'), _text(_name, validator: (v) => (v ?? '').trim().isEmpty ? t('form.need_name') : null)),
        _Field(t('detail.category'), _text(_category, hint: t('form.optional'))),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: _Field(
              t('form.cost_price'),
              _moneyField(_cost, suffix: s.currency, validator: (v) => (parseAmount(v ?? '') ?? 0) <= 0 ? t('form.need_amount') : null),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: _Field(t('form.selling_price'), _moneyField(_price, suffix: s.currency))),
        ]),
        _Field(
          t('detail.in_stock'),
          TextFormField(
            controller: _qty,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(hintText: '0'),
            validator: (v) => int.tryParse((v ?? '').trim()) == null ? t('form.need_quantity') : null,
          ),
        ),
        _Field(t('detail.barcode'), _text(_barcode, hint: t('form.optional'), caps: false)),
        _Field(t('form.description'), _text(_description, hint: t('form.optional'), lines: 3)),
        if (p == null)
          _Field(
            '${t('form.photos')} (${_photos.length}/$maxCarPhotos)',
            _PhotoStrip(
              photos: _photos,
              busy: _picking,
              onAdd: _photos.length < maxCarPhotos ? _addPhotos : null,
              onRemove: (i) => setState(() => _photos.removeAt(i)),
            ),
            hint: t('form.photos_hint'),
          ),
      ],
    );
  }
}

/// Picked photos in a row: the first marked as the cover, ✕ to remove, and
/// a tile to add more.
class _PhotoStrip extends StatelessWidget {
  const _PhotoStrip({required this.photos, required this.busy, required this.onAdd, required this.onRemove});
  final List<CarPhoto> photos;
  final bool busy;
  final VoidCallback? onAdd;
  final ValueChanged<int> onRemove;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final t = T.of(context);
    const size = 76.0;
    return Wrap(spacing: 8, runSpacing: 8, children: [
      for (var i = 0; i < photos.length; i++)
        SizedBox.square(
          dimension: size,
          child: Stack(fit: StackFit.expand, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: UrlImage(url: photos[i].thumb, fallback: ColoredBox(color: c.paper)),
            ),
            if (i == 0)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  decoration: const BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.vertical(bottom: Radius.circular(10)),
                  ),
                  child: Text(t('form.cover'),
                      textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
              ),
            Positioned(
              top: 3,
              right: 3,
              child: InkWell(
                onTap: () => onRemove(i),
                customBorder: const CircleBorder(),
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.black87),
                  child: const Icon(Icons.close_rounded, size: 14, color: Colors.white),
                ),
              ),
            ),
          ]),
        ),
      if (onAdd != null)
        SizedBox.square(
          dimension: size,
          child: Material(
            color: c.paper,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: busy ? null : onAdd,
              child: Center(
                child: busy
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))
                    : Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.add_photo_alternate_outlined, color: c.ink),
                        const SizedBox(height: 2),
                        Text(t('photo.add'), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c.ink)),
                      ]),
              ),
            ),
          ),
        ),
    ]);
  }
}

/// Stock received: adds to what the server has now (not what this phone
/// last saw). Returns the new quantity.
Future<int?> restock(BuildContext context, Map<String, dynamic> product) async {
  final t = T.of(context);
  final s = SessionScope.of(context);
  final ctrl = TextEditingController();
  final key = GlobalKey<FormState>();
  final add = await showDialog<int>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(t('form.restock')),
      content: Form(
        key: key,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${product['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
          Text(t('stock.in_stock_n', {'n': groupDigits(_n(product['quantity']))}), style: TextStyle(color: Hgv.of(c).muted)),
          const SizedBox(height: 12),
          TextFormField(
            controller: ctrl,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(labelText: t('form.received_qty')),
            validator: (v) => (int.tryParse((v ?? '').trim()) ?? 0) <= 0 ? t('form.need_quantity') : null,
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: Text(t('app.cancel'))),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: () {
            if (key.currentState!.validate()) Navigator.pop(c, int.parse(ctrl.text.trim()));
          },
          child: Text(t('form.add_stock')),
        ),
      ],
    ),
  );
  ctrl.dispose();
  if (add == null || !context.mounted) return null;
  try {
    final id = product['id'];
    final fresh = (await s.api.get('${Svc.products}/products/$id') as Map)['data'] as Map;
    final next = _n(fresh['quantity']).toInt() + add;
    await s.api.put('${Svc.products}/products/$id', {'quantity': next});
    if (context.mounted) _say(context, t('form.restocked', {'n': groupDigits(next)}));
    return next;
  } catch (e) {
    if (context.mounted) _say(context, errorText(t, e));
    return null;
  }
}

// ─────────────────────────── Expenses ───────────────────────────

const expenseCategories = [
  'rent', 'utilities', 'salaries', 'supplies', 'maintenance', 'marketing', 'transport', 'taxes', 'other',
];

/// Records an expense. True when it was saved.
Future<bool> recordExpense(BuildContext context) async =>
    await pushScoped<bool>(context, const ExpenseFormScreen()) == true;

class ExpenseFormScreen extends StatefulWidget {
  const ExpenseFormScreen({super.key});

  @override
  State<ExpenseFormScreen> createState() => _ExpenseFormScreenState();
}

class _ExpenseFormScreenState extends State<ExpenseFormScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController(), _amount = TextEditingController(), _notes = TextEditingController();
  final _bank = TextEditingController(), _account = TextEditingController(), _phone = TextEditingController();
  String _category = 'other';
  String? _method;
  DateTime _date = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_title, _amount, _notes, _bank, _account, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (d != null) setState(() => _date = d);
  }

  Future<void> _save() async {
    final t = T.of(context);
    if (!_form.currentState!.validate()) return;
    if (_method == null) return _say(context, t('form.need_method'));
    final s = SessionScope.of(context);
    String? opt(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    setState(() => _saving = true);
    try {
      await s.api.post('${Svc.expenses}/expenses', {
        'title': _title.text.trim(),
        'category': _category,
        'amount': parseAmount(_amount.text),
        if (opt(_notes) != null) 'notes': opt(_notes),
        'expense_date': '${ymd(_date)}T00:00:00',
        'payment_method': _method,
        if (_method == 'bank' && opt(_bank) != null) 'bank_name': opt(_bank),
        if (_method == 'bank' && opt(_account) != null) 'bank_account': opt(_account),
        if (opt(_phone) != null) 'receiver_phone': opt(_phone),
      });
      if (!mounted) return;
      _say(context, t('form.expense_saved'));
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) _say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final s = SessionScope.of(context);
    return _FormPage(
      title: t('form.new_expense'),
      formKey: _form,
      saving: _saving,
      saveLabel: t('form.save'),
      onSave: _save,
      children: [
        _Field(t('form.expense_title'), _text(_title, hint: t('form.expense_title_hint'), validator: (v) => (v ?? '').trim().isEmpty ? t('form.need_title') : null)),
        _Field(
          t('form.amount'),
          _moneyField(_amount, suffix: s.currency, validator: (v) => (parseAmount(v ?? '') ?? 0) <= 0 ? t('form.need_amount') : null),
        ),
        _Field(
          t('detail.category'),
          _Choices<String>(
            options: [for (final k in expenseCategories) (k, t('exp.cat_$k'))],
            value: _category,
            onChanged: (v) => setState(() => _category = v),
          ),
        ),
        _Field(
          t('sale.time'),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46), alignment: Alignment.centerLeft),
            onPressed: _pickDate,
            icon: const Icon(Icons.calendar_today_outlined, size: 18),
            label: Text(daysAgo(_date) == 0 ? t('act.today') : '${t.weekday(_date.weekday)} ${t.date(_date)} ${_date.year}'),
          ),
        ),
        _Field(
          t('form.paid_with'),
          _Choices<String>(
            options: [('mtn', payLabel(t, 'mtn')), ('bank', payLabel(t, 'bank'))],
            value: _method,
            onChanged: (v) => setState(() => _method = v),
          ),
        ),
        if (_method == 'bank') ...[
          _Field(t('form.bank_name'), _text(_bank, hint: t('form.optional'))),
          _Field(t('form.bank_account'), _text(_account, hint: t('form.optional'), keyboard: TextInputType.number, caps: false)),
        ],
        if (_method != null)
          _Field(t('form.receiver_phone'), _text(_phone, hint: t('form.optional'), keyboard: TextInputType.phone, caps: false)),
        _Field(t('sale.notes'), _text(_notes, hint: t('form.optional'), lines: 2)),
      ],
    );
  }
}

// ─────────────────────────── Vehicles (car dealers) ───────────────────────────

/// Built-in vehicle types, as on the website (VEHICLE_FIELDS / CAR_TYPES).
const carTypes = ['sedan', 'suv', 'pickup', 'hatchback', 'van', 'bus', 'truck', 'coupe', 'other'];

/// Adds a vehicle. Returns the saved one.
Future<Map<String, dynamic>?> addVehicle(BuildContext context) =>
    pushScoped<Map<String, dynamic>>(context, const VehicleFormScreen());

/// A new vehicle with the website's required details: chassis and plate
/// (unique; stored upper case), type, year, battery range, colour, price,
/// and up to 7 photos.
class VehicleFormScreen extends StatefulWidget {
  const VehicleFormScreen({super.key});

  @override
  State<VehicleFormScreen> createState() => _VehicleFormScreenState();
}

class _VehicleFormScreenState extends State<VehicleFormScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(), _chassis = TextEditingController(), _plate = TextEditingController();
  final _year = TextEditingController(), _range = TextEditingController(), _color = TextEditingController();
  final _price = TextEditingController();
  String? _type;
  final List<CarPhoto> _photos = [];
  bool _saving = false, _picking = false;

  @override
  void dispose() {
    for (final c in [_name, _chassis, _plate, _year, _range, _color, _price]) {
      c.dispose();
    }
    super.dispose();
  }

  static String _id(String v) => v.trim().replaceAll(RegExp(r'\s+'), ' ').toUpperCase();

  Future<void> _addPhotos() async {
    if (_picking) return;
    setState(() => _picking = true);
    try {
      final picked = await pickPhotos(context, room: maxCarPhotos - _photos.length);
      if (mounted) setState(() => _photos.addAll(picked.take(maxCarPhotos - _photos.length)));
    } catch (_) {
      if (mounted) _say(context, T.of(context)('photo.unreadable'));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _save() async {
    final t = T.of(context);
    if (!_form.currentState!.validate()) return;
    if (_type == null) return _say(context, t('vehicle.need_type'));
    final s = SessionScope.of(context);
    final price = parseAmount(_price.text) ?? 0;
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      // Car companies don't track cost: the API needs one, so the price is used (as on the website).
      'cost_price': price,
      'selling_price': price,
      'quantity': 1,
      'attributes': jsonEncode({
        'chassis_no': _id(_chassis.text),
        'plate_no': _id(_plate.text),
        'car_type': _type,
        'year': _year.text.trim(),
        'battery_range': _range.text.trim(),
        'color': _color.text.trim(),
      }),
      if (_photos.isNotEmpty) ...{'images': jsonEncode([for (final x in _photos) x.photo]), 'thumbnail': _photos.first.thumb},
    };
    setState(() => _saving = true);
    try {
      final res = await s.api.post('${Svc.products}/products', body);
      final data = (res as Map?)?['data'];
      if (!mounted) return;
      _say(context, t('vehicle.added'));
      Navigator.pop(context, data is Map ? Map<String, dynamic>.from(data) : body);
    } on ApiException catch (e) {
      if (mounted) _say(context, e.status == 409 ? t('vehicle.duplicate') : errorText(t, e));
    } catch (e) {
      if (mounted) _say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final s = SessionScope.of(context);
    String? need(String? v) => (v ?? '').trim().isEmpty ? t('vehicle.required') : null;
    return _FormPage(
      title: t('vehicle.new'),
      formKey: _form,
      saving: _saving,
      saveLabel: t('form.save'),
      onSave: _save,
      children: [
        _Field(t('vehicle.name'), _text(_name, hint: 'Toyota RAV4', validator: need)),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _Field(t('detail.chassis'), _text(_chassis, hint: 'LGXCE4CB0P…', caps: false, validator: need))),
          const SizedBox(width: 10),
          Expanded(child: _Field(t('detail.plate'), _text(_plate, hint: 'RAC 123 A', caps: false, validator: need))),
        ]),
        _Field(
          t('detail.type'),
          _Choices<String>(
            options: [for (final k in carTypes) (k, t('vehicle.type_$k'))],
            value: _type,
            onChanged: (v) => setState(() => _type = v),
          ),
        ),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: _Field(
              t('detail.year'),
              TextFormField(
                controller: _year,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
                decoration: const InputDecoration(hintText: '2023'),
                validator: (v) {
                  final y = int.tryParse((v ?? '').trim());
                  return y == null || y < 1950 || y > DateTime.now().year + 1 ? t('vehicle.need_year') : null;
                },
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _Field(
              t('vehicle.range'),
              TextFormField(
                controller: _range,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(hintText: '400', suffixText: 'km'),
                validator: need,
              ),
            ),
          ),
        ]),
        _Field(t('detail.colour'), _text(_color, hint: t('vehicle.color_hint'), validator: need)),
        _Field(t('form.selling_price'),
            _moneyField(_price, suffix: s.currency, validator: (v) => (parseAmount(v ?? '') ?? 0) <= 0 ? t('form.need_price') : null)),
        _Field(
          '${t('form.photos')} (${_photos.length}/$maxCarPhotos)',
          _PhotoStrip(
            photos: _photos,
            busy: _picking,
            onAdd: _photos.length < maxCarPhotos ? _addPhotos : null,
            onRemove: (i) => setState(() => _photos.removeAt(i)),
          ),
          hint: t('form.photos_hint'),
        ),
      ],
    );
  }
}
