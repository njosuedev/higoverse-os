import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
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
  static const _periods = [(1, 'Today'), (7, '7 days'), (30, '30 days')];
  int _days = 7;
  final List<Map<String, dynamic>> _items = [];
  Map<String, dynamic>? _summary;
  int _page = 0, _total = 0;
  bool _loading = false;
  String? _error;
  final _scroll = ScrollController();

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
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _items.clear();
    _page = 0;
    _total = 0;
    _error = null;
    _summary = null;
    final s = SessionScope.of(context);
    final range = lastDays(_days);
    s.api
        .get('${Svc.sales}/sales/summary', query: {'from_date': range.from, 'to_date': range.to})
        .then((r) => mounted ? setState(() => _summary = Map<String, dynamic>.from((r as Map)['data'] as Map? ?? {})) : null)
        .catchError((_) => null);
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || (_page > 0 && _items.length >= _total)) return;
    final s = SessionScope.of(context);
    final range = lastDays(_days);
    setState(() => _loading = true);
    try {
      final res = await s.api.get('${Svc.sales}/sales',
          query: {'page': '${_page + 1}', 'limit': '25', 'from_date': range.from, 'to_date': range.to});
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

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Sales')),
      body: Column(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SegmentedButton<int>(
              segments: [for (final p in _periods) ButtonSegment(value: p.$1, label: Text(p.$2))],
              selected: {_days},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() {
                _days = v.first;
                _reload();
              }),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: FigureTile(
                  label: 'Sales',
                  value: _summary == null ? '-' : groupDigits(_summary!['sales_count'] as num? ?? 0),
                  icon: Icons.receipt_long_outlined,
                ),
              ),
              if (s.canSeeFinancials) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: FigureTile(
                    label: 'Revenue',
                    value: _summary == null ? '-' : money(_summary!['revenue'] as num? ?? 0, s.currency),
                    icon: Icons.trending_up,
                    color: Brand.success,
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
                ? ListView(children: [EmptyState(icon: Icons.cloud_off_outlined, message: _error!, onRetry: () => setState(() => _reload()))])
                : !_loading && _items.isEmpty
                    ? ListView(children: const [EmptyState(icon: Icons.receipt_long_outlined, message: 'No sales in this period.')])
                    : ListView.separated(
                        controller: _scroll,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        itemCount: _items.length + (_loading ? 1 : 0),
                        separatorBuilder: (_, __) => const Divider(indent: 16, endIndent: 16),
                        itemBuilder: (context, i) {
                          if (i >= _items.length) {
                            return const Padding(padding: EdgeInsets.all(18), child: Center(child: CircularProgressIndicator(strokeWidth: 2.4)));
                          }
                          final r = _items[i];
                          final pm = '${r['payment_method'] ?? 'cash'}';
                          return ListTile(
                            title: Text('${r['product_name'] ?? 'Sale'}',
                                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text('${r['quantity'] ?? 1} × ${groupDigits(r['unit_price'] as num? ?? 0)} · ${_payLabel(pm)} · ${shortDateTime(r['created_at'] as String?)}'),
                            trailing: Text(money(r['total_amount'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                          );
                        },
                      ),
          ),
        ),
      ]),
    );
  }

  static String _payLabel(String m) => const {
        'cash': 'Cash',
        'mtn': 'MTN',
        'airtel': 'Airtel',
        'bank': 'Bank',
        'card': 'Card',
        'debt': 'Credit',
      }[m] ??
      m;
}
