import 'package:flutter/material.dart';

import '../config.dart';
import '../expense_proof.dart';
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
/// first, and a button to record one. An expense opens its details, to edit
/// it (deleting is for the system admin only). The owner, the manager and the accountant
/// (expense-service's EXPENSE_ROLES).
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
                                    onTap: () async {
                                      if (await showExpenseSheet(context, items[i])) _load(quiet: true);
                                    },
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

/// One expense: how much, what for, when and how it was paid; Edit and
/// Delete. True when it was changed or deleted (the list reloads).
Future<bool> showExpenseSheet(BuildContext context, Map<String, dynamic> e) async {
  var changed = false;
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Hgv.of(context).elevated,
    builder: (sheet) {
      final t = T.of(sheet);
      final c = Hgv.of(sheet);
      final s = SessionScope.of(sheet);
      num n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
      final category = expenseCategories.contains(e['category']) ? e['category'] : 'other';
      final date = parseTimestamp(e['expense_date']);
      String text(Object? v) => '${v ?? ''}'.trim();
      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            IconAvatar(icon: Icons.receipt_long_outlined, color: c.warning, size: 46),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(text(e['title']), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                Text(t('exp.cat_$category'), style: TextStyle(color: c.faint, fontWeight: FontWeight.w500)),
              ]),
            ),
          ]),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(14)),
            child: Column(children: [
              Text(t('form.amount'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              FittedBox(
                child: Text(money(n(e['amount']), s.currency), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
              ),
            ]),
          ),
          const SizedBox(height: 10),
          if (date != null) InfoRow(t('sale.time'), '${t.weekday(date.weekday)} ${t.date(date)} ${date.year}'),
          if (text(e['payment_method']).isNotEmpty) InfoRow(t('form.paid_with'), t('pm.${e['payment_method']}')),
          if (text(e['bank_name']).isNotEmpty) InfoRow(t('form.bank_name'), text(e['bank_name'])),
          if (text(e['bank_account']).isNotEmpty) InfoRow(t('form.bank_account'), text(e['bank_account'])),
          if (text(e['receiver_phone']).isNotEmpty) InfoRow(t('form.receiver_phone'), text(e['receiver_phone'])),
          if (text(e['notes']).isNotEmpty) ...[
            const Divider(height: 24),
            Text(t('sale.notes'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(text(e['notes'])),
          ],
          const SizedBox(height: 14),
          _ProofButton(expense: e, onAdded: () => changed = true),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () async {
                  if (await editExpense(sheet, e) && sheet.mounted) {
                    changed = true;
                    Navigator.pop(sheet);
                  }
                },
                icon: const Icon(Icons.edit_outlined),
                label: Text(t('app.edit')),
              ),
            ),
            if (s.canDeleteExpenses) ...[
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50), foregroundColor: c.danger, side: BorderSide(color: c.danger)),
                onPressed: () async {
                  if (await deleteExpense(sheet, e) && sheet.mounted) {
                    changed = true;
                    Navigator.pop(sheet);
                  }
                },
                icon: const Icon(Icons.delete_outline),
                label: Text(t('app.delete')),
              ),
            ),
            ],
          ]),
        ]),
      );
    },
  );
  return changed;
}

/// View the expense's proof, or attach receipt photos when it has none
/// (an expense recorded without proof can get it later, as on the website).
class _ProofButton extends StatefulWidget {
  const _ProofButton({required this.expense, required this.onAdded});
  final Map<String, dynamic> expense;
  final VoidCallback onAdded;

  @override
  State<_ProofButton> createState() => _ProofButtonState();
}

class _ProofButtonState extends State<_ProofButton> {
  var _busy = false;

  bool get _hasProof => widget.expense['has_proof'] == true;

  Future<void> _run(Future<void> Function() job) async {
    setState(() => _busy = true);
    try {
      await job();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(T.of(context), e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _add() async {
    final t = T.of(context);
    final s = SessionScope.of(context);
    final files = await pickProofPhotos(context);
    if (files.isEmpty || !mounted) return;
    await _run(() async {
      await uploadExpenseProof(s, '${widget.expense['id']}', files);
      widget.expense['has_proof'] = true;
      widget.onAdded();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('exp.proof_added'))));
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
      onPressed: _busy ? null : (_hasProof ? () => _run(() => showExpenseProof(context, '${widget.expense['id']}')) : _add),
      icon: _busy
          ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(_hasProof ? Icons.attach_file : Icons.add_a_photo_outlined),
      label: Text(_hasProof ? t('exp.view_proof') : t('exp.add_proof')),
    );
  }
}
