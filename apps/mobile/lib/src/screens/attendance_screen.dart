import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config.dart';
import '../forms.dart' show say;
import '../i18n.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

void openAttendance(BuildContext context) => pushScoped<void>(context, const AttendanceScreen());

/// The five marks a day can get (expense-service's attendance statuses).
const attendanceStatuses = ['present', 'absent', 'late', 'leave', 'sick'];

/// Each mark's colour: the chosen button, the day's square in Month.
Color attendanceColor(BuildContext context, String status) {
  final c = Hgv.of(context);
  return switch (status) {
    'present' => c.success,
    'absent' => c.danger,
    'late' => c.warning,
    'leave' => c.ink,
    _ => const Color(0xFF7C3AED),
  };
}

String _ymd(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
DateTime _parseDay(String d) => DateTime(int.parse(d.substring(0, 4)), int.parse(d.substring(5, 7)), int.parse(d.substring(8, 10)));
String _shiftDay(String d, int by) => _ymd(_parseDay(d).add(Duration(days: by)));
String _periodOf(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';
String _shiftPeriod(String p, int by) => _periodOf(DateTime(int.parse(p.substring(0, 4)), int.parse(p.substring(5, 7)) - 1 + by, 1));
String _monthLabel(T t, String p) {
  final y = p.substring(0, 4), m = int.parse(p.substring(5, 7));
  return t.lang == 'zh' ? '$y年${t.months[m - 1]}' : '${t.months[m - 1]} $y';
}

Map<String, dynamic> _map(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Map<String, dynamic>> _list(Object? v) => (v as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

/// Attendance: each day, who came to work — present, absent, late, on leave
/// or sick, with a note — for the people on Payroll. Month adds up each
/// person's days. Owner, admin, manager and accountant, as for Payroll.
class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  bool _month = false;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t('att.title'))),
      body: !s.canUsePayroll
          ? EmptyState(icon: Icons.lock_outline, message: t('att.not_allowed'))
          : Column(children: [
              Container(
                color: c.chrome,
                padding: const EdgeInsets.fromLTRB(10, 2, 10, 8),
                child: SegmentedButton<bool>(
                  segments: [
                    ButtonSegment(value: false, label: Text(t('att.tab_day'))),
                    ButtonSegment(value: true, label: Text(t('att.tab_month'))),
                  ],
                  selected: {_month},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) => setState(() => _month = v.first),
                ),
              ),
              const Divider(),
              Expanded(child: _month ? const _MonthView() : const _DayView()),
            ]),
    );
  }
}

class _DayView extends StatefulWidget {
  const _DayView();

  @override
  State<_DayView> createState() => _DayViewState();
}

class _DayViewState extends State<_DayView> {
  String _day = _ymd(DateTime.now());
  Map<String, dynamic>? _data;
  Object? _error;

