import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
import '../forms.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

void openExpenses(BuildContext context) => pushScoped<void>(context, const ExpensesScreen());

/// What the business spent this month (or the last 7 / 90 days), newest
/// first, and a button to record one. Owners and staff of shops; never car
/// company staff (the server refuses them too).
class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({super.key});

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> with LiveListener {
  static const _periods = [(7, 'sales.7d'), (30, 'sales.30d'), (90, 'exp.90d')];
  int _days = 30;
  List<Map<String, dynamic>>? _items;
  int _total = 0;
  Object? _error;
  int _gen = 0;
  final _debounce = Debouncer(const Duration(milliseconds: 600));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) _load();
  }

  @override
  void dispose() {
    _debounce.dispose();
    super.dispose();
  }

  @override
  void onLive(LiveEvent e) {
    if (e.topic == 'expense' || e.isResync) _debounce(() => _load(quiet: true));
  }

  Future<void> _load({bool quiet = false}) async {
    final gen = ++_gen;
    if (!quiet) {
      setState(() {
        _items = null;
        _error = null;
      });
    }
    final range = lastDays(_days);
    try {
      final res = await SessionScope.of(context)
          .api
          .get('${Svc.expenses}/expenses', query: {'page': '1', 'limit': '100', 'from_date': range.from, 'to_date': range.to});
      final data = (res as Map)['data'] as Map? ?? {};
      if (!mounted || gen != _gen) return;
      setState(() {
        _items = (data['items'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _total = (data['total'] as num? ?? 0).toInt();
        _error = null;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final items = _items;
    num n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
    final spent = items?.fold<num>(0, (a, e) => a + n(e['amount'])) ?? 0;
    return Scaffold(
      appBar: AppBar(title: Text(t('exp.title'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          if (await recordExpense(context)) _load(quiet: true);
        },
        icon: const Icon(Icons.add),
        label: Text(t('form.new_expense')),
      ),
      body: Column(children: [
        Container(
          color: c.chrome,
          padding: const EdgeInsets.fromLTRB(10, 2, 10, 8),
          child: SegmentedButton<int>(
            segments: [for (final p in _periods) ButtonSegment(value: p.$1, label: Text(t(p.$2)))],
            selected: {_days},
            showSelectedIcon: false,
            onSelectionChanged: (v) {
              _days = v.first;
              _load();
            },
          ),
        ),
        const Divider(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _load(quiet: true),
            child: _error != null && items == null
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)])
                : items == null
                    ? ListView(children: const [ListSkeleton(count: 8)])
                    : ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 96),
                        children: [
                          FigureTile(
                            label: t('exp.spent'),
                            value: money(spent, s.currency),
                            detail: t('exp.count_n', {'n': _total}),
                            icon: Icons.payments_outlined,
                          ),
                          if (items.isEmpty)
                            EmptyState(icon: Icons.receipt_outlined, message: t('exp.none'))
                          else ...[
                            const SizedBox(height: 8),
                            Card(
                              clipBehavior: Clip.antiAlias,
                              child: Column(children: [
                                for (var i = 0; i < items.length; i++) ...[
                                  if (i > 0) const Divider(indent: 16, endIndent: 16),
                                  ListTile(
                                    title: Text('${items[i]['title'] ?? ''}',
                                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                                    subtitle: Text([
                                      t('exp.cat_${expenseCategories.contains(items[i]['category']) ? items[i]['category'] : 'other'}'),
                                      if (parseTimestamp(items[i]['expense_date']) case final d?) t.date(d),
                                      if (items[i]['payment_method'] != null) t('pm.${items[i]['payment_method']}'),
                                    ].join(' · ')),
                                    trailing: Text(money(n(items[i]['amount']), s.currency),
                                        style: const TextStyle(fontWeight: FontWeight.w800)),
                                  ),
                                ],
                              ]),
                            ),
                          ],
                        ],
                      ),
          ),
        ),
      ]),
    );
  }
}
