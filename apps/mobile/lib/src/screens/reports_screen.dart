import 'package:flutter/material.dart';

import '../charts.dart';
import '../config.dart';
import '../format.dart';
import '../i18n.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';
import 'purchases_screen.dart';

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
Map<String, dynamic> _data(Object? r) => r is Map && r['data'] is Map ? Map<String, dynamic>.from(r['data'] as Map) : <String, dynamic>{};
List<Map<String, dynamic>> _list(Object? v) => (v as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
List<Map<String, dynamic>> _items(Object? r) {
  final d = r is Map ? r['data'] : null;
  return _list(d is Map ? d['items'] : d);
}

void openReports(BuildContext context) => pushScoped<void>(context, const ReportsScreen());

/// How the business is doing (the website's Reports page): sales, items
/// sold, expenses and stock value for a period; the last 8 weeks, this week
/// against last; top sellers, stock alerts and recent purchases.
/// For those who see the money (report-service's financial access).
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

/// One rolling 7-day week of [ReportsScreen]'s weekly view.
class _Week {
  _Week(this.from, this.to);
  final String from, to;
  final Map<String, num> v = {'sales': 0, 'count': 0, 'expenses': 0, 'fines': 0, 'pending': 0};
}

class _ReportsScreenState extends State<ReportsScreen> {
  static const _weeks = 8;
  int _days = 7;
  Map<String, dynamic>? _summary;
  num _expenses = 0;
  int _expenseCount = 0;
  List<Map<String, dynamic>> _top = [], _products = [], _purchases = [];
  List<_Week>? _weekly;
  Object? _error;
  int _gen = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) {
      _load();
      _loadWeeks();
    }
  }

  /// Settled futures: one service down still shows the rest.
  static Future<Object?> _try(Future<Object?> f) => f.then<Object?>((v) => v, onError: (Object e) => e);

  Future<void> _load() async {
    final gen = ++_gen;
    final s = SessionScope.of(context);
    final range = lastDays(_days);
    final q = {'from_date': range.from, 'to_date': range.to, 'threshold': '${s.lowStock}'};
    final r = await Future.wait([
      _try(s.api.get('${Svc.reports}/reports/summary', query: q)),
      _try(s.api.get('${Svc.reports}/reports/top-items', query: {...q, 'limit': '10'})),
      _try(s.api.get('${Svc.products}/products', query: {'page': '1', 'limit': '1000'})),
      _try(s.api.get('${Svc.expenses}/expenses/summary', query: q)),
      if (!s.isCar) _try(s.api.get('${Svc.purchases}/purchases', query: {'page': '1', 'limit': '500', 'from_date': range.from, 'to_date': range.to})),
    ]);
    if (!mounted || gen != _gen) return;
    setState(() {
      _error = r[0] is Exception || r[0] is Error ? r[0] : null;
      _summary = r[0] is Map ? _data(r[0]) : (_summary ?? const {});
      _top = r[1] is Map ? _list((r[1] as Map)['data']) : const [];
      _products = r[2] is Map ? _items(r[2]) : const [];
      if (r[3] is Map) {
        final e = _data(r[3]);
        _expenses = _n(e['total_expenses']);
        _expenseCount = _n(e['count']).toInt();
      }
      _purchases = r.length > 4 && r[4] is Map ? _items(r[4]) : const [];
    });
  }

  Future<void> _loadWeeks() async {
    final s = SessionScope.of(context);
    final now = DateTime.now();
    final weeks = [
      for (var i = 0; i < _weeks; i++)
        _Week(
          ymd(now.subtract(Duration(days: 7 * (_weeks - 1 - i) + 6))),
          ymd(now.subtract(Duration(days: 7 * (_weeks - 1 - i)))),
        ),
    ];
    void add(String day, String k, num v) {
      for (final w in weeks) {
        if (day.compareTo(w.from) >= 0 && day.compareTo(w.to) <= 0) w.v[k] = w.v[k]! + v;
      }
    }

    final r = await Future.wait([
      _try(s.api.get('${Svc.reports}/reports/daily', query: {'days': '${_weeks * 7}'})),
      _try(s.api.get('${Svc.expenses}/expenses/daily', query: {'days': '${_weeks * 7 + 1}'})),
      if (s.isCar) ...[
        _try(s.api.get('${Svc.products}/products', query: {'page': '1', 'limit': '1000', 'status': 'penalties'})),
        _try(s.api.get('${Svc.products}/products', query: {'page': '1', 'limit': '1000', 'status': 'pending'})),
      ],
    ]);
    if (r[0] is Map) {
      for (final d in _list((r[0] as Map)['data'])) {
        final day = '${d['day'] ?? ''}';
        if (day.isEmpty) continue;
        add(day, 'sales', _n(d['revenue']));
        add(day, 'count', _n(d['sales_count']));
      }
    }
    if (r[1] is Map) {
      for (final e in _list((r[1] as Map)['data'])) {
        final day = '${e['day'] ?? ''}';
        if (day.length >= 10) add(day.substring(0, 10), 'expenses', _n(e['total']));
      }
    }
    if (s.isCar && r.length > 3) {
      for (final c in _items(r[2])) {
        final a = attributesOf(c['attributes']);
        if ((a['penalty_checked'] ?? '').isNotEmpty) add(a['penalty_checked']!, 'fines', _n(a['penalty_count']));
      }
      for (final c in _items(r[3])) {
        final a = attributesOf(c['attributes']);
        if ((a['pending_since'] ?? '').isNotEmpty) add(a['pending_since']!, 'pending', 1);
      }
    }
    if (mounted) setState(() => _weekly = weeks);
  }

  Future<void> _refresh() => Future.wait([_load(), _loadWeeks()]);

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final sum = _summary;
    final low = s.lowStock;
    final retail = _products.fold<num>(0, (a, p) => a + _n(p['selling_price']) * _n(p['quantity']));
    final needRestock = _products.where((p) => _n(p['quantity']) <= low).length;
    final alerts = _products.where((p) => _n(p['quantity']) <= low).toList()..sort((a, b) => _n(a['quantity']).compareTo(_n(b['quantity'])));
    final spent = _purchases.fold<num>(0, (a, p) => a + _n(p['total_cost']));
    final topMax = _top.fold<num>(1, (m, x) => _n(x['revenue']) > m ? _n(x['revenue']) : m);
    return Scaffold(
      appBar: AppBar(title: Text(t('reports.title'))),
      body: !s.canSeeFinancials
          ? EmptyState(icon: Icons.lock_outline, message: t('m.reports_not_allowed'))
          : Column(children: [
              Container(
                color: c.chrome,
                padding: const EdgeInsets.fromLTRB(10, 2, 10, 8),
                child: SegmentedButton<int>(
                  segments: [
                    ButtonSegment(value: 7, label: Text(t('sales.7d'))),
                    ButtonSegment(value: 30, label: Text(t('sales.30d'))),
                    ButtonSegment(value: 90, label: Text(t('exp.90d'))),
                  ],
                  selected: {_days},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) {
                    setState(() {
                      _days = v.first;
                      _summary = null;
                    });
                    _load();
                  },
                ),
              ),
              const Divider(),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _refresh,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(8, 8, 8, 24),
                    children: [
                      if (_error != null)
                        Card(
                          color: c.danger.withValues(alpha: 0.08),
                          child: ListTile(
                            leading: Icon(Icons.error_outline, color: c.danger),
                            title: Text(t('reports.could_not_load')),
                            subtitle: Text(errorText(t, _error!)),
                            trailing: TextButton(onPressed: _load, child: Text(t('app.retry'))),
                          ),
                        ),
                      if (sum == null)
                        const Shimmer(
                          child: Column(children: [
                            Row(children: [Expanded(child: FigureTileSkeleton()), Expanded(child: FigureTileSkeleton())]),
                            Row(children: [Expanded(child: FigureTileSkeleton()), Expanded(child: FigureTileSkeleton())]),
                          ]),
                        )
                      else ...[
                        Row(children: [
                          Expanded(
                            child: FigureTile(
                              label: t('dash.revenue'),
                              value: compactMoney(_n(sum['revenue']), s.currency),
                              detail: '${groupDigits(_n(sum['sales_count']))} ${t('reports.sales_word')}',
                              icon: Icons.trending_up,
                            ),
                          ),
                          Expanded(
                            child: FigureTile(
                              label: t('reports.items_sold'),
                              value: groupDigits(_n(sum['items_sold'])),
                              detail: '${t('reports.to_word')} ${groupDigits(_n(sum['unique_customers']))} ${t('reports.customers_word')}',
                              icon: Icons.shopping_bag_outlined,
                            ),
                          ),
                        ]),
                        Row(children: [
                          Expanded(
                            child: FigureTile(
                              label: t('exp.title'),
                              value: compactMoney(_expenses, s.currency),
                              detail: '$_expenseCount ${t('reports.records_this_period')}',
                              icon: Icons.receipt_long_outlined,
                            ),
                          ),
                          Expanded(
                            child: FigureTile(
                              label: t('reports.stock_value'),
                              value: compactMoney(retail, s.currency),
                              detail:
                                  '${groupDigits(_products.length)} ${t('reports.products_word')} · $needRestock ${t('reports.need_restock_word')}',
                              icon: Icons.inventory_2_outlined,
                            ),
                          ),
                        ]),
                      ],
                      const SizedBox(height: 4),
                      _WeeklyPanel(weeks: _weekly),
                      const SizedBox(height: 4),
                      Panel(
                        title: t('reports.top_sellers'),
                        child: _top.isEmpty
                            ? Padding(
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                child: Text(t('m.no_data'), style: TextStyle(color: c.muted)),
                              )
                            : Column(children: [
                                for (var i = 0; i < _top.length; i++)
                                  InkWell(
                                    onTap: () => openItem(context, {'id': _top[i]['product_id'], 'name': _top[i]['product_name']}),
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 6),
                                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                                        Row(children: [
                                          SizedBox(
                                              width: 22, child: Text('${i + 1}.', style: TextStyle(color: c.faint, fontWeight: FontWeight.w700))),
                                          Expanded(
                                            child: Text('${_top[i]['product_name'] ?? '-'}',
                                                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                                          ),
                                          Text(money(_n(_top[i]['revenue']), s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                                        ]),
                                        const SizedBox(height: 4),
                                        Row(children: [
                                          const SizedBox(width: 22),
                                          Expanded(child: Meter(value: _n(_top[i]['revenue']) / topMax)),
                                          const SizedBox(width: 10),
                                          Text('${groupDigits(_n(_top[i]['qty_sold']))} ${t('reports.sold_word')}',
                                              style: TextStyle(color: c.muted, fontSize: 12)),
                                        ]),
                                      ]),
                                    ),
                                  ),
                              ]),
                      ),
                      Panel(
                        title: t('reports.stock_alerts'),
                        trailing:
                            s.isCar || alerts.isEmpty ? null : TextButton(onPressed: () => openPurchases(context), child: Text(t('app.view_all'))),
                        child: alerts.isEmpty
                            ? Padding(
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                child: Row(children: [
                                  Icon(Icons.check_circle_outline, color: c.success),
                                  const SizedBox(width: 8),
                                  Expanded(child: Text(t('reports.stock_healthy_full'))),
                                ]),
                              )
                            : Column(children: [
                                for (final p in alerts.take(8))
                                  ListTile(
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    onTap: () => openItem(context, p),
                                    leading: ProductThumb(p['thumbnail'] as String?, isCar: s.isCar, width: 40, height: 32),
                                    title: Text('${p['name'] ?? ''}',
                                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                                    trailing: StatusChip(
                                      _n(p['quantity']) <= 0 ? t('dash.out_of_stock') : t('stock.in_stock_n', {'n': groupDigits(_n(p['quantity']))}),
                                      _n(p['quantity']) <= 0 ? c.danger : c.warning,
                                    ),
                                  ),
                                if (alerts.length > 8)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Text('+${alerts.length - 8}', style: TextStyle(color: c.muted)),
                                  ),
                              ]),
                      ),
                      if (!s.isCar && _purchases.isNotEmpty)
                        Panel(
                          title: t('reports.recent_purchases'),
                          trailing: TextButton(onPressed: () => openPurchases(context), child: Text(t('app.view_all'))),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                            Text('${money(spent, s.currency)} ${t('reports.spent_word')}',
                                style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
                            for (final p in _purchases.take(10))
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 6),
                                child: Row(children: [
                                  Expanded(
                                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text('${p['product_name'] ?? ''}',
                                          maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                                      Text(
                                        [
                                          if (parseTimestamp(p['created_at']) case final d?) t.date(d),
                                          '${groupDigits(_n(p['quantity_added']))} × ${groupDigits(_n(p['cost_price']))}',
                                        ].join(' · '),
                                        style: TextStyle(color: c.muted, fontSize: 12),
                                      ),
                                    ]),
                                  ),
                                  Text(money(_n(p['total_cost']), s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                                ]),
                              ),
                          ]),
                        ),
                    ],
                  ),
                ),
              ),
            ]),
    );
  }
}

