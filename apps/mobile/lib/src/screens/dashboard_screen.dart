import 'dart:async';

import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Home: the last 7 days at a glance — same figures as the website's home.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, required this.onOpenTab});
  final ValueChanged<int> onOpenTab;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _sales, _stock;
  List<Map<String, dynamic>> _alerts = [], _recent = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;
  ValueNotifier<int>? _tick;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _stock == null && _error == null) _load();
    if (_tick == null) {
      _tick = SessionScope.of(context).refreshTick..addListener(_load);
      // Keep the figures current while the app is open.
      _timer = Timer.periodic(const Duration(minutes: 1), (_) => _load());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _tick?.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    final s = SessionScope.of(context);
    final week = lastDays(7);
    setState(() => _error = null);
    try {
      final r = await Future.wait([
        s.api.get('${Svc.sales}/sales/summary', query: {'from_date': week.from, 'to_date': week.to}),
        s.api.get('${Svc.products}/products/summary', query: {'threshold': '${s.lowStock}'}),
        s.api.get('${Svc.products}/products/stock-alerts', query: {'threshold': '${s.lowStock}'}),
        s.api.get('${Svc.sales}/sales', query: {'page': '1', 'limit': '5'}),
      ]);
      if (!mounted) return;
      setState(() {
        _sales = Map<String, dynamic>.from((r[0] as Map)['data'] as Map? ?? {});
        _stock = Map<String, dynamic>.from((r[1] as Map)['data'] as Map? ?? {});
        final alerts = ((r[2] as Map)['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList()
          ..sort((a, b) => (a['quantity'] as num? ?? 0).compareTo(b['quantity'] as num? ?? 0));
        _alerts = alerts.take(6).toList();
        _recent = (((r[3] as Map)['data'] as Map?)?['items'] as List? ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final greeting = DateTime.now().hour < 12 ? 'Good morning' : (DateTime.now().hour < 18 ? 'Good afternoon' : 'Good evening');
    return Scaffold(
      appBar: AppBar(
        title: Text(s.shop?.name ?? 'Higoverse', overflow: TextOverflow.ellipsis),
        actions: [IconButton(tooltip: 'Refresh', onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          Text('$greeting, ${s.user?.name.split(' ').first ?? ''}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text('Last 7 days', style: TextStyle(color: Hgv.of(context).muted, fontWeight: FontWeight.w500)),
          if (_error != null)
            EmptyState(icon: Icons.cloud_off_outlined, message: _error!, onRetry: _load)
          else if (_loading)
            ..._skeleton()
          else
            ..._content(s),
        ]),
      ),
    );
  }

  List<Widget> _skeleton() => [
        const SizedBox(height: 14),
        Row(children: const [Expanded(child: SkeletonBox(height: 84)), SizedBox(width: 10), Expanded(child: SkeletonBox(height: 84))]),
        const SizedBox(height: 10),
        Row(children: const [Expanded(child: SkeletonBox(height: 84)), SizedBox(width: 10), Expanded(child: SkeletonBox(height: 84))]),
        const SizedBox(height: 22),
        for (var i = 0; i < 4; i++) ...[const SkeletonBox(height: 56), const SizedBox(height: 8)],
      ];

  List<Widget> _content(Session s) {
    final sales = _sales ?? {}, stock = _stock ?? {};
    final low = (stock['low_stock'] as num? ?? 0) + (stock['out_of_stock'] as num? ?? 0);
    final figures = <Widget>[
      if (s.canSeeFinancials)
        FigureTile(
          label: 'Revenue',
          value: money(sales['revenue'] as num? ?? 0, s.currency),
          icon: Icons.trending_up,
          color: Hgv.of(context).success,
        ),
      FigureTile(label: 'Sales', value: groupDigits(sales['sales_count'] as num? ?? 0), detail: 'transactions', icon: Icons.point_of_sale_outlined),
      FigureTile(
        label: s.isCar ? 'Vehicles' : 'Products',
        value: groupDigits(stock['total_products'] as num? ?? 0),
        icon: s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined,
      ),
      FigureTile(
        label: 'Need restock',
        value: groupDigits(low),
        icon: Icons.warning_amber_rounded,
        color: low > 0 ? Hgv.of(context).warning : null,
      ),
      if (s.isCar) ...[
        FigureTile(label: 'Pending', value: groupDigits(stock['pending'] as num? ?? 0), detail: 'awaiting transfer', icon: Icons.schedule, color: Hgv.of(context).warning),
        FigureTile(label: 'With fines', value: groupDigits(stock['with_penalties'] as num? ?? 0), icon: Icons.gpp_maybe_outlined, color: Hgv.of(context).danger),
      ],
    ];
    return [
      const SizedBox(height: 14),
      GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.75,
        children: figures,
      ),
      SectionTitle('Stock alerts', trailing: TextButton(onPressed: () => widget.onOpenTab(1), child: const Text('View all'))),
      if (_alerts.isEmpty)
        Card(child: ListTile(leading: Icon(Icons.check_circle, color: Hgv.of(context).success), title: Text('All stock is healthy')))
      else
        Card(
          child: Column(children: [
            for (final a in _alerts)
              ListTile(
                dense: true,
                leading: CircleAvatar(
                  radius: 16,
                  backgroundColor: ((a['quantity'] as num? ?? 0) <= 0 ? Hgv.of(context).danger : Hgv.of(context).warning).withValues(alpha: 0.12),
                  child: Text('${a['quantity'] ?? 0}',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: (a['quantity'] as num? ?? 0) <= 0 ? Hgv.of(context).danger : Hgv.of(context).warning)),
                ),
                title: Text('${a['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text((a['quantity'] as num? ?? 0) <= 0 ? 'Out of stock' : '${a['quantity']} left'),
                trailing: Text(money(a['selling_price'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
          ]),
        ),
      SectionTitle('Recent sales', trailing: TextButton(onPressed: () => widget.onOpenTab(2), child: const Text('View all'))),
      if (_recent.isEmpty)
        const Card(child: ListTile(leading: Icon(Icons.receipt_long_outlined), title: Text('No sales yet')))
      else
        Card(
          child: Column(children: [
            for (final r in _recent)
              ListTile(
                dense: true,
                title: Text('${r['product_name'] ?? 'Sale'}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${r['quantity'] ?? 1} × · ${shortDateTime(r['created_at'] as String?)}'),
                trailing: Text(money(r['total_amount'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
          ]),
        ),
    ];
  }
}
