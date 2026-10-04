import 'dart:async';

import 'package:flutter/widgets.dart';

import '../config.dart';
import '../format.dart';
import '../session.dart';
import 'live.dart';

/// What an activity entry is about; decides its icon, colour and wording
/// (`act.<kind>` in i18n.dart).
enum ActivityKind {
  sale,
  saleDeleted,
  lowStock,
  outOfStock,
  restocked,
  productNew,
  debtNew,
  debtPayment,
  debtPaid,
  expense,
  purchase;

  String get key => switch (this) {
        sale => 'act.sale',
        saleDeleted => 'act.sale_deleted',
        lowStock => 'act.low_stock',
        outOfStock => 'act.out_of_stock',
        restocked => 'act.restocked',
        productNew => 'act.product_new',
        debtNew => 'act.debt_new',
        debtPayment => 'act.debt_payment',
        debtPaid => 'act.debt_paid',
        expense => 'act.expense',
        purchase => 'act.purchase',
      };

  /// The Activity screen's filters.
  String get filter => switch (this) {
        sale || saleDeleted => 'sales',
        lowStock || outOfStock || restocked || productNew || purchase => 'stock',
        debtNew || debtPayment || debtPaid => 'debts',
        expense => 'money',
      };

  bool get isStockAlert => this == lowStock || this == outOfStock;
}

class ActivityItem {
  ActivityItem({
    required this.kind,
    required this.at,
    this.by,
    this.byId,
    this.args = const {},
    this.data = const {},
    this.read = false,
  });

  final ActivityKind kind;
  final DateTime at;

  /// Who did it (null for things the app noticed itself, e.g. low stock).
  final String? by, byId;

  /// Filled into the text: {name}, {qty}, {amount}, {n}…
  final Map<String, Object?> args;

  /// The sale / product / debt itself, for its details sheet.
  final Map<String, dynamic> data;
  bool read;
}

/// The business's recent activity, newest first: everything announced live
/// while the app is open, plus the latest sales so it is never empty.
/// Counts what hasn't been seen yet, for the badge on the Activity tab.
class ActivityFeed extends ChangeNotifier {
  ActivityFeed(this.session, {Live? live}) {
    _sub = live?.events.listen(add);
  }

  final Session session;
  StreamSubscription<LiveEvent>? _sub;
  final List<ActivityItem> items = [];
  static const _max = 150;

  final _fresh = StreamController<ActivityItem>.broadcast();

  /// Entries as they arrive live — for the in-app banner.
  Stream<ActivityItem> get fresh => _fresh.stream;

  int get unread => items.where((i) => !i.read).length;

  /// Seeds the feed with the latest sales (already seen), once.
  Future<void> seed() async {
    try {
      final res = await session.api.get('${Svc.sales}/sales', query: {'page': '1', 'limit': '20'});
      final list = ((res as Map)['data'] as Map?)?['items'] as List? ?? const [];
      final known = items.map((i) => i.data['id']).toSet();
      for (final raw in list.whereType<Map>()) {
        final s = Map<String, dynamic>.from(raw);
        if (known.contains(s['id'])) continue;
        items.add(ActivityItem(
          kind: ActivityKind.sale,
          at: parseTimestamp(s['created_at']) ?? DateTime.now(),
          args: {'qty': s['quantity'] ?? 1, 'name': s['product_name'] ?? '', 'amount': s['total_amount']},
          data: s,
          read: true,
        ));
      }
      items.sort((a, b) => b.at.compareTo(a.at));
      notifyListeners();
    } catch (_) {/* the live entries still come */}
  }

  /// Turns a live event into an entry, when it is worth one.
  void add(LiveEvent e) {
    final item = fromEvent(e, lowStock: session.lowStock);
    if (item == null) return;
    // Own actions are listed, but already seen.
    if (item.byId != null && item.byId == session.user?.id) item.read = true;
    items.insert(0, item);
    if (items.length > _max) items.removeRange(_max, items.length);
    notifyListeners();
    _fresh.add(item);
  }

  /// Pure: which entry (if any) an event makes. [lowStock] is the shop's
  /// "running low" level.
  static ActivityItem? fromEvent(LiveEvent e, {required int lowStock}) {
    final d = e.data;
    ActivityItem make(ActivityKind kind, Map<String, Object?> args, {bool withActor = true}) => ActivityItem(
          kind: kind,
          at: e.at,
          by: withActor ? e.byName : null,
          byId: e.byId,
          args: args,
          data: {...d, if (d['created_at'] == null) 'created_at': e.at.toUtc().toIso8601String()},
        );
    num n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;

    switch (e.type) {
      case 'sale.created':
        return make(ActivityKind.sale, {'qty': d['quantity'] ?? 1, 'name': d['product_name'] ?? '', 'amount': d['total_amount']});
      case 'sale.deleted':
        return make(ActivityKind.saleDeleted, {'name': d['product_name'] ?? ''});
      case 'product.created':
        return make(ActivityKind.productNew, {'name': d['name'] ?? '', 'qty': d['quantity'] ?? 0});
      case 'product.updated':
        if (!d.containsKey('prev_quantity') || !d.containsKey('quantity')) return null;
        final q = n(d['quantity']), prev = n(d['prev_quantity']);
        final args = {'name': d['name'] ?? '', 'n': q};
        if (q <= 0 && prev > 0) return make(ActivityKind.outOfStock, args, withActor: false);
        if (q > 0 && q <= lowStock && prev > lowStock) return make(ActivityKind.lowStock, args, withActor: false);
        if (q > lowStock && prev <= lowStock) return make(ActivityKind.restocked, args, withActor: false);
        return null;
      case 'debt.created':
        return make(ActivityKind.debtNew, {'name': d['debtor_name'] ?? '', 'amount': d['balance']});
      case 'debt.updated':
        if (d['is_paid'] == true) return make(ActivityKind.debtPaid, {'name': d['debtor_name'] ?? ''}, withActor: false);
        return make(ActivityKind.debtPayment, {'name': d['debtor_name'] ?? '', 'amount': d['balance']}, withActor: false);
      case 'expense.created':
        return make(ActivityKind.expense, {'title': d['title'] ?? '', 'amount': d['amount']});
      case 'purchase.created':
        return make(ActivityKind.purchase, {'name': d['product_name'] ?? '', 'qty': d['quantity_added'] ?? 0});
    }
    return null;
  }

  void markAllRead() {
    if (unread == 0) return;
    for (final i in items) {
      i.read = true;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _fresh.close();
    super.dispose();
  }
}

class FeedScope extends InheritedNotifier<ActivityFeed> {
  const FeedScope({super.key, required ActivityFeed feed, required super.child}) : super(notifier: feed);

  static ActivityFeed? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<FeedScope>()?.notifier;
  static ActivityFeed? read(BuildContext context) => context.getInheritedWidgetOfExactType<FeedScope>()?.notifier;
}
