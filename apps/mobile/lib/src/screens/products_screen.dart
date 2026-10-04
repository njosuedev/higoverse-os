import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
import '../i18n.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Stock (shops) or Vehicles (car dealers): searchable, loads more as you scroll.
class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key});

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  static const _pageSize = 20;
  final _search = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  final List<Map<String, dynamic>> _items = [];
  int _page = 0, _total = 0;
  bool _loading = false;
  Object? _error;

  /// Bumped by every reload: answers to an older search or filter are dropped.
  int _gen = 0;
  String _status = 'all'; // car dealers: all | available | pending | sold | penalties

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_error == null && _scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
  }

  ValueNotifier<int>? _tick;
  void _onResume() => _reload();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_tick == null) {
      _tick = SessionScope.of(context).refreshTick..addListener(_onResume);
      _reload();
    }
  }

  @override
  void dispose() {
    _tick?.removeListener(_onResume);
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _gen++;
    setState(() {
      _items.clear();
      _page = 0;
      _total = 0;
      _error = null;
      _loading = false;
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || (_page > 0 && _items.length >= _total)) return;
    final s = SessionScope.of(context);
    final gen = _gen;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final q = <String, String>{'page': '${_page + 1}', 'limit': '$_pageSize'};
      if (_search.text.trim().isNotEmpty) q['q'] = _search.text.trim();
      if (s.isCar && _status != 'all') q['status'] = _status;
      final res = await s.api.get('${Svc.products}/products', query: q);
      final data = (res as Map)['data'] as Map? ?? {};
      if (!mounted || gen != _gen) return;
      setState(() {
        _items.addAll((data['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)));
        _total = (data['total'] as num? ?? 0).toInt();
        _page++;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    } finally {
      if (mounted && gen == _gen) setState(() => _loading = false);
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _reload());
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.isCar ? t('nav.vehicles') : t('nav.stock'))),
      body: Column(children: [
        Container(
          color: Hgv.of(context).surface,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
          child: Column(children: [
            TextField(
              controller: _search,
              onChanged: _onSearch,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: s.isCar ? t('stock.search_car') : t('stock.search'),
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: t('app.clear'),
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _search.clear();
                          _reload();
                        }),
              ),
            ),
            if (s.isCar) ...[
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final f in const [
                    ('all', 'stock.f_all'),
                    ('available', 'stock.f_available'),
                    ('pending', 'stock.f_pending'),
                    ('sold', 'stock.f_sold'),
                    ('penalties', 'stock.f_fines'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(t(f.$2)),
                        selected: _status == f.$1,
                        onSelected: (_) {
                          _status = f.$1;
                          _reload();
                        },
                      ),
                    ),
                ]),
              ),
            ],
          ]),
        ),
        const Divider(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _reload,
            child: _error != null && _items.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _reload)])
                : _loading && _items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        children: [ListSkeleton(count: 9, leading: RowLead.thumb, chips: s.isCar)])
                    : _items.isEmpty
                        ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
                            EmptyState(
                                icon: s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined,
                                message: _search.text.isEmpty ? t('stock.empty') : t('stock.no_match', {'q': _search.text})),
                          ])
                        : ListView.separated(
                            controller: _scroll,
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            itemCount: _items.length + (_loading || _error != null ? 1 : 0),
                            separatorBuilder: (_, __) => const Divider(indent: 16, endIndent: 16),
                            itemBuilder: (context, i) => i < _items.length
                                ? _ProductRow(item: _items[i], session: s)
                                : _error != null
                                    ? EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _loadMore)
                                    : const LoadMoreIndicator(),
                          ),
          ),
        ),
      ]),
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({required this.item, required this.session});
  final Map<String, dynamic> item;
  final Session session;

  @override
  Widget build(BuildContext context) {
    final qty = (item['quantity'] as num? ?? 0).toInt();
    final a = attributesOf(item['attributes']);
    final isCar = session.isCar;
    final t = T.of(context);
    final c = Hgv.of(context);
    final status = qty <= 0
        ? (t('stock.f_sold'), c.faint)
        : (a['sale_status'] == 'pending' ? (t('stock.f_pending'), c.warning) : (t('stock.f_available'), c.success));
    final fines = int.tryParse(a['penalty_count'] ?? '') ?? 0;
    final sub = isCar
        ? [a['year'], a['color'], a['plate_no']].where((x) => x != null && x.isNotEmpty).join(' · ')
        : (qty <= 0 ? t('dash.out_of_stock') : t('stock.in_stock_n', {'n': groupDigits(qty)}));
    return ListTile(
      onTap: () => _showDetails(context),
      leading: _Thumb(item['thumbnail'] as String?, isCar),
      title: Text('${item['name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          if (isCar) StatusChip(status.$1, status.$2),
          if (isCar && fines > 0) StatusChip(fines == 1 ? t('stock.fine_one') : t('stock.fines_n', {'n': fines}), c.danger),
          if (sub.isNotEmpty) Text(sub, style: TextStyle(color: !isCar && qty <= session.lowStock ? c.warning : c.muted)),
        ]),
      ),
      trailing: Text(money(item['selling_price'] as num? ?? 0, session.currency), style: const TextStyle(fontWeight: FontWeight.w700)),
    );
  }

  void _showDetails(BuildContext context) {
    final a = attributesOf(item['attributes']);
    final t = T.of(context);
    final rows = <(String, String)>[
      (t('detail.price'), money(item['selling_price'] as num? ?? 0, session.currency)),
      (t('detail.in_stock'), '${item['quantity'] ?? 0}'),
      if (session.isCar) ...[
        (t('detail.plate'), a['plate_no'] ?? ''),
        (t('detail.chassis'), a['chassis_no'] ?? ''),
        (t('detail.year'), a['year'] ?? ''),
        (t('detail.colour'), a['color'] ?? ''),
        (t('detail.type'), a['car_type'] ?? ''),
        if (a['sale_status'] == 'pending') ...[
          (t('detail.buyer'), [a['buyer_name'], a['buyer_phone']].where((x) => x != null && x.isNotEmpty).join(' · ')),
          (t('detail.buyer_id'), a['buyer_id_no'] ?? ''),
        ],
        if ((int.tryParse(a['penalty_count'] ?? '') ?? 0) > 0)
          (t('detail.fines'), '${a['penalty_count']} · ${groupDigits(num.tryParse(a['penalty_amount'] ?? '') ?? 0)} ${session.currency}'),
      ] else if ((item['barcode'] ?? '').toString().isNotEmpty)
        (t('detail.barcode'), '${item['barcode']}'),
    ].where((r) => r.$2.isNotEmpty).toList();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      backgroundColor: Hgv.of(context).surface,
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${item['name'] ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            for (final r in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SizedBox(width: 120, child: Text(r.$1, style: TextStyle(color: Hgv.of(context).muted, fontWeight: FontWeight.w600))),
                  Expanded(child: Text(r.$2, style: const TextStyle(fontWeight: FontWeight.w700))),
                ]),
              ),
          ]),
        ),
      ),
    );
  }
}

/// The product's small photo (a data URL from the API), or an icon.
class _Thumb extends StatelessWidget {
  const _Thumb(this.dataUrl, this.isCar);
  final String? dataUrl;
  final bool isCar;

  static final _cache = <String, Uint8List>{};

  @override
  Widget build(BuildContext context) {
    Uint8List? bytes;
    final d = dataUrl;
    if (d != null && d.startsWith('data:') && d.contains(',')) {
      bytes = _cache[d] ??= (() {
        try {
          return base64Decode(d.substring(d.indexOf(',') + 1));
        } catch (_) {
          return Uint8List(0);
        }
      })();
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: SizedBox(
        width: 52,
        height: 40,
        child: bytes != null && bytes.isNotEmpty
            ? Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true)
            : Container(
                color: Hgv.of(context).paper,
                child: Icon(isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined, color: Hgv.of(context).faint, size: 20)),
      ),
    );
  }
}
