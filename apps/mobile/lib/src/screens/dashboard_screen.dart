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
import '../stock_circles.dart';
import '../stories.dart';
import '../covers.dart';
import '../holder.dart';
import '../theme.dart';
import '../widgets.dart';
import 'activity_screen.dart';

/// Home: the business at a glance, kept current live. Top bar with the
/// logo, search and notifications; today and the week; for car dealers the
/// fleet's status (available, pending transfer, fines, sold) with the
/// vehicles that need attention; newly added stock; stock alerts; top
/// sellers, money owed and the latest sales.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.onOpenTab,
    required this.onOpenProducts,
  });
  final ValueChanged<int> onOpenTab;

  /// Opens Vehicles / Stock already filtered ("pending", "penalties"…).
  final ValueChanged<String> onOpenProducts;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> with LiveListener {
  Map<String, dynamic>? _week, _today, _yesterday, _stock;
  List<Map<String, dynamic>> _alerts = [], _recent = [], _top = [], _daily = [], _newest = [], _pending = [], _fined = [];
  num _owed = 0;
  int _owedCount = 0;

  /// Vehicles with fines the company still answers for (see isReleased).
  int? _trackedFines;
  Object? _error;
  Timer? _timer;
  ValueNotifier<int>? _tick;
  int _selectedDay = 6;

  /// Rows that arrived live and haven't been highlighted yet.
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
    final id = e.data['id'];
    // Who has which car, and what they still owe, may have changed.
    if (e.topic == 'sale' || e.topic == 'debt' || e.isResync) forgetHolders(SessionScope.of(context));
    switch (e.topic) {
      case 'sale':
        if (e.type == 'sale.created' && id != null) _flash.add('$id');
        _salesSoon(() => _once('sales', _fetchSales));
      case 'product' || 'purchase':
        if (e.type == 'product.created' && id != null) _flash.add('$id');
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
  static List<Map<String, dynamic>> _items(dynamic r) => _list(((r as Map)['data'] as Map?)?['items']);

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
          s.api.get('${Svc.sales}/sales', query: {'page': '1', 'limit': '5'}),
        ]);
        if (!mounted) return;
        setState(() {
          _week = _data(r[0]);
          _today = _data(r[1]);
          _yesterday = _data(r[2]);
          _daily = _list((r[3] as Map)['data']);
          _top = _list((r[4] as Map)['data']);
          _recent = _items(r[5]);
        });
      });

  Future<void> _fetchStock() => _guard(() async {
        final s = SessionScope.of(context);
        final p = '${Svc.products}/products';
        final r = await Future.wait([
          s.api.get('$p/summary', query: {'threshold': '${s.lowStock}'}),
          s.api.get('$p/stock-alerts', query: {'threshold': '${s.lowStock}'}),
          // Newest first: enough for every item added in the last 3 days (stories).
          s.api.get(p, query: {'page': '1', 'limit': '60'}),
          if (s.isCar) ...[
            s.api.get(p, query: {'page': '1', 'limit': '10', 'status': 'pending'}),
            s.api.get(p, query: {'page': '1', 'limit': '40', 'status': 'penalties'}),
          ],
        ]);
        // Fully paid and transferred cars are the owners' now: their fines
        // are not followed.
        final finedAll = s.isCar ? _items(r[4]) : <Map<String, dynamic>>[];
        final finedTotal = s.isCar ? ((((r[4] as Map)['data'] as Map?)?['total'] as num?) ?? 0).toInt() : 0;
        final tracked = s.isCar ? await trackedForFines(s, finedAll) : <Map<String, dynamic>>[];
        if (!mounted) return;
        setState(() {
          _trackedFines = s.isCar ? tracked.length + (finedTotal - finedAll.length).clamp(0, finedTotal) : null;
          _stock = _data(r[0]);
          _alerts = (_list((r[1] as Map)['data'])
                ..sort((a, b) => (a['quantity'] as num? ?? 0).compareTo(b['quantity'] as num? ?? 0)))
              .take(8)
              .toList();
          _newest = _items(r[2]);
          _pending = s.isCar ? _items(r[3]) : const [];
          _fined = tracked.take(10).toList();
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
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 20),
              sliver: SliverList.list(children: [
                if (_error != null && !_hasData)
                  EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)
                else if (!_hasData)
                  _skeleton()
                else ...[
                  if (_error != null) _OfflineNote(t('dash.offline')),
                  ..._content(s, t),
                ],
              ]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _skeleton() {
    Widget card(double h) => Padding(padding: const EdgeInsets.only(top: 10), child: Card(child: SizedBox(height: h)));
    return Shimmer(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: 4),
        const Card(
          child: Padding(
            padding: EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Bone(width: 50, height: 9),
              SizedBox(height: 10),
              Bone(width: 160, height: 22, radius: 7),
              SizedBox(height: 10),
              Bone(width: 110, height: 9),
              SizedBox(height: 18),
              Bone(height: 60, radius: 8),
            ]),
          ),
        ),
        const SizedBox(height: 10),
        Row(children: [
          for (var i = 0; i < 4; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            const Expanded(child: Card(child: SizedBox(height: 74))),
          ],
        ]),
        const Padding(padding: EdgeInsets.fromLTRB(2, 20, 2, 10), child: Bone(width: 110, height: 11)),
        SizedBox(
          height: 170,
          child: Row(children: [
            for (var i = 0; i < 3; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              const Expanded(child: Card(child: SizedBox.expand())),
            ],
          ]),
        ),
        card(150),
      ]),
    );
  }

  /// The figure people care about: money for those who may see it,
  /// otherwise the number of sales.
  num _headline(Session s, Map<String, dynamic>? m) {
    final revenue = s.canSeeFinancials ? (m?['revenue'] as num?) : null;
    return revenue ?? (m?['sales_count'] as num?) ?? 0;
  }

  String _fmt(Session s, num v) => s.canSeeFinancials ? money(v, s.currency) : groupDigits(v);

  List<DayValue> _weekBars(Session s, T t) {
    final byDay = {for (final d in _daily) '${d['day']}': d};
    final now = DateTime.now();
    return [
      for (var i = 6; i >= 0; i--)
        () {
          final day = DateTime(now.year, now.month, now.day).subtract(Duration(days: i));
          return DayValue(day, _headline(s, byDay[ymd(day)]).toDouble(), i == 0 ? t('dash.today') : t.weekday(day.weekday));
        }(),
    ];
  }

  List<Widget> _content(Session s, T t) {
    final c = Hgv.of(context);
    final stock = _stock ?? {};
    num n(String k) => stock[k] as num? ?? 0;
    final total = n('total_products'), sold = n('out_of_stock'), pending = n('pending'), fined = _trackedFines ?? n('with_penalties');
    final available = (total - sold - pending).clamp(0, total);
    final low = n('low_stock') + sold;

    // Fines first (they cost money every day), then transfers waiting.
    // Car dealers: fines and transfers; shops: sold out, running low, best
    // sellers this week and new stock.
    final stories = storyGroups(isCar: s.isCar, fined: _fined, pending: _pending, alerts: _alerts, top: _top, newest: _newest);

    return [
      // Stories first, straight under the top bar, as on Facebook.
      if (stories.isNotEmpty) ...[
        StoriesRow(groups: stories),
        const SizedBox(height: 4),
      ],
      const ActiveNowRow(),
      const SizedBox(height: 8),
      _overview(s, t),
      const SizedBox(height: 8),
      // ── Status strip ──
      if (s.isCar)
        Row(children: [
          _StatusTile(label: t('dash.available'), value: available, icon: Icons.check_circle_rounded, color: c.success,
              onTap: () => widget.onOpenProducts('available')),
          _StatusTile(label: t('stock.f_pending'), value: pending, icon: Icons.schedule_rounded, color: c.warning,
              onTap: () => widget.onOpenProducts('pending')),
          _StatusTile(label: t('dash.fines_short'), value: fined, icon: Icons.gpp_maybe_rounded, color: c.danger,
              onTap: () => widget.onOpenProducts('penalties')),
          _StatusTile(label: t('stock.f_sold'), value: sold, icon: Icons.sell_rounded, color: c.ink,
              onTap: () => widget.onOpenProducts('sold')),
        ])
      else
        Row(children: [
          if (s.canSeeFinancials)
            _StatusTile(label: t('dash.revenue'), value: _week?['revenue'] as num? ?? 0, money: true, icon: Icons.trending_up_rounded,
                color: c.success, onTap: () => widget.onOpenTab(2)),
          _StatusTile(label: t('dash.sales'), value: _week?['sales_count'] as num? ?? 0, icon: Icons.receipt_long_rounded,
              color: c.ink, onTap: () => widget.onOpenTab(2)),
          _StatusTile(label: t('dash.products'), value: total, icon: Icons.inventory_2_rounded, color: c.ink,
              onTap: () => widget.onOpenTab(1)),
          _StatusTile(label: t('dash.need_restock'), value: low, icon: Icons.warning_rounded,
              color: low > 0 ? c.warning : c.success, onTap: () => widget.onOpenTab(1)),
        ]),
      // ── Stock alert ──
      if (s.isCar && total > 0 && available <= s.lowStock)
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: _AlertCard(
            icon: Icons.warning_amber_rounded,
            color: available == 0 ? c.danger : c.warning,
            title: t('dash.few_cars', {'n': groupDigits(available)}),
            body: t('dash.few_cars_sub'),
            onTap: () => widget.onOpenProducts('available'),
          ),
        ),
      // ── Stock alerts: nested circles, as on the website ──
      SectionHeader(t('dash.stock_alerts'), count: low.toInt(), action: t('app.view_all'), onAction: () => widget.onOpenTab(1)),
      if (_alerts.isEmpty)
        _AlertCard(icon: Icons.check_circle_rounded, color: c.success, title: t('dash.all_healthy'), body: t('dash.no_restock'))
      else
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: StockCircles(
              items: _alerts,
              total: low.toInt() > _alerts.length ? low.toInt() : _alerts.length,
              onAll: () => widget.onOpenProducts('all'),
            ),
          ),
        ),
      // ── Newly added ──
      if (_newest.isNotEmpty) ...[
        SectionHeader(t('dash.new_arrivals'), action: t('app.view_all'), onAction: () => widget.onOpenProducts('all')),
        SizedBox(
          height: 202,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _newest.length.clamp(0, 10),
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) => _ArrivalCard(
              key: ValueKey(_newest[i]['id']),
              item: _newest[i],
              flash: _flash.remove('${_newest[i]['id']}'),
            ),
          ),
        ),
      ],
      // ── Money owed ──
      if (_owedCount > 0)
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: _AlertCard(
            icon: Icons.account_balance_wallet_rounded,
            color: c.warning,
            title: '${t('dash.owed')} · ${money(_owed, s.currency)}',
            body: t('dash.owed_detail', {'n': _owedCount}),
            onTap: () => openDebts(context),
          ),
        ),
      // ── Top sellers ──
      if (_top.isNotEmpty) ...[
        SectionHeader(t('dash.top_products')),
        _TopSellers(top: _top, session: s),
      ],
      // ── Latest sales (live) ──
      SectionHeader(t('dash.recent_sales'), action: t('app.view_all'), onAction: () => widget.onOpenTab(2)),
      if (_recent.isEmpty)
        _AlertCard(icon: Icons.receipt_long_outlined, color: c.faint, title: t('dash.no_sales'))
      else
        _ListCard(children: [
          for (final r in _recent)
            Flash(
              key: ValueKey(r['id']),
              flash: _flash.remove('${r['id']}'),
              child: _Row(
                onTap: () => showSaleSheet(context, r),
                leading: CoverPhoto(
                  id: '${r['product_id'] ?? ''}',
                  thumbnail: null,
                  isCar: s.isCar,
                  width: 44,
                  height: 44,
                  radius: 10,
                  fallback: IconAvatar(icon: Icons.receipt_long_rounded, color: c.success, size: 44),
                ),
                title: '${r['product_name'] ?? t('sale.default')}',
                subtitle: '${r['quantity'] ?? 1} × · ${t.ago(parseTimestamp(r['created_at']) ?? DateTime.now())}',
                trailing: money(r['total_amount'] as num? ?? 0, s.currency),
              ),
            ),
        ]),
    ];
  }

  /// Today's figure against yesterday, then the week as bars.
  Widget _overview(Session s, T t) {
    final c = Hgv.of(context);
    final todayValue = _headline(s, _today), yValue = _headline(s, _yesterday);
    final delta = percentChange(todayValue, yValue);
    final bars = _weekBars(s, t);
    final sel = bars[_selectedDay.clamp(0, bars.length - 1)];
    final weekTotal = bars.fold<double>(0, (a, b) => a + b.value);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(t('dash.today'), style: TextStyle(fontSize: 12, color: c.muted, fontWeight: FontWeight.w700)),
            const Spacer(),
            if (delta != null && delta.abs() >= 0.05) DeltaChip(delta, suffix: t('dash.vs_yesterday')),
          ]),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: todayValue.toDouble()),
              duration: const Duration(milliseconds: 600),
              curve: Curves.easeOutCubic,
              builder: (context, v, _) =>
                  Text(_fmt(s, v), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: -0.6)),
            ),
          ),
          Text(
            t('dash.today_detail', {
              'n': groupDigits(_today?['sales_count'] as num? ?? 0),
              'items': groupDigits(_today?['items_sold'] as num? ?? 0),
            }),
            style: TextStyle(fontSize: 12, color: c.faint),
          ),
          const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
          Row(children: [
            Text(t('dash.this_week'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                '· ${daysAgo(sel.day) == 0 ? t('dash.today') : '${t.weekday(sel.day.weekday)} ${t.date(sel.day)}'}: ${_fmt(s, sel.value)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: c.muted, fontWeight: FontWeight.w600),
              ),
            ),
          ]),
          Text(t('dash.week_total', {'v': _fmt(s, weekTotal)}), style: TextStyle(fontSize: 11, color: c.faint)),
          const SizedBox(height: 8),
          WeekBars(days: bars, selected: _selectedDay, height: 58, onSelect: (i) => setState(() => _selectedDay = i)),
        ]),
      ),
    );
  }
}

