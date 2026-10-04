import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'charts.dart';
import 'format.dart';
import 'i18n.dart';
import 'live/scoped_route.dart';
import 'screens/item_screen.dart';
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';

/// Payment method in the app's language (unknown ones as they come).
String payLabel(T t, String? m) {
  final v = m ?? 'cash';
  return const {'cash', 'mtn', 'airtel', 'bank', 'card', 'debt'}.contains(v) ? t('pm.$v') : v;
}

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;

Future<void> _sheet(BuildContext context, WidgetBuilder builder) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Hgv.of(context).surface,
      builder: (c) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.62,
        minChildSize: 0.35,
        maxChildSize: 0.95,
        builder: (c, scroll) => SingleChildScrollView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 20),
          child: builder(c),
        ),
      ),
    );

Widget _heading(BuildContext context, String title, String? sub, {Widget? lead}) {
  final c = Hgv.of(context);
  return Row(children: [
    if (lead != null) ...[lead, const SizedBox(width: 14)],
    Expanded(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
        if (sub != null && sub.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(sub, style: TextStyle(color: c.faint, fontWeight: FontWeight.w500)),
        ],
      ]),
    ),
  ]);
}

/// One sale: amount, what, how it was paid, and (when allowed) its profit.
Future<void> showSaleSheet(BuildContext context, Map<String, dynamic> sale) {
  final s = SessionScope.of(context);
  return _sheet(context, (context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final total = _n(sale['total_amount']);
    final paid = sale['amount_paid'] == null ? null : _n(sale['amount_paid']);
    final profit = sale['profit'];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _heading(context, '${sale['product_name'] ?? t('sale.default')}', t.dateTime(sale['created_at'] as String?),
          lead: IconAvatar(icon: Icons.receipt_long_rounded, color: c.ink, size: 46)),
      const SizedBox(height: 18),
      Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
        decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(14)),
        child: Column(children: [
          Text(t('sale.total'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          FittedBox(
            child: Text(money(total, s.currency),
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
          ),
        ]),
      ),
      const SizedBox(height: 10),
      InfoRow(t('sale.quantity'), groupDigits(_n(sale['quantity']))),
      InfoRow(t('sale.unit_price'), money(_n(sale['unit_price']), s.currency)),
      InfoRow(t('sale.payment'), payLabel(t, sale['payment_method'] as String?)),
      if (paid != null && paid < total) ...[
        InfoRow(t('sale.paid'), money(paid, s.currency)),
        InfoRow(t('sale.balance'), money(total - paid, s.currency), valueColor: c.warning, strong: true),
      ],
      if (s.showsProfit && profit != null)
        InfoRow(t('sale.profit'), money(_n(profit), s.currency), valueColor: _n(profit) >= 0 ? c.success : c.danger),
      if ('${sale['notes'] ?? ''}'.trim().isNotEmpty) ...[
        const Divider(height: 24),
        Text(t('sale.notes'), style: TextStyle(color: c.muted, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('${sale['notes']}'),
      ],
    ]);
  });
}

/// One product or vehicle on its own page (photos, details, who has the
/// car, latest sales).
Future<void> openItem(BuildContext context, Map<String, dynamic> item) =>
    pushScoped<void>(context, ItemScreen(item: item));

/// One debt: who, how much is left, and quick ways to reach them.
Future<void> showDebtSheet(BuildContext context, Map<String, dynamic> d) {
  final s = SessionScope.of(context);
  return _sheet(context, (context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final owed = _n(d['amount_owed']), paid = _n(d['amount_paid']);
    final balance = d['balance'] == null ? owed - paid : _n(d['balance']);
    final phone = '${d['phone'] ?? ''}'.trim();
    final settled = d['is_paid'] == true;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _heading(context, '${d['debtor_name'] ?? ''}', phone,
          lead: Avatar(name: '${d['debtor_name'] ?? ''}', size: 48)),
      const SizedBox(height: 18),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(settled ? t('debts.settled') : t('debts.balance'),
              style: TextStyle(color: settled ? c.success : c.muted, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          FittedBox(
            child: Text(money(balance, s.currency),
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: settled ? c.success : c.warning)),
          ),
          const SizedBox(height: 12),
          Meter(value: owed <= 0 ? 1 : paid / owed, color: c.success, height: 8),
          const SizedBox(height: 6),
          Text(t('debts.paid_of', {'paid': money(paid, s.currency), 'owed': money(owed, s.currency)}),
              style: TextStyle(color: c.faint, fontSize: 13)),
        ]),
      ),
      const SizedBox(height: 8),
      InfoRow(t('debts.owed'), money(owed, s.currency)),
      InfoRow(t('sale.paid'), money(paid, s.currency)),
      InfoRow(t('debts.since'), t.dateTime(d['created_at'] as String?)),
      if ('${d['notes'] ?? ''}'.trim().isNotEmpty) InfoRow(t('sale.notes'), '${d['notes']}'),
      if (phone.isNotEmpty) ...[
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: phone)),
              icon: const Icon(Icons.call_rounded),
              label: Text(t('debts.call')),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () => launchUrl(Uri(scheme: 'sms', path: phone)),
              icon: const Icon(Icons.chat_bubble_outline_rounded),
              label: Text(t('debts.sms')),
            ),
          ),
        ]),
      ],
    ]);
  });
}
