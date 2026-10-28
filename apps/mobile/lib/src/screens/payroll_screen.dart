import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
import '../forms.dart' show groupedDigits, parseAmount;
import '../i18n.dart';
import '../live/live.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

// Payroll on the phone: the month's salaries, paying them (one person or
// everyone at once), bonuses on a salary already paid, advances, and undoing
// a payment. Same calls and rules as the website (apps/web/app/(dashboard)/
// payroll); employees are added and pay slips printed on the website. The
// owner, the manager and the accountant (expense-service PAYROLL_ROLES).

void openPayroll(BuildContext context) => pushScoped<void>(context, const PayrollScreen());

const _methods = ['cash', 'mtn', 'airtel', 'bank'];

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
String _periodOf(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';

String _shift(String period, int by) {
  final y = int.parse(period.substring(0, 4)), m = int.parse(period.substring(5, 7));
  return _periodOf(DateTime(y, m - 1 + by, 1));
}

/// "Oct 2026" in the app's language.
String _monthLabel(T t, String period) {
  final y = period.substring(0, 4), m = int.parse(period.substring(5, 7));
  return t.lang == 'zh' ? '$y年${t.months[m - 1]}' : '${t.months[m - 1]} $y';
}

void _say(BuildContext context, String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

Map<String, dynamic> _map(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Map<String, dynamic>> _list(Object? v) => (v as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

class PayrollScreen extends StatefulWidget {
  const PayrollScreen({super.key});

  @override
  State<PayrollScreen> createState() => _PayrollScreenState();
}

class _PayrollScreenState extends State<PayrollScreen> with LiveListener {
  String _period = _periodOf(DateTime.now());
  Map<String, dynamic>? _month;
  Object? _error;
  int _gen = 0;
  final _debounce = Debouncer(const Duration(milliseconds: 600));
  final _search = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) _load();
  }

  @override
  void dispose() {
    _debounce.dispose();
    _search.dispose();
    super.dispose();
  }

  // Salaries, bonuses and advances are "salaries" expenses: a change made on
  // another phone or the website shows here by itself.
  @override
  void onLive(LiveEvent e) {
    if (e.topic == 'expense' || e.isResync) _debounce(() => _load(quiet: true));
  }

  Future<void> _load({bool quiet = false}) async {
    final gen = ++_gen;
    if (!quiet) {
      setState(() {
        _month = null;
        _error = null;
      });
    }
    try {
      final res = await SessionScope.of(context).api.get('${Svc.expenses}/payroll/months/$_period');
      if (!mounted || gen != _gen) return;
      setState(() {
        _month = _map((res as Map)['data']);
        _error = null;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  void _goTo(String period) {
    _period = period;
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final month = _month;
    final rows = _list(month?['rows']);
    final totals = _map(month?['totals']);
    final due = rows.where((r) => r['payment'] == null && r['employee'] != null).toList();
    final q = _search.text.trim().toLowerCase();
    final shown = rows.where((r) {
      if (q.isEmpty) return true;
      final p = _map(r['payment']), e = _map(r['employee']);
      return ['${p['employee_name'] ?? e['full_name'] ?? ''}', '${p['position'] ?? e['position'] ?? ''}']
          .any((v) => v.toLowerCase().contains(q));
    }).toList();
    final isNow = _period == _periodOf(DateTime.now());

    return Scaffold(
      appBar: AppBar(title: Text(t('pr.title'))),
      floatingActionButton: due.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () async {
                final ok = await pushScoped<bool>(context, _PayAllScreen(period: _period, rows: due));
                if (ok == true) _load(quiet: true);
              },
              icon: const Icon(Icons.payments_outlined),
              label: Text(t('pr.mark_all', {'n': due.length})),
            ),
      body: Column(children: [
        // The month
        Container(
          color: c.chrome,
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Row(children: [
            IconButton(
                tooltip: t('pr.prev'), onPressed: () => _goTo(_shift(_period, -1)), icon: const Icon(Icons.chevron_left)),
            Expanded(
              child: Text(_monthLabel(t, _period),
                  textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            ),
            if (!isNow)
              TextButton(onPressed: () => _goTo(_periodOf(DateTime.now())), child: Text(t('pr.this_month'))),
            IconButton(
                tooltip: t('pr.next'), onPressed: () => _goTo(_shift(_period, 1)), icon: const Icon(Icons.chevron_right)),
          ]),
        ),
        const Divider(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _load(quiet: true),
            child: _error != null && month == null
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)])
                : month == null
                    ? ListView(children: const [ListSkeleton(count: 8)])
                    : ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 96),
                        children: [
                          // Where the month stands
                          Row(children: [
                            Expanded(
                              child: FigureTile(
                                label: t('pr.paid'),
                                value: money(_n(totals['paid_net']), s.currency),
                                detail: t('pr.paid_of', {'paid': _n(totals['paid_count']), 'n': _n(totals['employees'])}),
                                icon: Icons.check_circle_outline,
                                color: c.success,
                              ),
                            ),
                            Expanded(
                              child: FigureTile(
                                label: t('pr.to_pay'),
                                value: money(_n(totals['due_gross']), s.currency),
                                detail: t('pr.people_n', {'n': _n(totals['due_count'])}),
                                icon: Icons.schedule,
                                color: _n(totals['due_count']) > 0 ? c.warning : null,
                              ),
                            ),
                          ]),
                          Row(children: [
                            Expanded(
                              child: FigureTile(
                                label: t('pr.bonuses'),
                                value: money(_n(totals['paid_bonus']), s.currency),
                                detail: _n(totals['advances_outstanding']) > 0
                                    ? t('pr.advances_out', {'amount': groupDigits(_n(totals['advances_outstanding']))})
                                    : null,
                                icon: Icons.card_giftcard_outlined,
                              ),
                            ),
                            Expanded(
                              child: FigureTile(
                                label: t('pr.total'),
                                value: money(_n(totals['paid_net']) + _n(totals['due_gross']), s.currency),
                                detail: t('pr.people_n', {'n': _n(totals['employees'])}),
                                icon: Icons.groups_outlined,
                              ),
                            ),
                          ]),
                          if (rows.isEmpty)
                            EmptyState(icon: Icons.badge_outlined, message: t('pr.none'))
                          else ...[
                            if (rows.length > 4) ...[
                              const SizedBox(height: 8),
                              SearchField(controller: _search, hint: t('pr.search'), compact: true, onChanged: (_) => setState(() {})),
                            ],
                            const SizedBox(height: 8),
                            if (shown.isEmpty)
                              EmptyState(icon: Icons.search_off, message: t('pr.no_match'))
                            else
                              Card(
                                clipBehavior: Clip.antiAlias,
                                child: Column(children: [
                                  for (var i = 0; i < shown.length; i++) ...[
                                    if (i > 0) const Divider(indent: 72),
                                    _PersonRow(
                                      row: shown[i],
                                      onTap: () async {
                                        if (await _showPerson(context, shown[i], _period)) _load(quiet: true);
                                      },
                                    ),
                                  ],
                                ]),
                              ),
                            const SizedBox(height: 10),
                            Text(t('pr.web_note'), textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: c.faint)),
                          ],
                        ],
                      ),
          ),
        ),
      ]),
    );
  }
}

