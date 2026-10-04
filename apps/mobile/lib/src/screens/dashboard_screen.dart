import 'dart:async';

import 'package:flutter/material.dart';

import '../charts.dart';
import '../config.dart';
import '../format.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../live/live_widgets.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';
import 'activity_screen.dart';

/// Home: today at a glance, the week as a chart, what sells, who owes, and
/// what needs restocking — kept current live as sales and stock change.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, required this.onOpenTab});
  final ValueChanged<int> onOpenTab;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> with LiveListener {
  Map<String, dynamic>? _week, _today, _yesterday, _stock;
  List<Map<String, dynamic>> _alerts = [], _recent = [], _top = [], _daily = [];
  num _owed = 0;
  int _owedCount = 0;
  Object? _error;
  Timer? _timer;
  ValueNotifier<int>? _tick;
  int _selectedDay = 6;

  /// Sales that arrived live and haven't been highlighted yet.
  final Set<String> _flash = {};
  final _salesSoon = Debouncer(const Duration(milliseconds: 700));
  final _stockSoon = Debouncer(const Duration(milliseconds: 900));
  final _debtsSoon = Debouncer(const Duration(milliseconds: 900));
  final Map<String, Future<void>> _inFlight = {};

  bool get _hasData => _stock != null || _today != null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_tick == null) {
      _tick = SessionScope.of(context).refreshTick..addListener(_load);
      // A safety net: while live updates are not connected, refresh the
      // figures every minute the old way.
      _timer = Timer.periodic(const Duration(minutes: 1), (_) {
        if (mounted && LiveScope.read(context)?.status != LiveStatus.live) _load();
      });
      _load();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _tick?.removeListener(_load);
    _salesSoon.dispose();
    _stockSoon.dispose();
    _debtsSoon.dispose();
    super.dispose();
  }

  @override
  void onLive(LiveEvent e) {
    switch (e.topic) {
      case 'sale':
        if (e.type == 'sale.created' && e.data['id'] != null) _flash.add('${e.data['id']}');
        _salesSoon(() => _once('sales', _fetchSales));
      case 'product' || 'purchase':
        _stockSoon(() => _once('stock', _fetchStock));
      case 'debt':
        _debtsSoon(() => _once('debts', _fetchDebts));
      case 'resync':
        _load();
    }
  }

  /// One load of each kind at a time: asking again while one runs joins it.
  Future<void> _once(String key, Future<void> Function() f) =>
      _inFlight[key] ??= f().whenComplete(() => _inFlight.remove(key));

  Future<void> _load() => Future.wait([
        _once('sales', _fetchSales),
        _once('stock', _fetchStock),
        _once('debts', _fetchDebts),
      ]);

  Future<void> _guard(Future<void> Function() f) async {
    try {
      await f();
      if (mounted) setState(() => _error = null);
    } catch (e) {
      // Figures already on screen stay; a note says they could not be refreshed.
      if (mounted) setState(() => _error = e);
    }
  }

  static Map<String, dynamic> _data(dynamic r) => Map<String, dynamic>.from((r as Map)['data'] as Map? ?? {});
  static List<Map<String, dynamic>> _list(dynamic l) =>
      (l as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  Future<void> _fetchSales() => _guard(() async {
        final s = SessionScope.of(context);
        final now = DateTime.now();
        final today = ymd(now), yesterday = ymd(now.subtract(const Duration(days: 1)));
        final week = lastDays(7);
        final r = await Future.wait([
          s.api.get('${Svc.sales}/sales/summary', query: {'from_date': week.from, 'to_date': week.to}),
          s.api.get('${Svc.sales}/sales/summary', query: {'from_date': today, 'to_date': today}),
          s.api.get('${Svc.sales}/sales/summary', query: {'from_date': yesterday, 'to_date': yesterday}),
          s.api.get('${Svc.sales}/sales/daily', query: {'days': '7'}),
          s.api.get('${Svc.sales}/sales/top-products', query: {'limit': '5', 'from_date': week.from, 'to_date': week.to}),
          s.api.get('${Svc.sales}/sales', query: {'page': '1', 'limit': '6'}),
        ]);
        if (!mounted) return;
        setState(() {
          _week = _data(r[0]);
          _today = _data(r[1]);
          _yesterday = _data(r[2]);
          _daily = _list((r[3] as Map)['data']);
          _top = _list((r[4] as Map)['data']);
          _recent = _list(((r[5] as Map)['data'] as Map?)?['items']);
        });
      });

  Future<void> _fetchStock() => _guard(() async {
        final s = SessionScope.of(context);
        final r = await Future.wait([
          s.api.get('${Svc.products}/products/summary', query: {'threshold': '${s.lowStock}'}),
          s.api.get('${Svc.products}/products/stock-alerts', query: {'threshold': '${s.lowStock}'}),
        ]);
        if (!mounted) return;
        setState(() {
          _stock = _data(r[0]);
          _alerts = (_list((r[1] as Map)['data'])
                ..sort((a, b) => (a['quantity'] as num? ?? 0).compareTo(b['quantity'] as num? ?? 0)))
              .take(6)
              .toList();
        });
      });

  Future<void> _fetchDebts() async {
    try {
      final res = await SessionScope.of(context).api.get('${Svc.sales}/debts', query: {'is_paid': 'false'});
      final d = _data(res);
      if (!mounted) return;
      setState(() {
        _owed = d['total_outstanding'] as num? ?? 0;
        _owedCount = (d['total'] as num? ?? 0).toInt();
      });
    } catch (_) {/* optional card: simply not shown */}
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final c = Hgv.of(context);
    final now = DateTime.now();
    final greeting = t(now.hour < 12 ? 'dash.good_morning' : (now.hour < 18 ? 'dash.good_afternoon' : 'dash.good_evening'));
    final date = '${t.weekday(now.weekday)} ${t.date(now)}';
    return Scaffold(
      appBar: AppBar(
        title: Text(s.shop?.name ?? 'Higoverse', overflow: TextOverflow.ellipsis),
        actions: const [Padding(padding: EdgeInsets.only(right: 12), child: Center(child: LivePill()))],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
          children: [
            Text('$greeting, ${s.user?.name.split(' ').first ?? ''}',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
            const SizedBox(height: 2),
            Text(date, style: TextStyle(color: c.faint, fontWeight: FontWeight.w500)),
            const ActiveNowRow(),
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

  /// Same shape as the loaded screen: hero card, chart, tiles, a list.
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
    return Shimmer(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: 16),
        const Card(
          child: Padding(
            padding: EdgeInsets.all(18),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Bone(width: 60, height: 10),
              SizedBox(height: 12),
              Bone(width: 190, height: 26, radius: 8),
              SizedBox(height: 12),
              Bone(width: 130, height: 10),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        const Card(child: SizedBox(height: 170)),
        const SizedBox(height: 18),
        _grid([for (var i = 0; i < tiles; i++) FigureTileSkeleton(detail: i == 1)]),
        const SizedBox(height: 18),
        card(4, RowLead.circle),
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

  /// The figure people care about: money for those who may see it,
  /// otherwise the number of sales.
  num _headline(Session s, Map<String, dynamic>? m) {
    final revenue = s.canSeeFinancials ? (m?['revenue'] as num?) : null;
    return revenue ?? (m?['sales_count'] as num?) ?? 0;
  }

  String _fmtHeadline(Session s, num v) => s.canSeeFinancials ? money(v, s.currency) : groupDigits(v);

  List<DayValue> _weekBars(Session s, T t) {
    final byDay = {for (final d in _daily) '${d['day']}': d};
    final now = DateTime.now();
    return [
      for (var i = 6; i >= 0; i--)
        () {
          final day = DateTime(now.year, now.month, now.day).subtract(Duration(days: i));
          final row = byDay[ymd(day)];
          return DayValue(day, _headline(s, row).toDouble(), i == 0 ? t('dash.today') : t.weekday(day.weekday));
        }(),
    ];
  }

  List<Widget> _content(Session s, T t) {
    final c = Hgv.of(context);
    final week = _week ?? {}, stock = _stock ?? {};
    final low = (stock['low_stock'] as num? ?? 0) + (stock['out_of_stock'] as num? ?? 0);
    final pending = stock['pending'] as num? ?? 0, fined = stock['with_penalties'] as num? ?? 0;

    final todayValue = _headline(s, _today), yValue = _headline(s, _yesterday);
    final delta = percentChange(todayValue, yValue);
    final bars = _weekBars(s, t);
    final sel = bars[_selectedDay.clamp(0, bars.length - 1)];
    final weekTotal = bars.fold<double>(0, (a, b) => a + b.value);
    final topMax = _top.fold<num>(0, (m, p) {
      final v = (s.canSeeFinancials ? p['revenue'] as num? : null) ?? p['qty_sold'] as num? ?? 0;
      return v > m ? v : m;
    });

    // Few colours: figures are neutral with blue icons; amber / red only
    // when there is something to act on.
    final figures = <Widget>[
      if (s.canSeeFinancials)
        FigureTile(label: t('dash.revenue'), value: money(week['revenue'] as num? ?? 0, s.currency), icon: Icons.trending_up),
      FigureTile(
          label: t('dash.sales'),
          value: groupDigits(week['sales_count'] as num? ?? 0),
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
      const SizedBox(height: 16),
      // ── Today ──
      Panel(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(t('dash.today'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w700)),
            const Spacer(),
            if (delta != null) DeltaChip(delta, suffix: t('dash.vs_yesterday')),
          ]),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: todayValue.toDouble()),
              duration: const Duration(milliseconds: 600),
              curve: Curves.easeOutCubic,
              builder: (context, v, _) => Text(_fmtHeadline(s, v),
                  style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: -0.8)),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            t('dash.today_detail', {
              'n': groupDigits(_today?['sales_count'] as num? ?? 0),
              'items': groupDigits(_today?['items_sold'] as num? ?? 0),
            }),
            style: TextStyle(color: c.faint, fontWeight: FontWeight.w500),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      // ── This week ──
      Panel(
        title: t('dash.this_week'),
        trailing: Text(t('dash.week_total', {'v': _fmtHeadline(s, weekTotal)}),
            style: TextStyle(color: c.faint, fontSize: 13, fontWeight: FontWeight.w600)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_fmtHeadline(s, sel.value), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text(daysAgo(sel.day) == 0 ? t('dash.today') : '${t.weekday(sel.day.weekday)} ${t.date(sel.day)}',
              style: TextStyle(color: c.faint, fontSize: 12)),
          const SizedBox(height: 12),
          WeekBars(days: bars, selected: _selectedDay, onSelect: (i) => setState(() => _selectedDay = i)),
        ]),
      ),
      SectionTitle(t('dash.last_7_days')),
      _grid(figures),
      if (_owedCount > 0) ...[
        const SizedBox(height: 12),
        Panel(
          onTap: () => openDebts(context),
          child: Row(children: [
            IconAvatar(icon: Icons.account_balance_wallet_outlined, color: c.warning, size: 44),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t('dash.owed'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(money(_owed, s.currency), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                ),
                Text(t('dash.owed_detail', {'n': _owedCount}), style: TextStyle(color: c.faint, fontSize: 12)),
              ]),
            ),
            Icon(Icons.chevron_right_rounded, color: c.faint),
          ]),
        ),
      ],
      const SizedBox(height: 12),
      // ── Top sellers ──
      Panel(
        title: t('dash.top_products'),
        child: _top.isEmpty
            ? Text(t('dash.no_top'), style: TextStyle(color: c.faint))
            : Column(children: [
                for (var i = 0; i < _top.length; i++)
                  Builder(builder: (context) {
                    final p = _top[i];
                    final qty = p['qty_sold'] as num? ?? 0;
                    final rev = s.canSeeFinancials ? p['revenue'] as num? : null;
                    final v = rev ?? qty;
                    return Padding(
                      padding: EdgeInsets.only(top: i == 0 ? 0 : 12),
                      child: Row(children: [
                        SizedBox(
                          width: 26,
                          child: Text('${i + 1}',
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: i == 0 ? c.ink : c.faint)),
                        ),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(
                                child: Text('${p['product_name'] ?? ''}',
                                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                              ),
                              Text(rev != null ? money(rev, s.currency) : t('dash.sold_n', {'n': groupDigits(qty)}),
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                            ]),
                            const SizedBox(height: 5),
                            Meter(value: topMax <= 0 ? 0 : v / topMax, color: i == 0 ? c.ink : c.ink.withValues(alpha: 0.5)),
                            if (rev != null) ...[
                              const SizedBox(height: 3),
                              Text(t('dash.sold_n', {'n': groupDigits(qty)}), style: TextStyle(fontSize: 12, color: c.faint)),
                            ],
                          ]),
                        ),
                      ]),
                    );
                  }),
              ]),
      ),
      // ── Stock alerts ──
      SectionTitle(t('dash.stock_alerts'), trailing: TextButton(onPressed: () => widget.onOpenTab(1), child: Text(t('app.view_all')))),
      if (_alerts.isEmpty)
        Card(child: ListTile(leading: Icon(Icons.check_circle, color: c.success), title: Text(t('dash.all_healthy'))))
      else
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (final a in _alerts)
              Builder(builder: (context) {
                final qty = a['quantity'] as num? ?? 0;
                final tone = qty <= 0 ? c.danger : c.warning;
                return ListTile(
                  onTap: () => showProductSheet(context, a),
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
      // ── Recent sales (live) ──
      SectionTitle(t('dash.recent_sales'), trailing: TextButton(onPressed: () => widget.onOpenTab(2), child: Text(t('app.view_all')))),
      if (_recent.isEmpty)
        Card(child: ListTile(leading: const Icon(Icons.receipt_long_outlined), title: Text(t('dash.no_sales'))))
      else
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (final r in _recent)
              Flash(
                key: ValueKey(r['id']),
                flash: _flash.remove('${r['id']}'),
                child: ListTile(
                  onTap: () => showSaleSheet(context, r),
                  leading: IconAvatar(icon: Icons.receipt_long_rounded, color: c.success, size: 38),
                  title: Text('${r['product_name'] ?? t('sale.default')}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${r['quantity'] ?? 1} × · ${t.ago(parseTimestamp(r['created_at']) ?? DateTime.now())}'),
                  trailing: Text(money(r['total_amount'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
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
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(children: [
        Icon(Icons.cloud_off_outlined, size: 16, color: c.warning),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: TextStyle(color: c.warning, fontWeight: FontWeight.w600, fontSize: 13))),
      ]),
    );
  }
}
