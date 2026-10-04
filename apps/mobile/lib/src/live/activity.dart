import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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
  fineRecorded,
  transferPending,
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
        fineRecorded => 'act.fine_recorded',
        transferPending => 'act.transfer_pending',
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
        lowStock || outOfStock || restocked || productNew || purchase || fineRecorded || transferPending => 'stock',
        debtNew || debtPayment || debtPaid => 'debts',
        expense => 'money',
      };

  bool get isStockAlert => this == lowStock || this == outOfStock;

  /// Car dealers: a traffic fine was added, or a vehicle awaits transfer.
  bool get isVehicleAlert => this == fineRecorded || this == transferPending;
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
/// Counts what hasn't been seen yet, for the badge on the bell: whatever
/// came after Notifications was last opened on this phone, even across
/// restarts. Everything counts, the signed-in account's own actions too:
/// this app makes none, so they were done elsewhere (website, desktop).
class ActivityFeed extends ChangeNotifier {
  ActivityFeed(this.session, {Live? live, FlutterSecureStorage? storage})
      : _store = storage ?? const FlutterSecureStorage() {
    _sub = live?.events.listen(add);
  }

  final Session session;
  final FlutterSecureStorage _store;

  /// When Notifications was last opened here (null: never, or not loaded).
  DateTime? _seenAt;
  bool _seenLoaded = false;
  String get _seenKey => 'hgv_seen_${session.shop?.id ?? ''}';

  Future<DateTime?> _loadSeen() async {
    if (_seenLoaded) return _seenAt;
    _seenLoaded = true;
    try {
      final v = await _store.read(key: _seenKey);
      _seenAt = v == null ? null : DateTime.tryParse(v);
    } catch (_) {}
    return _seenAt;
  }

  Future<void> _saveSeen(DateTime at) async {
    _seenAt = at;
    _seenLoaded = true;
    try {
      await _store.write(key: _seenKey, value: at.toUtc().toIso8601String());
    } catch (_) {}
  }
  StreamSubscription<LiveEvent>? _sub;
  final List<ActivityItem> items = [];
  static const _max = 150;

  final _fresh = StreamController<ActivityItem>.broadcast();

  /// Entries as they arrive live — for the in-app banner.
  Stream<ActivityItem> get fresh => _fresh.stream;

  int get unread => items.where((i) => !i.read).length;

  /// Seeds the feed with the latest sales; those after Notifications was
  /// last opened count as unread. The first time, all count as seen.
  Future<void> seed() async {
    final seen = await _loadSeen();
    if (seen == null) unawaited(_saveSeen(DateTime.now()));
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
          read: seen == null || !(parseTimestamp(s['created_at']) ?? DateTime.now()).isAfter(seen),
        ));
      }
      items.sort((a, b) => b.at.compareTo(a.at));
      notifyListeners();
    } catch (_) {/* the live entries still come */}
  }

  /// Back after a drop (the phone slept, the network went): sales made
  /// meanwhile never came live, so fetch them and count them as new.
  Future<void> catchUp() async {
    final since = items.where((i) => i.kind == ActivityKind.sale).map((i) => i.at).fold<DateTime?>(
        null, (a, b) => a == null || b.isAfter(a) ? b : a);
    if (since == null) return seed();
    try {
      final res = await session.api.get('${Svc.sales}/sales', query: {'page': '1', 'limit': '20'});
      final list = ((res as Map)['data'] as Map?)?['items'] as List? ?? const [];
      final known = items.map((i) => i.data['id']).toSet();
      final missed = <ActivityItem>[];
      for (final raw in list.whereType<Map>()) {
        final s = Map<String, dynamic>.from(raw);
        final at = parseTimestamp(s['created_at']);
        if (known.contains(s['id']) || at == null || !at.isAfter(since)) continue;
        missed.add(ActivityItem(
          kind: ActivityKind.sale,
          at: at,
          args: {'qty': s['quantity'] ?? 1, 'name': s['product_name'] ?? '', 'amount': s['total_amount']},
          data: s,
        ));
      }
      if (missed.isEmpty) return;
      items.addAll(missed);
      items.sort((a, b) => b.at.compareTo(a.at));
      if (items.length > _max) items.removeRange(_max, items.length);
      notifyListeners();
      missed.sort((a, b) => a.at.compareTo(b.at));
      for (final m in missed) {
        _fresh.add(m);
      }
    } catch (_) {/* the next reconnect tries again */}
  }

  /// Turns a live event into an entry, when it is worth one.
  void add(LiveEvent e) {
    if (e.isResync) {
      catchUp();
      return;
    }
    final item = fromEvent(e, lowStock: session.lowStock, isCar: session.isCar);
    if (item == null) return;
    items.insert(0, item);
    if (items.length > _max) items.removeRange(_max, items.length);
    notifyListeners();
    _fresh.add(item);
  }

  /// Pure: which entry (if any) an event makes. [lowStock] is the shop's
  /// "running low" level; car dealers ([isCar]) hold one of each vehicle, so
  /// "out of stock" just means sold there — they get fine and transfer
  /// alerts instead.
  static ActivityItem? fromEvent(LiveEvent e, {required int lowStock, bool isCar = false}) {
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
        final car = _carState(d['attributes']);
        if (d.containsKey('prev_penalty_count') && car.fines > n(d['prev_penalty_count'])) {
          return make(ActivityKind.fineRecorded, {'name': d['name'] ?? '', 'n': car.fines, 'amount': car.fineAmount});
        }
        if (d.containsKey('prev_sale_status') && car.status == 'pending' && d['prev_sale_status'] != 'pending') {
          return make(ActivityKind.transferPending, {'name': d['name'] ?? '', 'buyer': car.buyer ?? ''});
        }
        if (isCar || !d.containsKey('prev_quantity') || !d.containsKey('quantity')) return null;
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

  static ({int fines, num? fineAmount, String? status, String? buyer}) _carState(Object? attributes) {
    final a = attributesOf(attributes);
    return (
      fines: int.tryParse(a['penalty_count'] ?? '') ?? 0,
      fineAmount: num.tryParse(a['penalty_amount'] ?? ''),
      status: a['sale_status'],
      buyer: a['buyer_name'],
    );
  }

  void markAllRead() {
    unawaited(_saveSeen(DateTime.now()));
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