/// One person in the month: name and role, what they get, paid or not, and
/// what's added (bonus) or taken off (advances).
class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.row, required this.onTap});
  final Map<String, dynamic> row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final p = row['payment'] == null ? null : _map(row['payment']);
    final e = _map(row['employee']);
    final name = '${p?['employee_name'] ?? e['full_name'] ?? ''}';
    final role = '${p?['position'] ?? e['position'] ?? ''}';
    final extras = p == null ? 0 : _n(p['bonus']) + _n(p['accommodation']) + _n(p['overtime_amount']);
    final owed = _list(row['advances']).fold<num>(0, (a, x) => a + _n(x['amount']));
    final amount = p != null ? _n(p['net']) : _n(e['monthly_salary']);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(children: [
          Avatar(name: name, size: 44),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(
                [
                  if (role.isNotEmpty) role,
                  if (extras > 0) '${t('pr.bonus')} +${groupDigits(extras)}',
                  if (owed > 0) '${t('pr.advance')} -${groupDigits(owed)}',
                ].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: c.faint),
              ),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(money(amount, s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            StatusChip(p != null ? t('pr.status_paid') : t('pr.status_due'), p != null ? c.success : c.warning),
          ]),
        ]),
      ),
    );
  }
}

/// One person's month: the figures, bonuses and advances, and what can be
/// done (pay, add a bonus, give an advance, undo). True when something changed.
Future<bool> _showPerson(BuildContext context, Map<String, dynamic> row, String period) async {
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
      final p = row['payment'] == null ? null : _map(row['payment']);
      final e = row['employee'] == null ? null : _map(row['employee']);
      final name = '${p?['employee_name'] ?? e?['full_name'] ?? ''}';
      final role = '${p?['position'] ?? e?['position'] ?? ''}';
      final bonuses = _list(row['bonuses']);
      final advances = _list(row['advances']);
      final owed = advances.fold<num>(0, (a, x) => a + _n(x['amount']));
      final extras = p == null ? 0 : _n(p['bonus']) + _n(p['accommodation']) + _n(p['overtime_amount']);

      // Runs [job]; on success closes the sheet and the list reloads.
      Future<void> act(Future<bool> Function() job) async {
        if (await job() && sheet.mounted) {
          changed = true;
          Navigator.pop(sheet);
        }
      }

      Future<bool> remove(String path, String question, String name) async {
        if (!await _confirm(sheet, question, t('pr.remove_body', {'name': name}), t('app.delete'))) return false;
        try {
          if (!sheet.mounted) return false;
          await SessionScope.of(sheet).api.delete(path);
          if (sheet.mounted) _say(sheet, t('pr.removed'));
          return true;
        } catch (err) {
          if (sheet.mounted) _say(sheet, errorText(t, err));
          return false;
        }
      }

      Widget line(IconData icon, Color color, String amount, String detail, VoidCallback onRemove) => ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Icon(icon, color: color, size: 20),
            title: Text(amount, style: TextStyle(fontWeight: FontWeight.w800, color: color)),
            subtitle: Text(detail),
            trailing: IconButton(
                tooltip: t('app.delete'), onPressed: onRemove, icon: Icon(Icons.delete_outline, color: c.danger, size: 20)),
          );

      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Avatar(name: name, size: 46),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                Text([if (role.isNotEmpty) role, _monthLabel(t, period)].join(' · '),
                    style: TextStyle(color: c.faint, fontWeight: FontWeight.w500)),
              ]),
            ),
            StatusChip(p != null ? t('pr.status_paid') : t('pr.status_due'), p != null ? c.success : c.warning),
          ]),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(14)),
            child: Column(children: [
              Text(p != null ? t('pr.net') : t('pr.salary'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              FittedBox(
                child: Text(money(p != null ? _n(p['net']) : _n(e?['monthly_salary']), s.currency),
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
              ),
            ]),
          ),
          const SizedBox(height: 8),
          if (p != null) ...[
            InfoRow(t('pr.basic'), money(_n(p['gross']), s.currency)),
            if (extras > 0) InfoRow(t('pr.extras'), '+${money(extras, s.currency)}', valueColor: c.success),
            if (_n(p['deductions']) > 0)
              InfoRow(t('pr.deductions'), '-${money(_n(p['deductions']), s.currency)}', valueColor: c.danger),
            if (parseTimestamp(p['paid_on']) case final d?)
              InfoRow(t('pr.paid_on'), '${t.date(d)} ${d.year} · ${t('pm.${p['method']}')}'),
          ],
          if (bonuses.isNotEmpty) ...[
            SectionTitle(t('pr.bonuses')),
            for (final b in bonuses)
              line(
                Icons.card_giftcard_outlined,
                c.success,
                '+${money(_n(b['amount']), s.currency)}',
                [
                  if (parseTimestamp(b['given_on']) case final d?) t.date(d),
                  t('pm.${b['method']}'),
                  if ('${b['note'] ?? ''}'.isNotEmpty) '${b['note']}',
                ].join(' · '),
                () => act(() => remove('${Svc.expenses}/payroll/bonuses/${b['id']}', t('pr.remove_bonus_q'), name)),
              ),
          ],
          if (advances.isNotEmpty) ...[
            SectionTitle(t('pr.advances_to_deduct')),
            for (final a in advances)
              line(
                Icons.back_hand_outlined,
                c.warning,
                '-${money(_n(a['amount']), s.currency)}',
                [
                  if (parseTimestamp(a['given_on']) case final d?) t.date(d),
                  t('pm.${a['method']}'),
                  if ('${a['note'] ?? ''}'.isNotEmpty) '${a['note']}',
                ].join(' · '),
                () => act(() => remove('${Svc.expenses}/payroll/advances/${a['id']}', t('pr.remove_advance_q'), name)),
              ),
          ],
          const SizedBox(height: 16),
          if (p == null && e != null)
            FilledButton.icon(
              onPressed: () => act(() async =>
                  await pushScoped<bool>(sheet, _MoneyForm.pay(period: period, employee: e, advances: advances)) == true),
              icon: const Icon(Icons.payments_outlined),
              label: Text(t('pr.pay')),
            ),
          if (p != null)
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: c.success),
              onPressed: () => act(() async => await pushScoped<bool>(sheet, _MoneyForm.bonus(payment: p)) == true),
              icon: const Icon(Icons.card_giftcard_outlined),
              label: Text(t('pr.add_bonus')),
            ),
          if (e != null && e['active'] != false) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () => act(() async => await pushScoped<bool>(sheet, _MoneyForm.advance(employee: e, owed: owed)) == true),
              icon: const Icon(Icons.back_hand_outlined),
              label: Text(t('pr.give_advance')),
            ),
          ],
          if (p != null) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48), foregroundColor: c.danger, side: BorderSide(color: c.danger)),
              onPressed: () => act(() async {
                if (!await _confirm(sheet, t('pr.undo_q'), t('pr.undo_body', {'name': name}), t('pr.undo'))) return false;
                try {
                  if (!sheet.mounted) return false;
                  await SessionScope.of(sheet).api.delete('${Svc.expenses}/payroll/payments/${p['id']}');
                  if (sheet.mounted) _say(sheet, t('pr.undone'));
                  return true;
                } catch (err) {
                  if (sheet.mounted) _say(sheet, errorText(t, err));
                  return false;
                }
              }),
              icon: const Icon(Icons.undo),
              label: Text(t('pr.undo')),
            ),
          ],
        ]),
      );
    },
  );
  return changed;
}

