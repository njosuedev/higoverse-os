import 'dart:async';

import 'package:flutter/material.dart';

import '../app_settings.dart';
import '../config.dart';
import '../format.dart';
import '../i18n.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';

/// Search everything from one box, the way messaging apps do: type, pick a
/// filter pill, and results come in sections — vehicles or products, sales,
/// customers who owe money — with the matching text highlighted. An empty
/// box shows recent searches.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

enum _Filter { all, items, sales, customers }

class _SearchScreenState extends State<SearchScreen> {
  final _q = TextEditingController();
  final _focus = FocusNode();
  Timer? _debounce;
  _Filter _filter = _Filter.all;
  bool _loading = false;
  Object? _error;
  int _gen = 0;

  List<Map<String, dynamic>> _items = [], _sales = [], _customers = [];
  int _itemsTotal = 0, _salesTotal = 0;

  /// Debts are few: loaded once, then searched on the phone.
  List<Map<String, dynamic>>? _allDebts;

  String get _query => _q.text.trim();

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _changed(String _) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _run);
  }

  void _use(String q) {
    _q.text = q;
    _q.selection = TextSelection.collapsed(offset: q.length);
    _run();
  }

  Future<void> _run() async {
    final q = _query;
    final gen = ++_gen;
    if (q.isEmpty) {
      setState(() {
        _items = _sales = _customers = [];
        _loading = false;
        _error = null;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = SessionScope.of(context).api;
    List<Map<String, dynamic>> list(dynamic r) =>
        ((((r as Map)['data'] as Map?)?['items'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    int total(dynamic r) => ((((r as Map)['data'] as Map?)?['total'] as num?) ?? 0).toInt();
    try {
      final r = await Future.wait([
        api.get('${Svc.products}/products', query: {'q': q, 'limit': '20', 'page': '1'}),
        api.get('${Svc.sales}/sales', query: {'q': q, 'limit': '10', 'page': '1'}),
        if (_allDebts == null) api.get('${Svc.sales}/debts').catchError((_) => null),
      ]);
      if (r.length > 2) _allDebts = r[2] == null ? const [] : list(r[2]);
      if (!mounted || gen != _gen) return;
      final needle = q.toLowerCase();
      setState(() {
        _items = list(r[0]);
        _itemsTotal = total(r[0]);
        _sales = list(r[1]);
        _salesTotal = total(r[1]);
        _customers = (_allDebts ?? const [])
            .where((d) => '${d['debtor_name'] ?? ''} ${d['phone'] ?? ''}'.toLowerCase().contains(needle))
            .take(10)
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (mounted && gen == _gen) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  void _remember() => AppSettingsScope.of(context).rememberSearch(_query);

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final itemsLabel = s.isCar ? t('nav.vehicles') : t('dash.products');
    return Scaffold(
      backgroundColor: c.chrome,
      appBar: AppBar(
        backgroundColor: c.chrome,
        titleSpacing: 0,
        leading: IconButton(
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: TextField(
          controller: _q,
          focusNode: _focus,
          autofocus: true,
          onChanged: _changed,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) {
            _remember();
            _run();
          },
          cursorColor: c.ink,
          style: const TextStyle(fontSize: 17),
          decoration: InputDecoration(
            hintText: t('search.hint'),
            hintStyle: TextStyle(color: c.faint, fontSize: 17),
            filled: false,
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            contentPadding: EdgeInsets.zero,
          ),
        ),
        actions: [
          if (_q.text.isNotEmpty)
            IconButton(
              tooltip: t('app.clear'),
              icon: const Icon(Icons.close_rounded),
              onPressed: () {
                _q.clear();
                _changed('');
                _focus.requestFocus();
              },
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(50),
          child: Column(children: [
            SizedBox(
              height: 46,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                children: [
                  for (final (f, label, icon) in [
                    (_Filter.all, t('act.f_all'), null),
                    (_Filter.items, itemsLabel, s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined),
                    (_Filter.sales, t('nav.sales'), Icons.receipt_long_outlined),
                    (_Filter.customers, t('search.customers'), Icons.person_outline_rounded),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _FilterPill(
                        label: label,
                        icon: icon,
                        selected: _filter == f,
                        onTap: () => setState(() => _filter = f),
                      ),
                    ),
                ],
              ),
            ),
            _loading ? const LinearProgressIndicator(minHeight: 2) : const Divider(height: 2),
          ]),
        ),
      ),
      body: _body(t, c, s, itemsLabel),
    );
  }

  Widget _body(T t, Hgv c, Session s, String itemsLabel) {
    if (_error != null) return EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _run);
    if (_query.isEmpty) return _recent(t, c, s);
    bool show(_Filter f) => _filter == _Filter.all || _filter == f;
    final sections = <Widget>[
      if (show(_Filter.items) && _items.isNotEmpty) ...[
        _Header(itemsLabel, _itemsTotal),
        for (final item in _items) _ItemResult(item: item, query: _query, onOpen: _remember),
      ],
      if (show(_Filter.sales) && _sales.isNotEmpty) ...[
        _Header(t('nav.sales'), _salesTotal),
        for (final sale in _sales) _SaleResult(sale: sale, query: _query, onOpen: _remember),
      ],
      if (show(_Filter.customers) && _customers.isNotEmpty) ...[
        _Header(t('search.customers'), _customers.length),
        for (final d in _customers) _CustomerResult(debt: d, query: _query, onOpen: _remember),
      ],
    ];
    if (sections.isEmpty) {
      if (_loading) return const SizedBox.shrink();
      return EmptyState(icon: Icons.search_off_rounded, message: t('stock.no_match', {'q': _query}));
    }
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 24),
      children: sections,
    );
  }

  Widget _recent(T t, Hgv c, Session s) {
    final settings = AppSettingsScope.of(context);
    final recent = settings.recentSearches;
    return ListView(padding: const EdgeInsets.only(top: 6), children: [
      if (recent.isEmpty)
        EmptyState(icon: Icons.search_rounded, message: s.isCar ? t('search.prompt_car') : t('search.prompt'))
      else ...[
        _Header(t('search.recent'), null),
        for (final r in recent)
          ListTile(
            leading: Icon(Icons.history_rounded, color: c.faint),
            title: Text(r, style: const TextStyle(fontWeight: FontWeight.w500)),
            trailing: IconButton(
              tooltip: t('app.clear'),
              icon: Icon(Icons.close_rounded, size: 18, color: c.faint),
              onPressed: () => settings.rememberSearch(r, remove: true),
            ),
            onTap: () => _use(r),
          ),
      ],
    ]);
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({required this.label, required this.selected, required this.onTap, this.icon});
  final String label;
  final IconData? icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Material(
      color: selected ? c.ink.withValues(alpha: 0.15) : c.paper,
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[
              Icon(icon, size: 16, color: selected ? c.ink : c.muted),
              const SizedBox(width: 5),
            ],
            Text(label,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: selected ? c.ink : c.muted)),
          ]),
        ),
      ),
    );
  }
}

/// A section title in the results ("Vehicles 12").
class _Header extends StatelessWidget {
  const _Header(this.title, this.count);
  final String title;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Row(children: [
        Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: c.ink)),
        if (count != null) ...[
          const SizedBox(width: 6),
          Text(groupDigits(count!), style: TextStyle(fontSize: 13, color: c.faint, fontWeight: FontWeight.w600)),
        ],
      ]),
    );
  }
}