/// This week against last week for each figure, with an 8-week trend, and
/// sales and expenses week by week.
class _WeeklyPanel extends StatelessWidget {
  const _WeeklyPanel({required this.weeks});
  final List<_Week>? weeks;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final w = weeks;
    final cards = <(String, String, Color, bool money, bool goodUp)>[
      ('sales', t('dash.revenue'), c.ink, true, true),
      ('count', t('dash.sales'), c.success, false, true),
      ('expenses', t('exp.title'), c.warning, true, false),
      if (s.isCar) ...[
        ('fines', t('m.fines'), c.danger, false, false),
        ('pending', t('m.pending'), const Color(0xFF6EA8E6), false, true),
      ],
    ];
    return Panel(
      title: t('reports.weekly_title'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(t('m.weekly_sub'), style: TextStyle(color: c.muted, fontSize: 12)),
        const SizedBox(height: 10),
        if (w == null)
          const Shimmer(child: Bone(height: 150, radius: 10))
        else ...[
          GridView(
            gridDelegate:
                const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 8, crossAxisSpacing: 8, mainAxisExtent: 116),
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              for (final (k, label, color, isMoney, goodUp) in cards)
                Builder(builder: (context) {
                  final now = w.last.v[k]!, before = w[w.length - 2].v[k]!;
                  final pct = percentChange(now, before);
                  final flat = now == before;
                  final up = now > before;
                  final good = flat ? null : up == goodUp;
                  final tone = good == null ? c.muted : (good ? c.success : c.danger);
                  return Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(border: Border.all(color: c.border), borderRadius: BorderRadius.circular(10)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(label.toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c.muted)),
                        ),
                      ]),
                      const SizedBox(height: 4),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(isMoney ? compactMoney(now, s.currency) : groupDigits(now),
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                      ),
                      Text(
                        '${flat ? '=' : (up ? '↑' : '↓')} ${pct != null ? '${pct.abs().round()}%' : (flat ? '0' : t('reports.new_this_week'))} ${t('reports.vs_last_week')}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, color: tone, fontWeight: FontWeight.w600),
                      ),
                      const Spacer(),
                      SizedBox(height: 22, child: CustomPaint(size: Size.infinite, painter: _Spark([for (final x in w) x.v[k]!.toDouble()], color))),
                    ]),
                  );
                }),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(height: 150, child: _WeekBarsChart(weeks: w)),
          const SizedBox(height: 6),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (final (label, color) in [(t('dash.revenue'), c.ink), (t('exp.title'), c.warning)]) ...[
              Container(width: 9, height: 9, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
              const SizedBox(width: 4),
              Text(label, style: TextStyle(color: c.muted, fontSize: 12)),
              const SizedBox(width: 14),
            ],
          ]),
        ],
      ]),
    );
  }
}

