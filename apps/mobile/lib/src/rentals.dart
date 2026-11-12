// Car rentals as the vehicle screens see them (sale-service GET
// /rentals/busy, as the website's lib/rentals-now.ts): a car is Rented only
// between its rental's start and end dates, and Available (for sale) again
// from the day after, or once the rental is returned or cancelled.
import 'package:flutter/material.dart';

import 'config.dart';
import 'i18n.dart';
import 'session.dart';
import 'theme.dart';

class CarRental {
  CarRental(Map m)
      : id = '${m['id'] ?? ''}',
        rentalNo = '${m['rental_no'] ?? ''}',
        productId = '${m['product_id'] ?? ''}',
        customer = '${m['customer'] ?? ''}',
        phone = '${m['customer_phone'] ?? ''}',
        start = '${m['start_date'] ?? ''}',
        end = '${m['end_date'] ?? ''}';
  final String id, rentalNo, productId, customer, phone, start, end; // dates: YYYY-MM-DD
}

/// Cars by id: rented today ([now]) or booked for a rental that starts later
/// ([next], the soonest).
class RentalsByCar {
  const RentalsByCar([this.now = const {}, this.next = const {}]);
  final Map<String, CarRental> now, next;
}

String _today() {
  final d = DateTime.now();
  return '${d.year}-${'${d.month}'.padLeft(2, '0')}-${'${d.day}'.padLeft(2, '0')}';
}

/// The latest rentals, for every vehicle row on screen to listen to.
final rentalsNow = ValueNotifier<RentalsByCar>(const RentalsByCar());
Session? _owner;
String _day = '';
DateTime _at = DateTime.fromMillisecondsSinceEpoch(0);
Future<RentalsByCar>? _pending;

/// Loads the business's running and upcoming rentals (car companies only).
/// Kept for a few seconds so the screens opened together share one call;
/// [fresh] skips that (a list being reloaded).
Future<RentalsByCar> loadRentals(Session s, {bool fresh = false}) {
  if (!s.isCar) return Future.value(const RentalsByCar());
  final day = _today();
  if (!identical(_owner, s)) {
    _owner = s;
    _pending = null;
    rentalsNow.value = const RentalsByCar();
  }
  if (!fresh && _pending != null && _day == day && DateTime.now().difference(_at).inSeconds < 15) return _pending!;
  _day = day;
  _at = DateTime.now();
  return _pending = () async {
    try {
      final res = await s.api.get('${Svc.sales}/rentals/busy');
      final now = <String, CarRental>{}, next = <String, CarRental>{};
      for (final e in ((res as Map)['data'] as List? ?? const [])) {
        if (e is! Map) continue;
        final r = CarRental(e);
        if (r.productId.isEmpty || r.end.compareTo(day) < 0) continue;
        if (r.start.compareTo(day) <= 0) {
          now[r.productId] = r;
        } else if (next[r.productId] == null || r.start.compareTo(next[r.productId]!.start) < 0) {
          next[r.productId] = r;
        }
      }
      final out = RentalsByCar(now, next);
      if (identical(_owner, s)) rentalsNow.value = out;
      return out;
    } catch (_) {
      return rentalsNow.value; // offline: keep what we knew
    }
  }();
}

/// The products API's car filter for a status chip: "rented" is only the
/// cars rented today, "available" all others still for sale.
Map<String, String> carStatusQuery(String status, RentalsByCar r) {
  final ids = r.now.keys.join(',');
  if (status == 'rented') return {'status': 'in_stock', 'ids': ids};
  if (status == 'available' && ids.isNotEmpty) return {'status': 'available', 'exclude_ids': ids};
  return {if (status != 'all') 'status': status};
}

/// A car's status chip: sold, rented (today), pending (reserved for a
/// buyer) or available.
(String, Color) carStatusChip(BuildContext context, int qty, Map<String, String> a, String id) {
  final t = T.of(context);
  final c = Hgv.of(context);
  if (qty <= 0) return (t('stock.f_sold'), c.faint);
  if (rentalsNow.value.now[id] != null) return (t('stock.f_rented'), c.ink);
  if (a['sale_status'] == 'pending') return (t('stock.f_pending'), c.warning);
  return (t('stock.f_available'), c.success);
}