Future<bool> _confirm(BuildContext context, String title, String body, String action) async {
  final t = T.of(context);
  final c = Hgv.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d, false), child: Text(t('app.cancel'))),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: c.danger),
          onPressed: () => Navigator.pop(d, true),
          child: Text(action),
        ),
      ],
    ),
  );
  return ok == true;
}

// ─────────────────────────── Forms ───────────────────────────

enum _Kind { pay, bonus, advance }

/// Paying a salary, adding a bonus to one already paid, or giving an
/// advance: an amount (or a few), a date, how it was paid. True when saved.
class _MoneyForm extends StatefulWidget {
  const _MoneyForm.pay({required String this.period, required Map<String, dynamic> this.employee, required this.advances})
      : kind = _Kind.pay,
        payment = null,
        owed = 0;
  const _MoneyForm.bonus({required Map<String, dynamic> this.payment})
      : kind = _Kind.bonus,
        period = null,
        employee = null,
        advances = const [],
        owed = 0;
  const _MoneyForm.advance({required Map<String, dynamic> this.employee, required this.owed})
      : kind = _Kind.advance,
        period = null,
        payment = null,
        advances = const [];

  final _Kind kind;
  final String? period;
  final Map<String, dynamic>? employee, payment;
  final List<Map<String, dynamic>> advances;

