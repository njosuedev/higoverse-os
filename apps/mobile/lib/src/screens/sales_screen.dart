import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';

/// Sales for a period (7 days by default, like the website), by day.
/// New sales appear at the top as they are made.
class SalesScreen extends StatefulWidget {
  const SalesScreen({super.key});

  @override
  State<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends State<SalesScreen> with LiveListener {
  static const _periods = [(1, 'sales.today'), (7, 'sales.7d'), (30, 'sales.30d')];
  int _days = 7;
  final List<Map<String, dynamic>> _items = [];
  Map<String, dynamic>? _summary;
  int _page = 0, _total = 0;
  bool _loading = false;
  Object? _error;

  /// Bumped by every reload: answers for a previous period are dropped.
  int _gen = 0;
  final _scroll = ScrollController();

  /// Live sales waiting behind the "new sales" pill (list scrolled down).
  int _waiting = 0;
  final Set<String> _flash = {};
  final _summarySoon = Debouncer(const Duration(milliseconds: 700));

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_error == null && _scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
      if (_waiting > 0 && _scroll.position.pixels < 40) _reload(quiet: true);
    });
  }

  bool get _atTop => !_scroll.hasClients || _scroll.position.pixels < 80;

  @override
  void onLive(LiveEvent e) {
    final id = '${e.data['id'] ?? ''}';
    switch (e.type) {
      case 'sale.created':
        if (_items.any((x) => x['id'] == id)) return;
        if (_atTop) {
          final sale = {...e.data, if (e.data['created_at'] == null) 'created_at': e.at.toUtc().toIso8601String()};
          setState(() {
            _items.insert(0, sale);
            _total++;
            _flash.add(id);
          });
        } else {
          setState(() => _waiting++);
        }
        _summarySoon(_loadSummary);
      case 'sale.updated':
        final i = _items.indexWhere((x) => x['id'] == id);
        if (i >= 0) setState(() => _items[i] = {..._items[i], ...e.data, 'created_at': _items[i]['created_at']});
        _summarySoon(_loadSummary);
      case 'sale.deleted':
        final before = _items.length;
        setState(() => _items.removeWhere((x) => x['id'] == id));
        if (_items.length < before) _total--;
        _summarySoon(_loadSummary);
      case 'resync':
        _reload(quiet: true);
    }
  }

  void _showWaiting() {
    if (_scroll.hasClients) _scroll.animateTo(0, duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
    _reload(quiet: true);
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
    _summarySoon.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// [quiet]: keep what is on screen until the new page arrives (live
  /// refreshes) instead of showing placeholders.
  Future<void> _reload({bool quiet = false}) async {
    final gen = ++_gen;
    final known = _items.map((x) => x['id']).toSet();
    setState(() {
      if (!quiet) {
        _items.clear();
        _summary = null;
      }
      _page = 0;
      _total = 0;
      _error = null;
      _loading = false;
      _waiting = 0;
    });
    _loadSummary();
    await _loadMore(replace: quiet, gen: gen);
    // Highlight what arrived since.
    if (quiet && mounted && gen == _gen && known.isNotEmpty) {
      setState(() => _flash.addAll(_items.map((x) => '${x['id']}').where((id) => !known.contains(id))));
    }
  }

  void _loadSummary() {
    final gen = _gen;
    final s = SessionScope.of(context);
    final range = lastDays(_days);
    s.api.get('${Svc.sales}/sales/summary', query: {'from_date': range.from, 'to_date': range.to}).then((r) {
      if (mounted && gen == _gen) setState(() => _summary = Map<String, dynamic>.from((r as Map)['data'] as Map? ?? {}));
    }, onError: (_) {
      if (mounted && gen == _gen) setState(() => _summary ??= const {});
    });
  }

  Future<void> _loadMore({bool replace = false, int? gen}) async {
    if (!replace && (_loading || (_page > 0 && _items.length >= _total))) return;
    final s = SessionScope.of(context);
    final range = lastDays(_days);
    gen ??= _gen;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await s.api.get('${Svc.sales}/sales',
          query: {'page': '${_page + 1}', 'limit': '25', 'from_date': range.from, 'to_date': range.to});
      final data = (res as Map)['data'] as Map? ?? {};
      if (!mounted || gen != _gen) return;
      final page = (data['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      setState(() {
        if (replace) _items.clear();
        // Sales added live shift the pages by a row or two: skip repeats.
        final have = _items.map((x) => x['id']).toSet();
        _items.addAll(page.where((x) => !have.contains(x['id'])));
        _total = (data['total'] as num? ?? 0).toInt();
        _page++;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    } finally {
      if (mounted && gen == _gen) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final sum = _summary;
    return Scaffold(
      body: Column(children: [
        Container(
          color: Hgv.of(context).chrome,
          padding: const EdgeInsets.fromLTRB(10, 2, 10, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SegmentedButton<int>(
              segments: [for (final p in _periods) ButtonSegment(value: p.$1, label: Text(t(p.$2), maxLines: 1, overflow: TextOverflow.ellipsis))],
              selected: {_days},
              showSelectedIcon: false,
              onSelectionChanged: (v) {
                _days = v.first;
                _reload();
                if (_scroll.hasClients) _scroll.jumpTo(0);
              },
            ),
            const SizedBox(height: 12),
            // The two figures, or their placeholders while the summary loads.
            if (sum == null)
              Shimmer(
                child: Row(children: [
                  const Expanded(child: FigureTileSkeleton(detail: false)),
                  if (s.canSeeFinancials) ...const [SizedBox(width: 10), Expanded(child: FigureTileSkeleton(detail: false))],
                ]),
              )
            else
              Row(children: [
                Expanded(
                  child: FigureTile(
                    label: t('dash.sales'),
                    value: sum.isEmpty ? '-' : groupDigits(sum['sales_count'] as num? ?? 0),
                    icon: Icons.receipt_long_outlined,
                  ),
                ),
                if (s.canSeeFinancials) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: FigureTile(
                      label: t('dash.revenue'),
                      value: sum.isEmpty ? '-' : money(sum['revenue'] as num? ?? 0, s.currency),
                      icon: Icons.trending_up,
                    ),
                  ),
                ],
              ]),
          ]),
        ),
        const Divider(),
        Expanded(
          child: Stack(alignment: Alignment.topCenter, children: [
          RefreshIndicator(
            onRefresh: () => _reload(quiet: true),
            child: _error != null && _items.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _reload)])
                : _loading && _items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        children: const [ListSkeleton(count: 9)])
                    : _items.isEmpty
                        ? ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: [EmptyState(icon: Icons.receipt_long_outlined, message: t('sales.none'))])
                        : ListView.separated(
                            controller: _scroll,
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            itemCount: _items.length + (_loading || _error != null ? 1 : 0),
                            separatorBuilder: (_, __) => const Divider(indent: 16, endIndent: 16),
                            itemBuilder: (context, i) {
                              if (i >= _items.length) {
                                return _error != null
                                    ? EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _loadMore)
                                    : const LoadMoreIndicator();
                              }
                              final r = _items[i];
                              final when = parseTimestamp(r['created_at']);
                              final prev = i == 0 ? null : parseTimestamp(_items[i - 1]['created_at']);
                              final newDay = when != null && (prev == null || daysAgo(prev) != daysAgo(when));
                              final tile = Flash(
                                key: ValueKey(r['id']),
                                flash: _flash.remove('${r['id']}'),
                                child: ListTile(
                                  onTap: () => showSaleSheet(context, r),
                                  title: Text('${r['product_name'] ?? t('sale.default')}',
                                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                                  subtitle: Text(
                                      '${r['quantity'] ?? 1} × ${groupDigits(r['unit_price'] as num? ?? 0)} · ${payLabel(t, r['payment_method'] as String?)} · ${_time(when)}'),
                                  trailing: Text(money(r['total_amount'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                                ),
                              );
                              if (!newDay) return tile;
                              return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                                Padding(
                                  padding: EdgeInsets.fromLTRB(12, i == 0 ? 6 : 12, 12, 2),
                                  child: Text(_dayLabel(t, when),
                                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Hgv.of(context).muted)),
                                ),
                                tile,
                              ]);
                            },
                          ),
          ),
          if (_waiting > 0)
            Positioned(
              top: 10,
              child: NewItemsPill(
                label: _waiting == 1 ? t('sales.new_one') : t('sales.new_n', {'n': _waiting}),
                onTap: _showWaiting,
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  static String _time(DateTime? d) =>
      d == null ? '' : '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  static String _dayLabel(T t, DateTime? d) {
    if (d == null) return '';
    final n = daysAgo(d);
    if (n == 0) return t('act.today');
    if (n == 1) return t('act.yesterday');
    return '${t.weekday(d.weekday)} ${t.date(d)}';
  }
}