  /// The employee being saved, or 'all'.
  String? _busy;
  int _gen = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) _load();
  }

  Future<void> _load() async {
    final gen = ++_gen;
    setState(() {
      _data = null;
      _error = null;
    });
    try {
      final res = await SessionScope.of(context).api.get('${Svc.expenses}/payroll/attendance/day/$_day');
      if (mounted && gen == _gen) setState(() => _data = _map((res as Map?)?['data']));
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  void _go(String day) {
    _day = day;
    _load();
  }

  Future<void> _save(List<Map<String, dynamic>> marks, String who) async {
    final t = T.of(context);
    setState(() => _busy = who);
    try {
      final res = await SessionScope.of(context).api.put('${Svc.expenses}/payroll/attendance/day/$_day', {'marks': marks});
      HapticFeedback.selectionClick();
      if (mounted) setState(() => _data = _map((res as Map?)?['data']));
    } catch (e) {
      if (mounted) say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _note(Map<String, dynamic> employee, Map<String, dynamic> mark) async {
    final t = T.of(context);
    final ctrl = TextEditingController(text: '${mark['note'] ?? ''}');
    final note = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('${employee['full_name'] ?? ''}'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLength: 255,
          decoration: InputDecoration(hintText: t('att.note_hint')),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: Text(t('app.cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
            onPressed: () => Navigator.pop(d, ctrl.text.trim()),
            child: Text(t('form.save')),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (note == null || !mounted) return;
    await _save([
      {'employee_id': employee['id'], 'status': mark['status'], 'note': note.isEmpty ? null : note}
    ], '${employee['id']}');
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final data = _data;
    final today = '${data?['today'] ?? _ymd(DateTime.now())}';
    final isToday = _day.compareTo(today) >= 0;
    final rows = _list(data?['rows']);
    final counts = {
      for (final k in [...attendanceStatuses, 'unmarked']) k: 0
    };
    for (final r in rows) {
      final st = _map(r['mark'])['status'] as String? ?? 'unmarked';
      counts[st] = (counts[st] ?? 0) + 1;
    }
    final d = _parseDay(_day);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 24),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 4, 10),
              child: Column(children: [
                Row(children: [
                  IconButton(tooltip: t('att.prev_day'), onPressed: () => _go(_shiftDay(_day, -1)), icon: const Icon(Icons.chevron_left)),
                  Expanded(
                    child: Text('${t.weekday(d.weekday)} ${t.date(d)} ${d.year}',
                        textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  ),
                  IconButton(
                      tooltip: t('att.next_day'), onPressed: isToday ? null : () => _go(_shiftDay(_day, 1)), icon: const Icon(Icons.chevron_right)),
                ]),
                if (!isToday) TextButton(onPressed: () => _go(today), child: Text(t('att.today'))),
                Wrap(spacing: 12, runSpacing: 4, alignment: WrapAlignment.center, children: [
                  for (final st in attendanceStatuses)
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Container(width: 9, height: 9, decoration: BoxDecoration(color: attendanceColor(context, st), shape: BoxShape.circle)),
                      const SizedBox(width: 5),
                      Text('${t('att.$st')} ', style: TextStyle(color: c.muted, fontSize: 13)),
                      Text('${counts[st]}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                    ]),
                  Text('${t('att.unmarked')} ${counts['unmarked']}', style: TextStyle(color: c.muted, fontSize: 13)),
                ]),
                if ((counts['unmarked'] ?? 0) > 0 && data != null) ...[
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                    onPressed: _busy != null
                        ? null
                        : () => _save([
                              for (final r in rows)
                                if (r['mark'] == null) {'employee_id': _map(r['employee'])['id'], 'status': 'present', 'note': null}
                            ], 'all'),
                    icon: const Icon(Icons.done_all),
                    label: Text(t('att.all_present')),
                  ),
                ],
              ]),
            ),
          ),
          const SizedBox(height: 8),
          if (_error != null && data == null)
            EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)
          else if (data == null)
            const ListSkeleton(count: 5, leading: RowLead.circle)
          else if (rows.isEmpty)
            EmptyState(icon: Icons.event_available_outlined, message: t('att.none'))
          else
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(children: [
                for (var i = 0; i < rows.length; i++) ...[
                  if (i > 0) const Divider(indent: 16, endIndent: 16),
                  _EmployeeDay(
                    employee: _map(rows[i]['employee']),
                    mark: rows[i]['mark'] == null ? null : _map(rows[i]['mark']),
                    busy: _busy != null,
                    onMark: (e, st, note) => _save([
                      {'employee_id': e['id'], 'status': st, 'note': note}
                    ], '${e['id']}'),
                    onNote: _note,
                  ),
                ],
              ]),
            ),
        ],
      ),
    );
  }
}

class _EmployeeDay extends StatelessWidget {
  const _EmployeeDay({required this.employee, required this.mark, required this.busy, required this.onMark, required this.onNote});
  final Map<String, dynamic> employee;
  final Map<String, dynamic>? mark;
  final bool busy;
  final void Function(Map<String, dynamic> employee, String? status, String? note) onMark;
  final void Function(Map<String, dynamic> employee, Map<String, dynamic> mark) onNote;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final m = mark;
    final current = m?['status'] as String?;
    final note = '${m?['note'] ?? ''}'.trim();
    final by = '${m?['marked_by_name'] ?? ''}'.trim();
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Avatar(name: '${employee['full_name'] ?? '?'}', size: 36),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${employee['full_name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(
                [
                  if ('${employee['position'] ?? ''}'.trim().isNotEmpty) '${employee['position']}',
                  if (by.isNotEmpty) t('att.marked_by', {'name': by}),
                ].join(' · '),
                style: TextStyle(color: c.muted, fontSize: 12),
              ),
            ]),
          ),
          if (m != null)
            IconButton(
              tooltip: t('att.note_hint'),
              onPressed: busy ? null : () => onNote(employee, m),
              icon: Icon(note.isEmpty ? Icons.note_add_outlined : Icons.sticky_note_2_outlined, color: note.isEmpty ? c.faint : c.ink),
            ),
        ]),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final st in attendanceStatuses)
            ChoiceChip(
              label: Text(t('att.$st')),
              selected: current == st,
              showCheckmark: false,
              selectedColor: attendanceColor(context, st),
              labelStyle: TextStyle(color: current == st ? Colors.white : null, fontWeight: FontWeight.w600),
              // Tapping the chosen one again clears the mark.
              onSelected: busy ? null : (_) => onMark(employee, current == st ? null : st, note.isEmpty ? null : note),
            ),
        ]),
        if (note.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(note, style: TextStyle(color: c.muted, fontSize: 13, fontStyle: FontStyle.italic)),
        ],
      ]),
    );
  }
}