  /// Advances already given and not yet deducted (an advance's limit).
  final num owed;

  @override
  State<_MoneyForm> createState() => _MoneyFormState();
}

class _MoneyFormState extends State<_MoneyForm> {
  final _amount = TextEditingController(), _bonus = TextEditingController(), _deductions = TextEditingController();
  final _note = TextEditingController(), _reference = TextEditingController();
  DateTime _date = DateTime.now();
  late String _method;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _method = widget.kind == _Kind.bonus && _methods.contains(widget.payment?['method']) ? '${widget.payment!['method']}' : 'cash';
    if (widget.kind == _Kind.pay) _amount.text = groupDigits(_n(widget.employee!['monthly_salary']).round());
    for (final c in [_amount, _bonus, _deductions]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    for (final c in [_amount, _bonus, _deductions, _note, _reference]) {
      c.dispose();
    }
    super.dispose();
  }

  num get _a => parseAmount(_amount.text) ?? 0;
  num get _b => parseAmount(_bonus.text) ?? 0;
  num get _d => parseAmount(_deductions.text) ?? 0;

  /// Advances given up to the payment date come off this salary (the server does the same).
  num get _advanced => widget.advances
      .where((a) => '${a['given_on']}'.compareTo(ymd(_date)) <= 0)
      .fold<num>(0, (s, a) => s + _n(a['amount']));