/// Sales and expenses side by side, one pair of bars per week.
class _WeekBarsChart extends StatelessWidget {
  const _WeekBarsChart({required this.weeks});
  final List<_Week> weeks;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final t = T.of(context);
    final max = weeks.fold<num>(0, (m, w) => [m, w.v['sales']!, w.v['expenses']!].reduce((a, b) => a > b ? a : b));
    return LayoutBuilder(builder: (context, box) {
      final h = box.maxHeight - 18;
      return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (var i = 0; i < weeks.length; i++)
          Expanded(
            child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
              Row(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                for (final (k, color) in [('sales', c.ink), ('expenses', c.warning)])
                  Container(
                    width: 9,
                    margin: const EdgeInsets.symmetric(horizontal: 1),
                    height: 2 + (max <= 0 ? 0 : (h - 2) * weeks[i].v[k]! / max),
                    decoration: BoxDecoration(
                      color: i == weeks.length - 1 ? color : color.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
              ]),
              const SizedBox(height: 4),
              Text(
                t.date(DateTime.parse(weeks[i].from)),
                maxLines: 1,
                overflow: TextOverflow.clip,
                style: TextStyle(fontSize: 9, color: i == weeks.length - 1 ? c.text : c.faint),
              ),
            ]),
          ),
      ]);
    });
  }
}

class _Spark extends CustomPainter {
  _Spark(this.values, this.color);
  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final max = values.reduce((a, b) => a > b ? a : b);
    final min = values.reduce((a, b) => a < b ? a : b);
    final span = max - min == 0 ? 1 : max - min;
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = size.width * i / (values.length - 1);
      final y = size.height - 2 - (size.height - 4) * (values[i] - min) / span;
      i == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..strokeWidth = 1.8
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_Spark old) => old.values != values || old.color != color;
}
