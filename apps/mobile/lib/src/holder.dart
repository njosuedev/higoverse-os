import 'config.dart';
import 'format.dart';
import 'session.dart';

/// How far the customer has paid for the car.
enum PayState { paid, partial, credit, unknown }

/// The customer who has a sold (or sale-pending) car. Until the ownership
/// transfer is done the car is still in the company's name, so its traffic
/// fines come to the company — this is who to call about them.
class CarHolder {
  const CarHolder({
    required this.name,
    this.phone = '',
    this.idNumber = '',
    this.address = '',
    this.total,
    this.paid,
    this.soldAt,
  });

  final String name, phone, idNumber, address;
  final num? total, paid;
  final DateTime? soldAt;

  num? get balance => total == null || paid == null ? null : (total! - paid!).clamp(0, total!);

  PayState get pay {
    if (total == null || paid == null) return PayState.unknown;
    if (paid! >= total!) return PayState.paid;
    return paid! > 0 ? PayState.partial : PayState.credit;
  }
}

/// Whether the company has let go of [vehicle]: sold (out of stock), not
/// waiting for a transfer, and paid in full. Its traffic fines are then the
/// owner's, not the company's, so they are no longer followed. Anything
/// else — in the yard, pending transfer, on credit or partly paid — is still
/// in the company's name, and its fines are.
bool isReleased(Map<String, dynamic> vehicle, CarHolder? holder) {
  final qty = vehicle['quantity'] is num ? vehicle['quantity'] as num : num.tryParse('${vehicle['quantity']}') ?? 0;
  final pending = attributesOf(vehicle['attributes'])['sale_status'] == 'pending';
  return qty <= 0 && !pending && holder?.pay == PayState.paid;
}

/// The vehicles in [list] the company still follows fines for.
Future<List<Map<String, dynamic>>> trackedForFines(Session s, List<Map<String, dynamic>> list) async {
  final keep = await Future.wait(list.map((v) async {
    final qty = v['quantity'] is num ? v['quantity'] as num : 0;
    if (qty > 0) return true; // still the company's car
    return !isReleased(v, await carHolder(s, v));
  }));
  return [for (var i = 0; i < list.length; i++) if (keep[i]) list[i]];
}

final _cache = Expando<Map<String, Future<CarHolder?>>>();
final _debtsCache = Expando<Future<List<Map<String, dynamic>>>>();

/// Finds who has [vehicle]: its latest sale, that sale's customer (name,
/// phone, ID, address) and what is still owed (the sale's debt, else the
/// sale's own amount paid). Falls back to the buyer saved on the vehicle.
/// Null when the car has no buyer recorded at all. Remembered per session.
Future<CarHolder?> carHolder(Session s, Map<String, dynamic> vehicle) {
  final byId = _cache[s] ??= {};
  return byId['${vehicle['id']}'] ??= _load(s, vehicle);
}

/// Forget what was loaded (after live changes to sales or debts).
void forgetHolders(Session s) {
  _cache[s] = null;
  _debtsCache[s] = null;
}

Future<CarHolder?> _load(Session s, Map<String, dynamic> vehicle) async {
  Map<String, dynamic> m(Object? x) => x is Map ? Map<String, dynamic>.from(x) : <String, dynamic>{};
  num? n(Object? v) => v is num ? v : num.tryParse('${v ?? ''}');
  final a = attributesOf(vehicle['attributes']);

  Map<String, dynamic>? sale;
  try {
    final res = await s.api.get('${Svc.sales}/sales', query: {'product_id': '${vehicle['id']}', 'page': '1', 'limit': '1'});
    final items = (m(m(res)['data'])['items'] as List?) ?? const [];
    if (items.isNotEmpty) sale = m(items.first);
  } catch (_) {}

  Map<String, dynamic> customer = {};
  final customerId = '${sale?['customer_id'] ?? ''}';
  if (customerId.isNotEmpty) {
    try {
      customer = m(m(await s.api.get('${Svc.suppliers}/suppliers/$customerId'))['data']);
    } catch (_) {}
  }

  String pick(String fromCustomer, String fromVehicle) {
    final v = '${customer[fromCustomer] ?? ''}'.trim();
    return v.isNotEmpty ? v : (a[fromVehicle] ?? '').trim();
  }

  final name = pick('name', 'buyer_name');
  if (name.isEmpty && sale == null) return null;

  num? total = n(sale?['total_amount']);
  num? paid = n(sale?['amount_paid']);
  // A debt recorded for the sale is the most up to date: payments go there.
  if (sale != null) {
    try {
      final debts = await (_debtsCache[s] ??= s.api
          .get('${Svc.sales}/debts')
          .then((r) => ((m(m(r)['data'])['items'] as List?) ?? const []).map(m).toList()));
      final d = debts.where((d) => d['sale_id'] == sale!['id']).firstOrNull;
      if (d != null) {
        total = n(d['amount_owed']) ?? total;
        paid = n(d['amount_paid']) ?? paid;
      }
    } catch (_) {}
    // No amount recorded: paid in full unless it was sold on credit.
    if (paid == null && total != null) paid = sale['payment_method'] == 'debt' ? 0 : total;
  }

  return CarHolder(
    name: name.isEmpty ? '—' : name,
    phone: pick('phone', 'buyer_phone'),
    idNumber: pick('id_number', 'buyer_id_no'),
    address: pick('address', 'buyer_address'),
    total: total,
    paid: paid,
    soldAt: parseTimestamp(sale?['created_at']),
  );
}
