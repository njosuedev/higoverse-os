import 'package:flutter/material.dart';

import '../car_stock.dart';
import '../config.dart';
import '../format.dart';
import '../forms.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';

/// Stock (shops) or Vehicles (car dealers): searchable, loads more as you
/// scroll. Quantities and prices change in place as sales and restocks happen.
class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key, this.filter});

  /// Set from Home (e.g. "pending") to open the list already filtered.
  final ValueNotifier<String?>? filter;

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> with LiveListener {
  static const _pageSize = 20;
  final _scroll = ScrollController();
  final List<Map<String, dynamic>> _items = [];
  int _page = 0, _total = 0;
  bool _loading = false;
  Object? _error;

  /// Bumped by every reload: answers to an older search or filter are dropped.
  int _gen = 0;
  String _status = 'all'; // car dealers: all | available | pending | sold | penalties | unassigned

  /// Car dealers: each car name once with its count (default), or every car.
  bool _byName = true;

  /// Makes the car-names view reload. (Searching is the app's one search,
  /// at the top of Home.)
  int _refreshKey = 0;

  /// Items added elsewhere since this list loaded (shown as a pill).
  bool _newItems = false;
  final Set<String> _flash = {};

  @override
  void onLive(LiveEvent e) {
    final id = '${e.data['id'] ?? ''}';
    switch (e.type) {
      case 'product.updated':
        final i = _items.indexWhere((x) => '${x['id']}' == id);
        if (i < 0) return;
        final d = e.data;
        setState(() {
          _items[i] = {
            ..._items[i],
            for (final k in const ['name', 'quantity', 'selling_price', 'category', 'barcode', 'attributes'])
              if (d.containsKey(k) && d[k] != null) k: d[k],
          };
          _flash.add(id);
        });
      case 'product.deleted':
        final before = _items.length;
        setState(() => _items.removeWhere((x) => '${x['id']}' == id));
        if (_items.length < before) _total--;
      case 'product.created' || 'product.stocked':
        setState(() => _newItems = true);
      case 'resync':
        _reload();
    }
  }

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
      widget.filter?.addListener(_onFilter);
      _reload();
    }
  }

  void _onFilter() {
    final f = widget.filter?.value;
    if (f == null) return;
    widget.filter!.value = null;
    _status = f;
    if (_scroll.hasClients) _scroll.jumpTo(0);
    _reload();
  }

  @override
  void dispose() {
    _tick?.removeListener(_onResume);
    widget.filter?.removeListener(_onFilter);
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _gen++;
    setState(() {
      _refreshKey++;
      _newItems = false;
      _items.clear();
      _page = 0;
      _total = 0;
      _error = null;
      _loading = false;
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    final s = SessionScope.of(context);
    // The car-names view loads its own list.
    if (s.isCar && _byName) return;
    if (_loading || (_page > 0 && _items.length >= _total)) return;
    final gen = _gen;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Shops: Home's "need restock" opens what is low or sold out (as the
      // website's /items?stock=low), lowest first, all at once.
      if (!s.isCar && _status == 'low') {
        final res = await s.api.get('${Svc.products}/products/stock-alerts', query: {'threshold': '${s.lowStock}'});
        final list = ((res as Map)['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList()
          ..sort((a, b) => (a['quantity'] as num? ?? 0).compareTo(b['quantity'] as num? ?? 0));
        if (!mounted || gen != _gen) return;
        setState(() {
          _items.addAll(list);
          _total = list.length;
          _page++;
        });
        return;
      }
      final q = <String, String>{'page': '${_page + 1}', 'limit': '$_pageSize'};
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

  /// Car dealers add one vehicle at a time, with its chassis and plate.
  Future<void> _add() async {
    final s = SessionScope.of(context);
    final saved = s.isCar ? await addVehicle(context) : await editProduct(context);
    if (saved != null && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'product',
        onPressed: _add,
        icon: const Icon(Icons.add),
        label: Text(s.isCar ? t('vehicle.new') : t('form.new_product')),
      ),
      body: Column(children: [
        if (!s.isCar && _status == 'low') ...[
          Container(
            color: Hgv.of(context).chrome,
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
            alignment: Alignment.centerLeft,
            child: InputChip(
              avatar: Icon(Icons.warning_rounded, size: 18, color: Hgv.of(context).warning),
              label: Text(t('dash.need_restock')),
              selected: true,
              showCheckmark: false,
              onDeleted: () {
                _status = 'all';
                _reload();
              },
            ),
          ),
          const Divider(),
        ],
        if (s.isCar) ...[
        Container(
          color: Hgv.of(context).chrome,
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          child: Column(children: [
              SegmentedButton<bool>(
                showSelectedIcon: false,
                style: const ButtonStyle(visualDensity: VisualDensity.compact, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                segments: [
                  ButtonSegment(value: true, icon: const Icon(Icons.view_agenda_outlined, size: 18), label: Text(t('models.view_by_name'))),
                  ButtonSegment(value: false, icon: const Icon(Icons.list_rounded, size: 18), label: Text(t('models.view_all'))),
                ],
                selected: {_byName},
                onSelectionChanged: (v) {
                  setState(() => _byName = v.first);
                  _reload();
                },
              ),
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
                    ('unassigned', 'stock.f_no_ids'),
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
            ]),
          ),
          const Divider(),
        ],
        Expanded(
          child: Stack(alignment: Alignment.topCenter, children: [
          if (s.isCar && _byName)
            CarModelsView(query: '', status: _status, refreshKey: _refreshKey, onChanged: () => setState(() => _refreshKey++))
          else
          RefreshIndicator(
            onRefresh: _reload,
            child: SkeletonGate(
              loading: _loading && _items.isEmpty && _error == null,
              skeleton: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  children: [ListSkeleton(count: 9, leading: RowLead.thumb, chips: s.isCar)]),
              child: _error != null && _items.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _reload)])
                    : _items.isEmpty
                        ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
                            EmptyState(
                                icon: s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined,
                                message: t('stock.empty')),
                          ])
                        : ListView.separated(
                            controller: _scroll,
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(0, 6, 0, 88),
                            itemCount: _items.length + (_loading || _error != null ? 1 : 0),
                            separatorBuilder: (_, __) => const Divider(indent: 16, endIndent: 16),
                            itemBuilder: (context, i) => i < _items.length
                                ? Flash(
                                    // Keyed by stock too, so a change flashes again.
                                    key: ValueKey('${_items[i]['id']}:${_items[i]['quantity']}'),
                                    flash: _flash.remove('${_items[i]['id']}'),
                                    child: _ProductRow(item: _items[i], session: s),
                                  )
                                : _error != null
                                    ? EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _loadMore)
                                    : const LoadMoreIndicator(),
                          ),
            ),
          ),
          if (_newItems)
            Positioned(
              top: 10,
              child: NewItemsPill(
                label: t('stock.new_items'),
                onTap: () {
                  if (_scroll.hasClients) _scroll.jumpTo(0);
                  _reload();
                },
              ),
            ),
          ]),
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
      onTap: () => openItem(context, item),
      leading: ProductThumb(item['thumbnail'] as String?, isCar: isCar),
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
}