  num get _maxAdvance => (_n(widget.employee?['monthly_salary']) - widget.owed).clamp(0, double.infinity);

  Future<void> _save() async {
    final t = T.of(context);
    final api = SessionScope.of(context).api;
    if (!(_a > 0)) return _say(context, t('pr.need_amount'));
    final body = <String, dynamic>{
      'method': _method,
      'reference': _reference.text.trim().isEmpty ? null : _reference.text.trim(),
    };
    final String path;
    final String done;
    switch (widget.kind) {
      case _Kind.pay:
        if (_d > 0 && _note.text.trim().isEmpty) return _say(context, t('pr.need_reason'));
        path = '${Svc.expenses}/payroll/payments';
        body.addAll({
          'employee_id': widget.employee!['id'],
          'period': widget.period,
          'gross': _a,
          'bonus': _b,
          'accommodation': 0,
          'overtime_hours': 0,
          'overtime_amount': 0,
          'deductions': _d,
          'deduction_note': _note.text.trim().isEmpty ? null : _note.text.trim(),
          'paid_on': ymd(_date),
        });
        done = t('pr.paid_ok', {'name': '${widget.employee!['full_name']}'});
      case _Kind.bonus:
        path = '${Svc.expenses}/payroll/payments/${widget.payment!['id']}/bonuses';
        body.addAll({'amount': _a, 'given_on': ymd(_date), 'note': _note.text.trim().isEmpty ? null : _note.text.trim()});
        done = t('pr.bonus_ok', {'name': '${widget.payment!['employee_name']}'});
      case _Kind.advance:
        if (_a > _maxAdvance) return _say(context, t('pr.max_advance', {'max': groupDigits(_maxAdvance)}));
        path = '${Svc.expenses}/payroll/advances';
        body.addAll({
          'employee_id': widget.employee!['id'],
          'amount': _a,
          'given_on': ymd(_date),
          'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
        });
        done = t('pr.advance_ok', {'name': '${widget.employee!['full_name']}'});
    }
    setState(() => _saving = true);
    try {
      await api.post(path, body);
      if (!mounted) return;
      _say(context, done);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        _say(context, errorText(t, e));
      }
    }
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2020), lastDate: DateTime.now());
    if (d != null) setState(() => _date = d);
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final name = '${widget.employee?['full_name'] ?? widget.payment?['employee_name'] ?? ''}';
    final (title, save) = switch (widget.kind) {
      _Kind.pay => (t('pr.pay_title', {'name': name}), t('pr.pay')),
      _Kind.bonus => (t('pr.bonus_title', {'name': name}), t('pr.add_bonus')),
      _Kind.advance => (t('pr.advance_title', {'name': name}), t('pr.give_advance')),
    };
    // What the person receives, as it will be recorded.
    final (resultLabel, result) = switch (widget.kind) {
      _Kind.pay => (t('pr.net'), _a + _b - _advanced - _d),
      _Kind.bonus => (t('pr.new_net'), _n(widget.payment!['net']) + _a),
      _Kind.advance => (t('pr.amount'), _a),
    };

    Widget field(String label, Widget child, {String? hint}) => Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.muted)),
            const SizedBox(height: 6),
            child,
            if (hint != null) ...[
              const SizedBox(height: 4),
              Text(hint, style: TextStyle(fontSize: 12, color: c.faint)),
            ],
          ]),
        );
    Widget amount(TextEditingController ctl, {bool autofocus = false}) => TextField(
          controller: ctl,
          autofocus: autofocus,
          keyboardType: TextInputType.number,
          inputFormatters: [groupedDigits()],
          decoration: InputDecoration(hintText: '0', suffixText: s.currency),
        );
    Widget text(TextEditingController ctl, String hint) =>
        TextField(controller: ctl, textCapitalization: TextCapitalization.sentences, decoration: InputDecoration(hintText: hint));

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(padding: const EdgeInsets.fromLTRB(14, 8, 14, 24), children: [
        switch (widget.kind) {
          _Kind.pay => field(t('pr.salary'), amount(_amount)),
          _Kind.bonus => field(t('pr.bonus'), amount(_amount, autofocus: true)),
          _Kind.advance => field(t('pr.amount'), amount(_amount, autofocus: true),
              hint: t('pr.max_advance', {'max': groupDigits(_maxAdvance)})),
        },
        if (widget.kind == _Kind.pay) ...[
          field('${t('pr.bonus')} ${t('pr.optional')}', amount(_bonus)),
          field('${t('pr.deductions')} ${t('pr.optional')}', amount(_deductions)),
          if (_d > 0) field(t('pr.deduction_note'), text(_note, t('pr.deduction_hint'))),
          if (_advanced > 0)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: InfoRow(t('pr.advances_to_deduct'), '-${money(_advanced, s.currency)}', valueColor: c.warning),
            ),
        ] else
          field('${t('pr.reason')} ${t('pr.optional')}',
              text(_note, widget.kind == _Kind.bonus ? t('pr.reason_bonus_hint') : t('pr.reason_advance_hint'))),
        field(
          t('pr.date'),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), alignment: Alignment.centerLeft),
            onPressed: _pickDate,
            icon: const Icon(Icons.event_outlined),
            label: Text('${t.weekday(_date.weekday)} ${t.date(_date)} ${_date.year}'),
          ),
        ),
        field(
          t('pr.method'),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final m in _methods)
              ChoiceChip(
                  label: Text(t('pm.$m')), selected: m == _method, showCheckmark: false, onSelected: (_) => setState(() => _method = m)),
          ]),
        ),
        field('${t('pr.reference')} ${t('pr.optional')}', text(_reference, '')),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
          child: Row(children: [
            Expanded(child: Text(resultLabel, style: TextStyle(color: c.muted, fontWeight: FontWeight.w600))),
            Text(money(result, s.currency),
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: result < 0 ? c.danger : c.text)),
          ]),
        ),
        const SizedBox(height: 8),
        Text(widget.kind == _Kind.bonus ? t('pr.bonus_hint') : t('pr.expense_hint'), style: TextStyle(fontSize: 12, color: c.faint)),
      ]),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: FilledButton(
            style: widget.kind == _Kind.bonus ? FilledButton.styleFrom(backgroundColor: c.success) : null,
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                : Text(save),
          ),
        ),
      ),
    );
  }
}

