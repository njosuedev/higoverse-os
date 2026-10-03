import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
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
  String? _error;
  String _status = 'all'; // car dealers: all | available | pending | sold | penalties

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_page == 0 && !_loading && _error == null) _reload();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _items.clear();
    _page = 0;
    _total = 0;
    _error = null;
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || (_page > 0 && _items.length >= _total)) return;
    final s = SessionScope.of(context);
    setState(() => _loading = true);
    try {
      final q = <String, String>{'page': '${_page + 1}', 'limit': '$_pageSize'};
      if (_search.text.trim().isNotEmpty) q['q'] = _search.text.trim();
      if (s.isCar && _status != 'all') q['status'] = _status;
      final res = await s.api.get('${Svc.products}/products', query: q);
      final data = (res as Map)['data'] as Map? ?? {};
      if (!mounted) return;
      setState(() {
        _items.addAll((data['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)));
        _total = (data['total'] as num? ?? 0).toInt();
        _page++;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => setState(() => _reload()));
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.isCar ? 'Vehicles' : 'Stock')),
      body: Column(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
          child: Column(children: [
            TextField(
              controller: _search,
              onChanged: _onSearch,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: s.isCar ? 'Search by name, plate or chassis' : 'Search by name or barcode',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear',
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _search.clear();
                          setState(() => _reload());
                        }),
              ),
            ),
            if (s.isCar) ...[
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final f in const [('all', 'All'), ('available', 'Available'), ('pending', 'Pending'), ('sold', 'Sold'), ('penalties', 'Has fines')])
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(f.$2),
                        selected: _status == f.$1,
                        onSelected: (_) => setState(() {
                          _status = f.$1;
                          _reload();
                        }),
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
                ? ListView(children: [EmptyState(icon: Icons.cloud_off_outlined, message: _error!, onRetry: () => setState(() => _reload()))])
                : !_loading && _items.isEmpty
                    ? ListView(children: [
                        EmptyState(
                            icon: s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined,
                            message: _search.text.isEmpty ? 'Nothing here yet.' : 'No match for "${_search.text}".'),
                      ])
                    : ListView.separated(
                        controller: _scroll,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        itemCount: _items.length + (_loading ? 1 : 0),
                        separatorBuilder: (_, __) => const Divider(indent: 16, endIndent: 16),
                        itemBuilder: (context, i) => i >= _items.length
                            ? const Padding(padding: EdgeInsets.all(18), child: Center(child: CircularProgressIndicator(strokeWidth: 2.4)))
                            : _ProductRow(item: _items[i], session: s),
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
    final status = qty <= 0 ? ('Sold', Brand.faint) : (a['sale_status'] == 'pending' ? ('Pending', Brand.warning) : ('Available', Brand.success));
    final fines = int.tryParse(a['penalty_count'] ?? '') ?? 0;
    final sub = isCar
        ? [a['year'], a['color'], a['plate_no']].where((x) => x != null && x.isNotEmpty).join(' · ')
        : (qty <= 0 ? 'Out of stock' : '$qty in stock');
    return ListTile(
      onTap: () => _showDetails(context),
      leading: _Thumb(item['thumbnail'] as String?, isCar),
      title: Text('${item['name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          if (isCar) StatusChip(status.$1, status.$2),
          if (isCar && fines > 0) StatusChip('$fines ${fines == 1 ? 'fine' : 'fines'}', Brand.danger),
          if (sub.isNotEmpty) Text(sub, style: TextStyle(color: !isCar && qty <= session.lowStock ? Brand.warning : Brand.muted)),
        ]),
      ),
      trailing: Text(money(item['selling_price'] as num? ?? 0, session.currency), style: const TextStyle(fontWeight: FontWeight.w700)),
    );
  }

  void _showDetails(BuildContext context) {
    final a = attributesOf(item['attributes']);
    final rows = <(String, String)>[
      ('Price', money(item['selling_price'] as num? ?? 0, session.currency)),
      ('In stock', '${item['quantity'] ?? 0}'),
      if (session.isCar) ...[
        ('Plate', a['plate_no'] ?? ''),
        ('Chassis', a['chassis_no'] ?? ''),
        ('Year', a['year'] ?? ''),
        ('Colour', a['color'] ?? ''),
        ('Type', a['car_type'] ?? ''),
        if (a['sale_status'] == 'pending') ...[
          ('Buyer', [a['buyer_name'], a['buyer_phone']].where((x) => x != null && x.isNotEmpty).join(' · ')),
          ('Buyer ID', a['buyer_id_no'] ?? ''),
        ],
        if ((int.tryParse(a['penalty_count'] ?? '') ?? 0) > 0)
          ('Fines', '${a['penalty_count']} · ${groupDigits(num.tryParse(a['penalty_amount'] ?? '') ?? 0)} ${session.currency}'),
      ] else if ((item['barcode'] ?? '').toString().isNotEmpty)
        ('Barcode', '${item['barcode']}'),
    ].where((r) => r.$2.isNotEmpty).toList();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${item['name'] ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            for (final r in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SizedBox(width: 96, child: Text(r.$1, style: const TextStyle(color: Brand.muted, fontWeight: FontWeight.w600))),
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
                color: Brand.paper,
                child: Icon(isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined, color: Brand.faint, size: 20)),
      ),
    );
  }
}
