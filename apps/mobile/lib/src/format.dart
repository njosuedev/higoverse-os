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

String ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The last [days] days including today, as API date filters.
({String from, String to}) lastDays(int days) {
  final now = DateTime.now();
  return (from: ymd(now.subtract(Duration(days: days - 1))), to: ymd(now));
}

/// "3 Oct, 14:05" from an API timestamp (UTC, sometimes without a zone).
String shortDateTime(String? ts) {
  if (ts == null || ts.isEmpty) return '';
  final hasZone = RegExp(r'[zZ]|[+-]\d\d:?\d\d$').hasMatch(ts);
  final d = DateTime.tryParse(hasZone ? ts : '${ts}Z')?.toLocal();
  if (d == null) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${months[d.month - 1]}, ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
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