/// Everyone still to pay this month at once: each gets their monthly salary
/// with their advances deducted, plus a bonus typed beside them; one date
/// and one way of paying. True when at least one was paid.
class _PayAllScreen extends StatefulWidget {
  const _PayAllScreen({required this.period, required this.rows});
  final String period;
  final List<Map<String, dynamic>> rows;

  @override
  State<_PayAllScreen> createState() => _PayAllScreenState();
}

class _PayAllScreenState extends State<_PayAllScreen> {
  late final _bonus = {for (final r in widget.rows) '${_map(r['employee'])['id']}': TextEditingController()};
  DateTime _date = DateTime.now();
  String _method = 'bank';
  int? _done; // how many are saved, while saving

  @override
  void initState() {
    super.initState();
    for (final c in _bonus.values) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    for (final c in _bonus.values) {
      c.dispose();
    }
    super.dispose();
  }

  num _advanced(Map<String, dynamic> r) => _list(r['advances'])
      .where((a) => '${a['given_on']}'.compareTo(ymd(_date)) <= 0)
      .fold<num>(0, (s, a) => s + _n(a['amount']));

  Future<void> _save() async {
    final t = T.of(context);
    final api = SessionScope.of(context).api;
    final failed = <String>[];
    var paid = 0;
    setState(() => _done = 0);
    for (final r in widget.rows) {
      final e = _map(r['employee']);
      try {
        await api.post('${Svc.expenses}/payroll/payments', {
          'employee_id': e['id'],
          'period': widget.period,
          'gross': _n(e['monthly_salary']),
          'bonus': parseAmount(_bonus['${e['id']}']!.text) ?? 0,
          'accommodation': 0,
          'overtime_hours': 0,
          'overtime_amount': 0,
          'deductions': 0,
          'deduction_note': null,
          'paid_on': ymd(_date),
          'method': _method,
          'reference': null,
        });
        paid++;
      } catch (err) {
        failed.add('${e['full_name']}: ${errorText(t, err)}');
      }
      if (mounted) setState(() => _done = (_done ?? 0) + 1);
    }
    if (!mounted) return;
    _say(context, failed.isEmpty ? t('pr.paid_n', {'n': paid}) : failed.join('\n'));
    Navigator.pop(context, paid > 0);
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final saving = _done != null;
    num total = 0;
    final lines = [
      for (final r in widget.rows)
        () {
          final e = _map(r['employee']);
          final adv = _advanced(r);
          final net = _n(e['monthly_salary']) + (parseAmount(_bonus['${e['id']}']!.text) ?? 0) - adv;
          total += net < 0 ? 0 : net;
          return (e: e, adv: adv, net: net);
        }(),
    ];
    return PopScope(
      canPop: !saving,
      child: Scaffold(
        appBar: AppBar(title: Text(t('pr.mark_all_title', {'n': widget.rows.length}))),
        body: ListView(padding: const EdgeInsets.fromLTRB(8, 8, 8, 24), children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 0, 6, 8),
            child: Text(t('pr.mark_all_hint'), style: TextStyle(fontSize: 13, color: c.muted)),
          ),
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(children: [
              for (var i = 0; i < lines.length; i++) ...[
                if (i > 0) const Divider(indent: 12, endIndent: 12),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${lines[i].e['full_name']}',
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text(
                          [
                            groupDigits(_n(lines[i].e['monthly_salary'])),
                            if (lines[i].adv > 0) '${t('pr.advance')} -${groupDigits(lines[i].adv)}',
                          ].join(' · '),
                          style: TextStyle(fontSize: 12, color: c.faint),
                        ),
                        const SizedBox(height: 2),
                        Text(money(lines[i].net, s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                      ]),
                    ),
                    SizedBox(
                      width: 118,
                      child: TextField(
                        controller: _bonus['${lines[i].e['id']}'],
                        enabled: !saving,
                        keyboardType: TextInputType.number,
                        inputFormatters: [groupedDigits()],
                        textAlign: TextAlign.right,
                        decoration: InputDecoration(isDense: true, labelText: t('pr.bonus'), hintText: '0'),
                      ),
                    ),
                  ]),
                ),
              ],
            ]),
          ),
          const SizedBox(height: 12),
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), alignment: Alignment.centerLeft),
                onPressed: saving
                    ? null
                    : () async {
                        final d = await showDatePicker(
                            context: context, initialDate: _date, firstDate: DateTime(2020), lastDate: DateTime.now());
                        if (d != null) setState(() => _date = d);
                      },
                icon: const Icon(Icons.event_outlined),
                label: Text('${t('pr.date')}: ${t.weekday(_date.weekday)} ${t.date(_date)} ${_date.year}'),
              ),
              const SizedBox(height: 10),
              Wrap(spacing: 6, runSpacing: 6, children: [
                for (final m in _methods)
                  ChoiceChip(
                      label: Text(t('pm.$m')),
                      selected: m == _method,
                      showCheckmark: false,
                      onSelected: saving ? null : (_) => setState(() => _method = m)),
              ]),
            ]),
          ),
        ]),
        bottomNavigationBar: SafeArea(
          child: Container(
            decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: FilledButton(
              onPressed: saving ? null : _save,
              child: saving
                  ? Text('${_done ?? 0}/${widget.rows.length}')
                  : Text('${t('pr.pay')} · ${money(total, s.currency)}'),
            ),
          ),
        ),
      ),
    );
  }
}