/// A small square figure: icon, count, label. Tapping opens the list
/// behind it.
class _StatusTile extends StatelessWidget {
  const _StatusTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.onTap,
    this.money = false,
  });
  final String label;
  final num value;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final bool money;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    // Colour only for what needs attention (fines, pending, restock) and
    // only when there is something; the rest stay neutral.
    final alert = (color == c.danger || color == c.warning) && value > 0;
    final tint = alert ? color : c.muted;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 8, 9),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(color: alert ? color.withValues(alpha: 0.13) : c.paper, shape: BoxShape.circle),
                  child: Icon(icon, size: 15, color: tint),
                ),
                const SizedBox(height: 6),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(money ? compactMoney(value, s.currency) : groupDigits(value),
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, letterSpacing: -0.3)),
                ),
                Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: c.muted, fontWeight: FontWeight.w600)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// A one-line notice in a tinted card (stock alert, money owed…).
class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.icon, required this.color, required this.title, this.body, this.onTap});
  final IconData icon;
  final Color color;
  final String title;
  final String? body;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
          child: Row(children: [
            IconAvatar(icon: icon, color: color, size: 34),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                if (body != null) Text(body!, style: TextStyle(fontSize: 12, color: c.faint)),
              ]),
            ),
            if (onTap != null) Icon(Icons.chevron_right_rounded, color: c.faint, size: 20),
          ]),
        ),
      ),
    );
  }
}

