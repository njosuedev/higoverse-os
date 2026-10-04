import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'charts.dart';
import 'config.dart';
import 'format.dart';
import 'i18n.dart';
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
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (c) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.62,
        minChildSize: 0.35,
        maxChildSize: 0.95,
        builder: (c, scroll) => SingleChildScrollView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
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

/// One product or vehicle: price, stock, details, and its latest sales.
Future<void> showProductSheet(BuildContext context, Map<String, dynamic> item) {
  final s = SessionScope.of(context);
  final recent = s.api.get('${Svc.sales}/sales', query: {'page': '1', 'limit': '5', 'product_id': '${item['id']}'});
  return _sheet(context, (context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final a = attributesOf(item['attributes']);
    final qty = _n(item['quantity']);
    final low = qty > 0 && qty <= s.lowStock;
    final status = qty <= 0
        ? (t('dash.out_of_stock'), c.danger)
        : s.isCar
            ? (a['sale_status'] == 'pending' ? (t('stock.f_pending'), c.warning) : (t('stock.f_available'), c.success))
            : (low ? (t('detail.low'), c.warning) : (t('stock.in_stock_n', {'n': groupDigits(qty)}), c.success));
    final rows = <(String, String)>[
      if (!s.isCar) (t('detail.in_stock'), groupDigits(qty)),
      if (s.isCar) ...[
        (t('detail.plate'), a['plate_no'] ?? ''),
        (t('detail.chassis'), a['chassis_no'] ?? ''),
        (t('detail.year'), a['year'] ?? ''),
        (t('detail.colour'), a['color'] ?? ''),
        (t('detail.type'), a['car_type'] ?? ''),
        if (a['sale_status'] == 'pending') ...[
          (t('detail.buyer'), [a['buyer_name'], a['buyer_phone']].where((x) => x != null && x.isNotEmpty).join(' · ')),
          (t('detail.buyer_id'), a['buyer_id_no'] ?? ''),
        ],
        if ((int.tryParse(a['penalty_count'] ?? '') ?? 0) > 0)
          (t('detail.fines'), '${a['penalty_count']} · ${groupDigits(num.tryParse(a['penalty_amount'] ?? '') ?? 0)} ${s.currency}'),
      ],
      ('${item['category'] ?? ''}'.isEmpty ? '' : t('detail.category'), '${item['category'] ?? ''}'),
      if (!s.isCar) (t('detail.barcode'), '${item['barcode'] ?? ''}'),
    ].where((r) => r.$1.isNotEmpty && r.$2.isNotEmpty).toList();

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _heading(context, '${item['name'] ?? ''}', null),
      const SizedBox(height: 10),
      Row(children: [
        StatusChip(status.$1, status.$2),
        const Spacer(),
        Text(money(_n(item['selling_price']), s.currency), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
      ]),
      if (!s.isCar) ...[
        const SizedBox(height: 14),
        // Full bar at three times the low-stock level: plenty.
        Meter(
          value: s.lowStock <= 0 ? 1 : qty / (s.lowStock * 3),
          color: qty <= 0 ? c.danger : (low ? c.warning : c.success),
          height: 8,
        ),
      ],
      const SizedBox(height: 10),
      for (final r in rows) InfoRow(r.$1, r.$2),
      const Divider(height: 28),
      Text(t('detail.recent_sales'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
      const SizedBox(height: 6),
      FutureBuilder<dynamic>(
        future: recent,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Shimmer(child: Column(children: [RowSkeleton(leading: RowLead.none, titleWidth: 140)]));
          }
          final list = snap.hasData ? (((snap.data as Map)['data'] as Map?)?['items'] as List? ?? const []) : const [];
          if (list.isEmpty) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text(snap.hasError ? errorText(t, snap.error!) : t('detail.no_sales'), style: TextStyle(color: c.faint)),
            );
          }
          return Column(children: [
            for (final raw in list.whereType<Map>())
              Builder(builder: (context) {
                final sale = Map<String, dynamic>.from(raw);
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  onTap: () => showSaleSheet(context, sale),
                  title: Text('${sale['quantity'] ?? 1} × ${groupDigits(_n(sale['unit_price']))}',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${payLabel(t, sale['payment_method'] as String?)} · ${t.dateTime(sale['created_at'] as String?)}'),
                  trailing: Text(money(_n(sale['total_amount']), s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                );
              }),
          ]);
        },
      ),
    ]);
  });
}

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