/// [text] with every occurrence of [query] in bold brand colour.
class Highlighted extends StatelessWidget {
  const Highlighted(this.text, this.query, {super.key, this.style, this.maxLines = 1});
  final String text, query;
  final TextStyle? style;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final base = style ?? DefaultTextStyle.of(context).style;
    final hit = base.copyWith(color: c.ink, fontWeight: FontWeight.w800);
    final spans = <TextSpan>[];
    final lower = text.toLowerCase(), needle = query.toLowerCase();
    var i = 0;
    while (needle.isNotEmpty) {
      final j = lower.indexOf(needle, i);
      if (j < 0) break;
      if (j > i) spans.add(TextSpan(text: text.substring(i, j)));
      spans.add(TextSpan(text: text.substring(j, j + needle.length), style: hit));
      i = j + needle.length;
    }
    if (i < text.length) spans.add(TextSpan(text: text.substring(i)));
    return Text.rich(TextSpan(style: base, children: spans), maxLines: maxLines, overflow: TextOverflow.ellipsis);
  }
}

/// A WhatsApp-like result row: picture, title and line, small text on the right.
class _ResultRow extends StatelessWidget {
  const _ResultRow({required this.leading, required this.title, required this.subtitle, required this.onTap, this.trailing, this.trailingSub});
  final Widget leading, title, subtitle;
  final String? trailing, trailingSub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        child: Row(children: [
          leading,
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              DefaultTextStyle.merge(style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600), child: title),
              const SizedBox(height: 2),
              DefaultTextStyle.merge(style: TextStyle(fontSize: 13.5, color: c.faint), child: subtitle),
            ]),
          ),
          if (trailing != null || trailingSub != null) ...[
            const SizedBox(width: 8),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              if (trailing != null) Text(trailing!, style: TextStyle(fontSize: 12, color: c.faint, fontWeight: FontWeight.w600)),
              if (trailingSub != null) ...[
                const SizedBox(height: 3),
                Text(trailingSub!, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: c.text)),
              ],
            ]),
          ],
        ]),
      ),
    );
  }
}