/// Rows in one card, divided by hairlines.
class _ListCard extends StatelessWidget {
  const _ListCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: Column(children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const Divider(indent: 64),
            children[i],
          ],
        ]),
      );
}

/// A compact list row: leading, title, subtitle, trailing text or widget.
class _Row extends StatelessWidget {
  const _Row({
    required this.leading,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });
  final Widget leading;
  final String title, subtitle;
  final String? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        child: Row(children: [
          SizedBox(width: 50, child: Center(child: leading)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
              if (subtitle.isNotEmpty)
                Text(subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: c.faint, fontWeight: FontWeight.w500)),
            ]),
          ),
          const SizedBox(width: 8),
          if (trailing != null) Text(trailing!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
        ]),
      ),
    );
  }
}

/// A newly added product or vehicle: photo first, like a feed card.
class _ArrivalCard extends StatelessWidget {
  const _ArrivalCard({super.key, required this.item, required this.flash});
  final Map<String, dynamic> item;
  final bool flash;

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final c = Hgv.of(context);
    final a = attributesOf(item['attributes']);
    final qty = item['quantity'] as num? ?? 0;
    final status = qty <= 0
        ? (t('stock.f_sold'), c.faint)
        : s.isCar && a['sale_status'] == 'pending'
            ? (t('stock.f_pending'), c.warning)
            : null;
    final fines = int.tryParse(a['penalty_count'] ?? '') ?? 0;
    final sub = s.isCar
        ? [a['plate_no'], a['year']].where((x) => x != null && x.isNotEmpty).join(' · ')
        : (qty <= 0 ? t('dash.out_of_stock') : t('stock.in_stock_n', {'n': groupDigits(qty)}));
    final added = parseTimestamp(item['created_at']);
    return SizedBox(
      width: 156,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => openItem(context, item),
          child: Flash(
            flash: flash,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Stack(children: [
                CoverPhoto(id: '${item['id']}', thumbnail: item['thumbnail'] as String?, isCar: s.isCar, width: 156, height: 112),
                if (status != null || fines > 0)
                  Positioned(
                    left: 6,
                    top: 6,
                    child: _Tag(status?.$1 ?? (fines == 1 ? t('stock.fine_one') : t('stock.fines_n', {'n': fines})),
                        status?.$2 ?? c.danger),
                  ),
                if (added != null)
                  Positioned(right: 6, bottom: 6, child: _Tag(t.ago(added), Colors.black54)),
              ]),
              Padding(
                padding: const EdgeInsets.fromLTRB(9, 7, 9, 0),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${item['name'] ?? ''}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                  Text(sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: !s.isCar && qty <= s.lowStock ? c.warning : c.faint)),
                  const SizedBox(height: 3),
                  Text(money(item['selling_price'] as num? ?? 0, s.currency),
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: c.ink)),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// A tiny label over a photo.
class _Tag extends StatelessWidget {
  const _Tag(this.text, this.color);
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6)),
        child: Text(text, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
      );
}

