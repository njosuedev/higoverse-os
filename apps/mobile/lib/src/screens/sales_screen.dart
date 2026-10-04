import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
import '../i18n.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Sales for a period (7 days by default, like the website).
class SalesScreen extends StatefulWidget {
  const SalesScreen({super.key});

  @override
  State<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends State<SalesScreen> {
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
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final gen = ++_gen;
    setState(() {
      _items.clear();
      _page = 0;
      _total = 0;
      _error = null;
      _summary = null;
      _loading = false;
    });
    final s = SessionScope.of(context);
    final range = lastDays(_days);
    s.api.get('${Svc.sales}/sales/summary', query: {'from_date': range.from, 'to_date': range.to}).then((r) {
      if (mounted && gen == _gen) setState(() => _summary = Map<String, dynamic>.from((r as Map)['data'] as Map? ?? {}));
    }, onError: (_) {
      if (mounted && gen == _gen) setState(() => _summary = const {});
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || (_page > 0 && _items.length >= _total)) return;
    final s = SessionScope.of(context);
    final range = lastDays(_days);
    final gen = _gen;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await s.api.get('${Svc.sales}/sales',
          query: {'page': '${_page + 1}', 'limit': '25', 'from_date': range.from, 'to_date': range.to});
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

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final sum = _summary;
    return Scaffold(
      appBar: AppBar(title: Text(t('nav.sales'))),
      body: Column(children: [
        Container(
          color: Hgv.of(context).surface,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SegmentedButton<int>(
              segments: [for (final p in _periods) ButtonSegment(value: p.$1, label: Text(t(p.$2), maxLines: 1, overflow: TextOverflow.ellipsis))],
              selected: {_days},
              showSelectedIcon: false,
              onSelectionChanged: (v) {
                _days = v.first;
                _reload();
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
                              final pm = '${r['payment_method'] ?? 'cash'}';
                              return ListTile(
                                title: Text('${r['product_name'] ?? t('sale.default')}',
                                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                                subtitle: Text(
                                    '${r['quantity'] ?? 1} × ${groupDigits(r['unit_price'] as num? ?? 0)} · ${_payLabel(t, pm)} · ${t.dateTime(r['created_at'] as String?)}'),
                                trailing: Text(money(r['total_amount'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                              );
                            },
                          ),
          ),
        ),
      ]),
    );
  }

  static String _payLabel(T t, String m) =>
      const {'cash', 'mtn', 'airtel', 'bank', 'card', 'debt'}.contains(m) ? t('pm.$m') : m;
}
