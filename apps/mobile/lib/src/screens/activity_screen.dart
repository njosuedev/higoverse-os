import 'package:flutter/material.dart';

import '../format.dart';
import '../i18n.dart';
import '../live/activity.dart';
import '../live/notifier.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';
import 'debts_screen.dart';

/// The entry's sentence in the app's language.
String activityText(T t, ActivityItem item) => activityLine(t, item);

/// Who did it (initials) with a small badge saying what — or, for things
/// nobody "did" (low stock), just the icon.
class ActivityIcon extends StatelessWidget {
  const ActivityIcon({super.key, required this.item, this.size = 44});
  final ActivityItem item;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final (icon, color) = switch (item.kind) {
      ActivityKind.sale => (Icons.point_of_sale_rounded, c.success),
      ActivityKind.saleDeleted => (Icons.remove_circle_outline_rounded, c.danger),
      ActivityKind.lowStock => (Icons.warning_amber_rounded, c.warning),
      ActivityKind.outOfStock => (Icons.remove_shopping_cart_outlined, c.danger),
      ActivityKind.restocked => (Icons.inventory_rounded, c.success),
      ActivityKind.fineRecorded => (Icons.local_police_rounded, c.danger),
      ActivityKind.transferPending => (Icons.swap_horiz_rounded, c.warning),
      ActivityKind.productNew => (Icons.add_box_outlined, c.ink),
      ActivityKind.debtNew => (Icons.account_balance_wallet_outlined, c.warning),
      ActivityKind.debtPayment => (Icons.payments_outlined, c.success),
      ActivityKind.debtPaid => (Icons.verified_rounded, c.success),
      ActivityKind.expense => (Icons.receipt_outlined, c.danger),
      ActivityKind.purchase => (Icons.local_shipping_outlined, c.ink),
    };
    final who = item.by;
    if (who == null || who.isEmpty) return IconAvatar(icon: icon, color: color, size: size);
    return Avatar(name: who, size: size, badge: icon, badgeColor: color);
  }
}

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key, required this.visible});

  /// Whether this tab is on screen — new entries are then seen at once.
  final bool visible;

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  String _filter = 'all';

  /// Entries that were new when seen during this visit: they keep their
  /// tint until the person leaves the tab, so they can still tell them apart.
  final Set<ActivityItem> _fresh = {};

  @override
  void didUpdateWidget(ActivityScreen old) {
    super.didUpdateWidget(old);
    if (!widget.visible && old.visible) _fresh.clear();
  }

  /// While on screen, whatever is unread counts as seen (badge goes away).
  void _see(ActivityFeed? feed) {
    if (!widget.visible || feed == null || feed.unread == 0) return;
    _fresh.addAll(feed.items.where((i) => !i.read));
    WidgetsBinding.instance.addPostFrameCallback((_) => feed.markAllRead());
  }

  void _open(ActivityItem item) {
    switch (item.kind.filter) {
      case 'sales':
        if (item.kind == ActivityKind.sale) showSaleSheet(context, item.data);
      case 'stock':
        if (item.kind != ActivityKind.purchase && item.data['id'] != null) openItem(context, item.data);
      case 'debts':
        if (item.data['id'] != null) showDebtSheet(context, item.data);
    }
  }

  /// New: not yet seen, or seen during this visit (they keep their tint).
  bool _isNew(ActivityItem i) => !i.read || _fresh.contains(i);

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final feed = FeedScope.of(context);
    _see(feed);
    final all = feed?.items ?? const <ActivityItem>[];
    final items = switch (_filter) {
      'all' => all,
      'unread' => all.where(_isNew).toList(),
      _ => all.where((i) => i.kind.filter == _filter).toList(),
    };
    final filters = [
      ('all', 'act.f_all'),
      ('unread', 'act.f_unread'),
      ('sales', 'act.f_sales'),
      ('stock', 'act.f_stock'),
      ('debts', 'act.f_debts'),
      if (s.canSeeFinancials) ('money', 'act.f_money'),
    ];
    // Facebook's two sections: New, then Earlier.
    final fresh = items.where(_isNew).toList();
    final earlier = items.where((i) => !_isNew(i)).toList();
    final unread = feed?.unread ?? 0;

    return Scaffold(
      backgroundColor: c.chrome,
      appBar: AppBar(
        backgroundColor: c.chrome,
        centerTitle: false,
        titleSpacing: 4,
        title: Text(t('acc.notifications'), style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4, color: c.text)),
        actions: [
          RoundIconButton(
            icon: Icons.done_all_rounded,
            tooltip: t('act.mark_read'),
            onTap: unread == 0 ? () {} : feed!.markAllRead,
          ),
          const SizedBox(width: 10),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              children: [
                for (final f in filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _FilterPill(label: t(f.$2), selected: _filter == f.$1, onTap: () => setState(() => _filter = f.$1)),
                  ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => feed?.seed(),
        child: items.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [EmptyState(icon: Icons.notifications_none_rounded, message: t('act.empty'))])
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  for (final (title, group) in [(t('act.new'), fresh), (t('act.earlier'), earlier)])
                    if (group.isNotEmpty) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
                        child: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                      ),
                      for (final i in group)
                        _NotificationRow(item: i, isNew: _isNew(i), unread: !i.read, onTap: () => _open(i), currency: s.currency),
                    ],
                ],
              ),
      ),
    );
  }
}

/// A filter as Facebook draws it: a flat rounded pill, light blue with blue
/// text when chosen, grey otherwise.
class _FilterPill extends StatelessWidget {
  const _FilterPill({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? c.ink.withValues(alpha: 0.14) : c.paper,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(label,
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: selected ? c.ink : c.text)),
          ),
        ),
      ),
    );
  }
}

/// One notification, Facebook-style: picture with what-happened badge, the
/// sentence with who did it in bold, how long ago (blue while new), and a
/// blue dot on the right until it has been seen.
class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.item, required this.isNew, required this.unread, required this.onTap, required this.currency});
  final ActivityItem item;
  final bool isNew, unread;
  final VoidCallback onTap;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final text = activityText(t, item);
    final by = item.by ?? '';
    final at = by.isEmpty ? -1 : text.indexOf(by);
    final base = TextStyle(fontSize: 15, height: 1.3, color: c.text, fontWeight: FontWeight.w400);
    final amount = item.args['amount'];
    return Material(
      color: isNew ? c.ink.withValues(alpha: 0.08) : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
          child: Row(children: [
            ActivityIcon(item: item, size: 56),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text.rich(
                  at < 0
                      ? TextSpan(text: text)
                      : TextSpan(children: [
                          TextSpan(text: text.substring(0, at)),
                          TextSpan(text: by, style: const TextStyle(fontWeight: FontWeight.w700)),
                          TextSpan(text: text.substring(at + by.length)),
                        ]),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: base,
                ),
                const SizedBox(height: 3),
                Text(
                  [t.ago(item.at), if (amount is num) money(amount, currency)].join(' · '),
                  style: TextStyle(fontSize: 13, color: isNew ? c.ink : c.faint, fontWeight: isNew ? FontWeight.w700 : FontWeight.w500),
                ),
              ]),
            ),
            SizedBox(
              width: 24,
              child: unread || isNew
                  ? Center(child: Container(width: 12, height: 12, decoration: BoxDecoration(shape: BoxShape.circle, color: c.ink)))
                  : null,
            ),
          ]),
        ),
      ),
    );
  }
}

/// Opens the debts list (used from Home and Account).
void openDebts(BuildContext context) => pushScoped<void>(context, const DebtsScreen());
