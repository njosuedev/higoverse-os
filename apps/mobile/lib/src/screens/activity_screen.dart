import 'package:flutter/material.dart';

import '../format.dart';
import '../i18n.dart';
import '../live/activity.dart';
import '../live/live_widgets.dart';
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

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final feed = FeedScope.of(context);
    _see(feed);
    final all = feed?.items ?? const <ActivityItem>[];
    final items = _filter == 'all' ? all : all.where((i) => i.kind.filter == _filter).toList();
    final filters = [
      ('all', 'act.f_all'),
      ('sales', 'act.f_sales'),
      ('stock', 'act.f_stock'),
      ('debts', 'act.f_debts'),
      if (s.canSeeFinancials) ('money', 'act.f_money'),
    ];

    // Today / Yesterday / Earlier.
    final groups = <(String, List<ActivityItem>)>[];
    for (final i in items) {
      final d = daysAgo(i.at);
      final label = d <= 0 ? t('act.today') : (d == 1 ? t('act.yesterday') : t('act.earlier'));
      if (groups.isEmpty || groups.last.$1 != label) groups.add((label, []));
      groups.last.$2.add(i);
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(t('acc.notifications')),
        actions: [
          const Center(child: LivePill()),
          IconButton(
            tooltip: t('act.mark_read'),
            onPressed: (feed?.unread ?? 0) == 0 ? null : feed!.markAllRead,
            icon: const Icon(Icons.done_all_rounded),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(10, 2, 10, 8),
              children: [
                for (final f in filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(t(f.$2)),
                      selected: _filter == f.$1,
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _filter = f.$1),
                    ),
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
                  for (final g in groups) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
                      child: Text(g.$1, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                    ),
                    for (final i in g.$2)
                      Material(
                        color: i.read && !_fresh.contains(i) ? Colors.transparent : c.ink.withValues(alpha: 0.07),
                        child: InkWell(
                          onTap: () => _open(i),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            child: Row(children: [
                              ActivityIcon(item: i, size: 52),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(activityText(t, i),
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontWeight: i.read ? FontWeight.w500 : FontWeight.w700, height: 1.3)),
                                  const SizedBox(height: 3),
                                  Text(
                                    [
                                      t.ago(i.at),
                                      if (i.args['amount'] is num) money(i.args['amount'] as num, s.currency),
                                    ].join(' · '),
                                    style: TextStyle(fontSize: 13, color: i.read ? c.faint : c.ink, fontWeight: FontWeight.w600),
                                  ),
                                ]),
                              ),
                              if (!i.read) ...[
                                const SizedBox(width: 8),
                                Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: c.ink)),
                              ],
                            ]),
                          ),
                        ),
                      ),
                  ],
                ],
              ),
      ),
    );
  }
}

/// Opens the debts list (used from Home and Account).
void openDebts(BuildContext context) => pushScoped<void>(context, const DebtsScreen());
