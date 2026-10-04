import 'dart:async';

import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
import '../i18n.dart';
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
  Object? _error;
  Timer? _timer;
  ValueNotifier<int>? _tick;
  Future<void>? _inFlight;

  bool get _hasData => _stock != null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_tick == null) {
      _tick = SessionScope.of(context).refreshTick..addListener(_load);
      // Keep the figures current while the app is open.
      _timer = Timer.periodic(const Duration(minutes: 1), (_) => _load());
      _load();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _tick?.removeListener(_load);
    super.dispose();
  }

  /// One load at a time: a refresh asked for while one is running joins it.
  Future<void> _load() => _inFlight ??= _fetch().whenComplete(() => _inFlight = null);

  Future<void> _fetch() async {
    final s = SessionScope.of(context);
    final week = lastDays(7);
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
        _error = null;
      });
    } catch (e) {
      // Figures already on screen stay; a note says they could not be refreshed.
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final c = Hgv.of(context);
    final hour = DateTime.now().hour;
    final greeting = t(hour < 12 ? 'dash.good_morning' : (hour < 18 ? 'dash.good_afternoon' : 'dash.good_evening'));
    return Scaffold(
      appBar: AppBar(
        title: Text(s.shop?.name ?? 'Higoverse', overflow: TextOverflow.ellipsis),
        actions: [IconButton(tooltip: t('app.refresh'), onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Text('$greeting, ${s.user?.name.split(' ').first ?? ''}',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(t('dash.last_7_days'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w500)),
            if (_error != null && !_hasData)
              EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)
            else if (!_hasData)
              _skeleton(s)
            else ...[
              if (_error != null) _OfflineNote(t('dash.offline')),
              ..._content(s, t),
            ],
          ],
        ),
      ),
    );
  }

  /// Same shape as the loaded screen: figure tiles, then two cards of rows.
  Widget _skeleton(Session s) {
    final tiles = (s.canSeeFinancials ? 4 : 3) + (s.isCar ? 2 : 0);
    Widget card(int rows, RowLead lead) => Card(
          child: Column(children: [
            for (var i = 0; i < rows; i++) ...[
              if (i > 0) const Divider(indent: 16, endIndent: 16),
              RowSkeleton(leading: lead, titleWidth: const [140.0, 110.0, 160.0, 125.0][i % 4]),
            ],
          ]),
        );
    Widget title() => const Padding(
          padding: EdgeInsets.fromLTRB(2, 24, 2, 14),
          child: Row(children: [Bone(width: 110, height: 10), Spacer(), Bone(width: 56, height: 10)]),
        );
    return Shimmer(
      child: Column(children: [
        const SizedBox(height: 14),
        _grid([for (var i = 0; i < tiles; i++) FigureTileSkeleton(detail: i == 1)]),
        title(),
        card(3, RowLead.circle),
        title(),
        card(4, RowLead.none),
      ]),
    );
  }

  Widget _grid(List<Widget> children) => GridView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          // Fixed height that grows with the phone's text size, so the tiles
          // never cut their text off on small screens.
          mainAxisExtent: 102 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.8),
        ),
        children: children,
      );

  List<Widget> _content(Session s, T t) {
    final c = Hgv.of(context);
    final sales = _sales ?? {}, stock = _stock ?? {};
    final low = (stock['low_stock'] as num? ?? 0) + (stock['out_of_stock'] as num? ?? 0);
    final pending = stock['pending'] as num? ?? 0, fined = stock['with_penalties'] as num? ?? 0;
    // Few colours: figures are neutral with blue icons; amber / red only
    // when there is something to act on.
    final figures = <Widget>[
      if (s.canSeeFinancials)
        FigureTile(
          label: t('dash.revenue'),
          value: money(sales['revenue'] as num? ?? 0, s.currency),
          icon: Icons.trending_up,
        ),
      FigureTile(
          label: t('dash.sales'),
          value: groupDigits(sales['sales_count'] as num? ?? 0),
          detail: t('dash.transactions'),
          icon: Icons.point_of_sale_outlined),
      FigureTile(
        label: s.isCar ? t('dash.vehicles') : t('dash.products'),
        value: groupDigits(stock['total_products'] as num? ?? 0),
        icon: s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined,
      ),
      FigureTile(
        label: t('dash.need_restock'),
        value: groupDigits(low),
        icon: Icons.warning_amber_rounded,
        color: low > 0 ? c.warning : null,
      ),
      if (s.isCar) ...[
        FigureTile(
            label: t('dash.pending'),
            value: groupDigits(pending),
            detail: t('dash.awaiting_transfer'),
            icon: Icons.schedule,
            color: pending > 0 ? c.warning : null),
        FigureTile(
            label: t('dash.with_fines'),
            value: groupDigits(fined),
            icon: Icons.gpp_maybe_outlined,
            color: fined > 0 ? c.danger : null),
      ],
    ];
    return [
      const SizedBox(height: 14),
      _grid(figures),
      SectionTitle(t('dash.stock_alerts'), trailing: TextButton(onPressed: () => widget.onOpenTab(1), child: Text(t('app.view_all')))),
      if (_alerts.isEmpty)
        Card(child: ListTile(leading: Icon(Icons.check_circle, color: c.success), title: Text(t('dash.all_healthy'))))
      else
        Card(
          child: Column(children: [
            for (final a in _alerts)
              Builder(builder: (context) {
                final qty = a['quantity'] as num? ?? 0;
                final tone = qty <= 0 ? c.danger : c.warning;
                return ListTile(
                  leading: RingBadge(color: tone, size: 40, child: Text(groupDigits(qty))),
                  title: Text('${a['name'] ?? ''}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(qty <= 0 ? t('dash.out_of_stock') : t('dash.left', {'n': groupDigits(qty)}),
                      style: TextStyle(color: tone, fontWeight: FontWeight.w600)),
                  trailing: Text(money(a['selling_price'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
                );
              }),
          ]),
        ),
      SectionTitle(t('dash.recent_sales'), trailing: TextButton(onPressed: () => widget.onOpenTab(2), child: Text(t('app.view_all')))),
      if (_recent.isEmpty)
        Card(child: ListTile(leading: const Icon(Icons.receipt_long_outlined), title: Text(t('dash.no_sales'))))
      else
        Card(
          child: Column(children: [
            for (final r in _recent)
              ListTile(
                dense: true,
                title: Text('${r['product_name'] ?? t('sale.default')}',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${r['quantity'] ?? 1} × · ${t.dateTime(r['created_at'] as String?)}'),
                trailing: Text(money(r['total_amount'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
          ]),
        ),
    ];
  }
}

class _OfflineNote extends StatelessWidget {
  const _OfflineNote(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: c.warning.withValues(alpha: 0.10),
        border: Border.all(color: c.warning.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(children: [
        Icon(Icons.cloud_off_outlined, size: 16, color: c.warning),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: TextStyle(color: c.warning, fontWeight: FontWeight.w600, fontSize: 13))),
      ]),
    );
  }
}
