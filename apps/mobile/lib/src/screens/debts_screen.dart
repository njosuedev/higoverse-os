import 'package:flutter/material.dart';

import '../charts.dart';
import '../config.dart';
import '../format.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';

/// Who owes the business money: outstanding first, or the ones paid off.
/// Updates by itself when a debt is recorded or paid.
class DebtsScreen extends StatefulWidget {
  const DebtsScreen({super.key});

  @override
  State<DebtsScreen> createState() => _DebtsScreenState();
}

class _DebtsScreenState extends State<DebtsScreen> with LiveListener {
  bool _paid = false;
  List<Map<String, dynamic>>? _items;
  num _outstanding = 0;
  Object? _error;
  int _gen = 0;
  final _debounce = Debouncer(const Duration(milliseconds: 600));
  final Set<String> _flash = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_items == null && _error == null && _gen == 0) _load();
  }

  @override
  void dispose() {
    _debounce.dispose();
    super.dispose();
  }

  @override
  void onLive(LiveEvent e) {
    if (e.topic == 'debt' || e.isResync) {
      if (e.data['id'] != null) _flash.add('${e.data['id']}');
      _debounce(() => _load(quiet: true));
    }
  }

  Future<void> _load({bool quiet = false}) async {
    final gen = ++_gen;
    if (!quiet) {
      setState(() {
        _items = null;
        _error = null;
      });
    }
    try {
      final res = await SessionScope.of(context).api.get('${Svc.sales}/debts', query: {'is_paid': '$_paid'});
      final data = (res as Map)['data'] as Map? ?? {};
      if (!mounted || gen != _gen) return;
      setState(() {
        _items = (data['items'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _outstanding = data['total_outstanding'] as num? ?? 0;
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
    return Scaffold(
      appBar: AppBar(title: Text(t('debts.title'))),
      body: Column(children: [
        Container(
          color: c.chrome,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: SegmentedButton<bool>(
            segments: [
              ButtonSegment(value: false, label: Text(t('debts.outstanding'))),
              ButtonSegment(value: true, label: Text(t('debts.paid'))),
            ],
            selected: {_paid},
            showSelectedIcon: false,
            onSelectionChanged: (v) {
              _paid = v.first;
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
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                        children: [
                          if (!_paid)
                            Panel(
                              child: Row(children: [
                                IconAvatar(icon: Icons.account_balance_wallet_outlined, color: c.warning, size: 46),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(t('debts.total_owed'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
                                    FittedBox(
                                      fit: BoxFit.scaleDown,
                                      alignment: Alignment.centerLeft,
                                      child: Text(money(_outstanding, s.currency),
                                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                                    ),
                                    Text(t('dash.owed_detail', {'n': items.length}), style: TextStyle(color: c.faint, fontSize: 13)),
                                  ]),
                                ),
                              ]),
                            ),
                          if (items.isEmpty)
                            EmptyState(
                                icon: Icons.verified_outlined, message: _paid ? t('debts.none_paid') : t('debts.none'))
                          else ...[
                            const SizedBox(height: 12),
                            Card(
                              clipBehavior: Clip.antiAlias,
                              child: Column(children: [
                                for (var i = 0; i < items.length; i++) ...[
                                  if (i > 0) const Divider(indent: 72),
                                  _DebtRow(
                                    key: ValueKey('${items[i]['id']}:${items[i]['amount_paid']}'),
                                    debt: items[i],
                                    flash: _flash.remove('${items[i]['id']}'),
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

class _DebtRow extends StatelessWidget {
  const _DebtRow({super.key, required this.debt, required this.flash});
  final Map<String, dynamic> debt;
  final bool flash;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    num n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
    final owed = n(debt['amount_owed']), paid = n(debt['amount_paid']);
    final balance = debt['balance'] == null ? owed - paid : n(debt['balance']);
    final settled = debt['is_paid'] == true;
    return Flash(
      flash: flash,
      child: InkWell(
        onTap: () => showDebtSheet(context, debt),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(children: [
            Avatar(name: '${debt['debtor_name'] ?? ''}', size: 44),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text('${debt['debtor_name'] ?? ''}',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  Text(money(settled ? owed : balance, s.currency),
                      style: TextStyle(fontWeight: FontWeight.w800, color: settled ? c.success : c.warning)),
                ]),
                const SizedBox(height: 6),
                Meter(value: owed <= 0 ? 1 : paid / owed, color: c.success),
                const SizedBox(height: 4),
                Text(
                  [
                    if ('${debt['phone'] ?? ''}'.isNotEmpty) '${debt['phone']}',
                    t.dateTime(debt['created_at'] as String?),
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: c.faint),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