class _TopSellers extends StatelessWidget {
  const _TopSellers({required this.top, required this.session});
  final List<Map<String, dynamic>> top;
  final Session session;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = session;
    num value(Map<String, dynamic> p) => (s.canSeeFinancials ? p['revenue'] as num? : null) ?? p['qty_sold'] as num? ?? 0;
    final max = top.fold<num>(0, (m, p) => value(p) > m ? value(p) : m);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
        child: Column(children: [
          for (var i = 0; i < top.length; i++)
            Padding(
              padding: EdgeInsets.only(top: i == 0 ? 0 : 10),
              child: Row(children: [
                SizedBox(
                  width: 18,
                  child: Text('${i + 1}', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: i == 0 ? c.ink : c.faint)),
                ),
                CoverPhoto(
                  id: '${top[i]['product_id'] ?? ''}',
                  thumbnail: null,
                  isCar: s.isCar,
                  width: 40,
                  height: 40,
                  radius: 10,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(
                        child: Text('${top[i]['product_name'] ?? ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                      ),
                      Text(
                        s.canSeeFinancials && top[i]['revenue'] is num
                            ? money(top[i]['revenue'] as num, s.currency)
                            : t('dash.sold_n', {'n': groupDigits(top[i]['qty_sold'] as num? ?? 0)}),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                      ),
                    ]),
                    const SizedBox(height: 4),
                    Meter(value: max <= 0 ? 0 : value(top[i]) / max, height: 5, color: i == 0 ? c.ink : c.ink.withValues(alpha: 0.45)),
                  ]),
                ),
              ]),
            ),
        ]),
      ),
    );
  }
}

class _OfflineNote extends StatelessWidget {
  const _OfflineNote(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: c.warning.withValues(alpha: 0.10),
        border: Border.all(color: c.warning.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(children: [
        Icon(Icons.cloud_off_outlined, size: 16, color: c.warning),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: TextStyle(color: c.warning, fontWeight: FontWeight.w600, fontSize: 12.5))),
      ]),
    );
  }
}
