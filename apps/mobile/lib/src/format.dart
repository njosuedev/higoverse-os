import 'dart:convert';

/// 1250000 → "1,250,000".
String groupDigits(num n) {
  final s = n.round().abs().toString();
  final b = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

/// "1,250,000 RWF".
String money(num n, String currency) => '${groupDigits(n)} $currency';

/// Short amounts for small tiles: 950 → "950 RWF", 22000000 → "22M RWF".
String compactMoney(num n, String currency) {
  final a = n.abs();
  String f(num v, String u) => '${v >= 100 ? v.round() : (v * 10).round() / 10}$u'.replaceAll('.0$u', u);
  final s = a < 10000 ? groupDigits(a) : a < 1e6 ? f(a / 1e3, 'K') : a < 1e9 ? f(a / 1e6, 'M') : f(a / 1e9, 'B');
  return '${n < 0 ? '-' : ''}$s $currency';
}

String ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The last [days] days including today, as API date filters.
({String from, String to}) lastDays(int days) {
  final now = DateTime.now();
  return (from: ymd(now.subtract(Duration(days: days - 1))), to: ymd(now));
}

/// An API timestamp (UTC, sometimes without a zone) in local time.
DateTime? parseTimestamp(Object? ts) {
  if (ts is! String || ts.isEmpty) return null;
  final hasZone = RegExp(r'[zZ]|[+-]\d\d:?\d\d$').hasMatch(ts);
  return DateTime.tryParse(hasZone ? ts : '${ts}Z')?.toLocal();
}

/// How long ago, as the largest whole unit: (0, 'now'), (5, 'm'), (3, 'h'), (2, 'd').
(int, String) shortAgo(DateTime then, [DateTime? now]) {
  final s = (now ?? DateTime.now()).difference(then).inSeconds;
  if (s < 60) return (0, 'now');
  if (s < 3600) return (s ~/ 60, 'm');
  if (s < 86400) return (s ~/ 3600, 'h');
  return (s ~/ 86400, 'd');
}

/// Calendar days between [d] and today: 0 today, 1 yesterday…
int daysAgo(DateTime d, [DateTime? now]) {
  final n = now ?? DateTime.now();
  return DateTime(n.year, n.month, n.day).difference(DateTime(d.year, d.month, d.day)).inDays;
}

/// Change from [before] to [now] in percent, or null when there is no base.
double? percentChange(num now, num before) => before == 0 ? null : (now - before) / before * 100;

/// "3 Oct, 14:05" from an API timestamp (UTC, sometimes without a zone).
/// [months] gives the month names in the app's language (`T.months`);
/// Chinese reads "10月3日 14:05".
String shortDateTime(String? ts, [List<String>? months, String lang = 'en']) {
  final d = parseTimestamp(ts);
  if (d == null) return '';
  final m = (months ?? const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])[d.month - 1];
  final time = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  return lang == 'zh' ? '$m${d.day}日 $time' : '${d.day} $m, $time';
}

/// Car details are stored as JSON text on the product (`attributes`).
Map<String, String> attributesOf(dynamic raw) {
  if (raw is! String || raw.isEmpty) return const {};
  try {
    final m = jsonDecode(raw);
    if (m is Map) return m.map((k, v) => MapEntry('$k', v == null ? '' : '$v'));
  } catch (_) {}
  return const {};
}