class _ItemResult extends StatelessWidget {
  const _ItemResult({required this.item, required this.query, required this.onOpen});
  final Map<String, dynamic> item;
  final String query;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final a = attributesOf(item['attributes']);
    final qty = item['quantity'] as num? ?? 0;
    final sub = s.isCar
        ? [a['plate_no'], a['chassis_no'], a['year']].where((x) => x != null && x.isNotEmpty).join(' · ')
        : [if ('${item['barcode'] ?? ''}'.isNotEmpty) '${item['barcode']}', qty <= 0 ? t('dash.out_of_stock') : t('stock.in_stock_n', {'n': groupDigits(qty)})]
            .join(' · ');
    final status = qty <= 0 ? t('stock.f_sold') : (a['sale_status'] == 'pending' ? t('stock.f_pending') : null);
    return _ResultRow(
      onTap: () {
        onOpen();
        showProductSheet(context, item);
      },
      leading: ProductThumb(item['thumbnail'] as String?, isCar: s.isCar, width: 50, height: 50, radius: 25),
      title: Highlighted('${item['name'] ?? ''}', query),
      subtitle: Highlighted(sub, query),
      trailing: s.isCar ? status : null,
      trailingSub: money(item['selling_price'] as num? ?? 0, s.currency),
    );
  }
}

class _SaleResult extends StatelessWidget {
  const _SaleResult({required this.sale, required this.query, required this.onOpen});
  final Map<String, dynamic> sale;
  final String query;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final c = Hgv.of(context);
    final when = parseTimestamp(sale['created_at']);
    return _ResultRow(
      onTap: () {
        onOpen();
        showSaleSheet(context, sale);
      },
      leading: IconAvatar(icon: Icons.receipt_long_rounded, color: c.success, size: 50),
      title: Highlighted('${sale['product_name'] ?? t('sale.default')}', query),
      subtitle: Text('${sale['quantity'] ?? 1} × ${groupDigits(sale['unit_price'] as num? ?? 0)} · ${payLabel(t, sale['payment_method'] as String?)}',
          maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: when == null ? null : (daysAgo(when) == 0 ? t.ago(when) : t.date(when)),
      trailingSub: money(sale['total_amount'] as num? ?? 0, s.currency),
    );
  }
}

class _CustomerResult extends StatelessWidget {
  const _CustomerResult({required this.debt, required this.query, required this.onOpen});
  final Map<String, dynamic> debt;
  final String query;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final name = '${debt['debtor_name'] ?? ''}';
    final balance = debt['balance'] as num? ?? 0;
    return _ResultRow(
      onTap: () {
        onOpen();
        showDebtSheet(context, debt);
      },
      leading: Avatar(name: name, size: 50),
      title: Highlighted(name, query),
      subtitle: Highlighted('${debt['phone'] ?? ''}', query),
      trailing: debt['is_paid'] == true ? t('debts.settled') : t('debts.balance'),
      trailingSub: money(balance, s.currency),
    );
  }
}