class _MonthView extends StatefulWidget {
  const _MonthView();

  @override
  State<_MonthView> createState() => _MonthViewState();
}

class _MonthViewState extends State<_MonthView> {
  String _period = _periodOf(DateTime.now());
  Map<String, dynamic>? _data;
  Object? _error;
  int _gen = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) _load();
  }

  Future<void> _load() async {
    final gen = ++_gen;
    setState(() {
      _data = null;
      _error = null;
    });
    try {
      final res = await SessionScope.of(context).api.get('${Svc.expenses}/payroll/attendance/month/$_period');
      if (mounted && gen == _gen) setState(() => _data = _map((res as Map?)?['data']));
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final data = _data;
    final rows = _list(data?['rows']);
    // Newest day first; days still to come are left out.
    final days = <String>[];
    if (data != null && data['first'] is String && data['last'] is String) {
      final today = '${data['today']}';
      final last = '${data['last']}'.compareTo(today) < 0 ? '${data['last']}' : today;
      for (var d = last; d.compareTo('${data['first']}') >= 0; d = _shiftDay(d, -1)) {
        days.add(d);
      }
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 24),
        children: [
          Card(
            child: Row(children: [
              IconButton(
                  onPressed: () {
                    _period = _shiftPeriod(_period, -1);
                    _load();
                  },
                  icon: const Icon(Icons.chevron_left)),
              Expanded(
                child: Text(_monthLabel(t, _period), textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              ),
              IconButton(
                  onPressed: _period == _periodOf(DateTime.now())
                      ? null
                      : () {
                          _period = _shiftPeriod(_period, 1);
                          _load();
                        },
                  icon: const Icon(Icons.chevron_right)),
            ]),
          ),
          const SizedBox(height: 8),
          if (_error != null && data == null)
            EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)
          else if (data == null)
            const ListSkeleton(count: 4)
          else if (rows.isEmpty)
            EmptyState(icon: Icons.event_available_outlined, message: t('att.none_month'))
          else
            for (final r in rows)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('${_map(r['employee'])['full_name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Wrap(spacing: 10, runSpacing: 2, children: [
                      for (final st in attendanceStatuses)
                        Text.rich(TextSpan(children: [
                          TextSpan(text: '${t('att.$st')} ', style: TextStyle(color: c.muted, fontSize: 13)),
                          TextSpan(text: '${_map(r['counts'])[st] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                        ])),
                    ]),
                    const SizedBox(height: 8),
                    Wrap(spacing: 3, runSpacing: 3, children: [
                      for (final d in days)
                        Builder(builder: (context) {
                          final st = _map(r['days'])[d] as String?;
                          return Tooltip(
                            message: st == null ? d : '$d · ${t('att.$st')}',
                            child: Container(
                              width: 22,
                              height: 22,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: st == null ? c.paper : attendanceColor(context, st),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text('${int.parse(d.substring(8))}',
                                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: st == null ? c.faint : Colors.white)),
                            ),
                          );
                        }),
                    ]),
                  ]),
                ),
              ),
          if (data != null && rows.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Wrap(spacing: 12, alignment: WrapAlignment.center, children: [
                for (final st in attendanceStatuses)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                        width: 9, height: 9, decoration: BoxDecoration(color: attendanceColor(context, st), borderRadius: BorderRadius.circular(2))),
                    const SizedBox(width: 4),
                    Text(t('att.$st'), style: TextStyle(color: c.muted, fontSize: 12)),
                  ]),
              ]),
            ),
        ],
      ),
    );
  }
}
