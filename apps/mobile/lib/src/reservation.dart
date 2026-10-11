import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import 'config.dart';
import 'format.dart';
import 'i18n.dart';
import 'proforma.dart' show askDeposit;
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';

// A car reserved for a buyer who pays it in deposits — the same record as on
// the website (apps/web/lib/business-layout.ts, items/VehicleGrid.tsx), kept
// in the car's attributes:
//
//   sale_status "pending", the buyer (buyer_customer_id, buyer_name,
//   buyer_phone, buyer_id_no), agreed_price, and every deposit as JSON:
//   [{amount, method, date, at, reference?}].
//
// The car stays in stock, shown as pending to everyone, while the buyer pays.
// The deposit that completes the agreed price records the sale to the buyer
// at that price, which takes the car out of stock — as dealers do: a deposit
// holds the car and counts towards the price when the deal is closed.

num _n(Object? v) => v is num ? v : num.tryParse('${v ?? ''}') ?? 0;
String _today() => DateTime.now().toIso8601String().substring(0, 10);

/// Ways a deposit is paid (cash, MTN, Airtel, bank, card).
const carDepositMethods = ['cash', 'mtn', 'airtel', 'bank', 'card'];

/// The reservation fields; cleared when the car is released.
const clearReservation = <String, String>{
  'sale_status': '', 'buyer_name': '', 'buyer_phone': '', 'buyer_id_no': '', 'pending_since': '', 'pending_at': '',
  'pending_note': '', 'buyer_customer_id': '', 'agreed_price': '', 'deposits': '',
};

/// Every deposit recorded on the car, oldest first.
List<Map<String, dynamic>> depositsOf(Map<String, String> a) {
  try {
    final list = jsonDecode(a['deposits'] ?? '[]');
    if (list is List) {
      return [
        for (final d in list.whereType<Map>())
          if (_n(d['amount']) > 0) {...Map<String, dynamic>.from(d), 'amount': _n(d['amount'])},
      ];
    }
  } catch (_) {}
  return const [];
}

/// What the buyer agreed to pay, has paid so far, and has left to pay.
class CarPayments {
  const CarPayments({required this.price, required this.paid, required this.deposits});
  final num price, paid;
  final List<Map<String, dynamic>> deposits;
  num get balance => (price - paid).clamp(0, price);
  bool get full => price > 0 && paid >= price;
  double get ratio => price <= 0 ? 0 : (paid / price).clamp(0, 1).toDouble();
}

/// The agreed price (the car's price when none was agreed) and deposits.
CarPayments carPayments(Map<String, String> a, Object? sellingPrice) {
  final agreed = _n(a['agreed_price']);
  final deposits = depositsOf(a);
  return CarPayments(
    price: agreed > 0 ? agreed : _n(sellingPrice),
    paid: deposits.fold<num>(0, (s, d) => s + _n(d['amount'])),
    deposits: deposits,
  );
}

bool isPendingCar(Map<String, dynamic> v) => _n(v['quantity']) > 0 && attributesOf(v['attributes'])['sale_status'] == 'pending';

/// Why a reservation or deposit was refused.
enum ReserveProblem { idsMissing, buyerIncomplete, priceInvalid, depositIsFull, depositInvalid }

class ReserveException implements Exception {
  const ReserveException(this.problem);
  final ReserveProblem problem;

  /// The message, in the app's language (the website's wording).
  String text(T t) => t(switch (problem) {
        ReserveProblem.idsMissing => 'car.ids_missing',
        ReserveProblem.buyerIncomplete => 'form.buyer_incomplete',
        ReserveProblem.priceInvalid => 'car.price_invalid',
        ReserveProblem.depositIsFull => 'car.deposit_is_full',
        ReserveProblem.depositInvalid => 'car.deposit_invalid',
      });
}

/// Re-reads the car and merges [changes] (worked out from its latest
/// attributes) into them, so a deposit or status never overwrites what
/// someone else just saved. Empty values remove a field. Returns the
/// attributes as saved.
Future<Map<String, String>> patchCar(Session s, String id, Map<String, String> Function(Map<String, String> fresh) changes) async {
  final res = await s.api.get('${Svc.products}/products/$id');
  final fresh = attributesOf(((res as Map)['data'] as Map?)?['attributes']);
  final merged = {...fresh, ...changes(fresh)}..removeWhere((_, v) => v.trim().isEmpty);
  await s.api.put('${Svc.products}/products/$id', {'attributes': merged.isEmpty ? null : jsonEncode(merged)});
  return merged;
}

/// Reserves the car for [buyer] (a saved customer: name, phone and ID) at
/// [price], with an optional first [deposit] ({amount, method, date,
/// reference}). The car needs its plate and chassis first; a deposit that
/// covers the whole price is a sale, not a reservation.
Future<void> reserveCar(Session s, Map<String, dynamic> vehicle,
    {required Map<String, dynamic> buyer, required num price, Map<String, dynamic>? deposit, String note = ''}) async {
  String f(String k) => '${buyer[k] ?? ''}'.trim();
  if (f('name').isEmpty || f('phone').isEmpty || f('id_number').isEmpty) throw const ReserveException(ReserveProblem.buyerIncomplete);
  if (price <= 0) throw const ReserveException(ReserveProblem.priceInvalid);
  final first = _n(deposit?['amount']);
  if (first < 0) throw const ReserveException(ReserveProblem.depositInvalid);
  if (first >= price) throw const ReserveException(ReserveProblem.depositIsFull);
  await patchCar(s, '${vehicle['id']}', (fresh) {
    if ((fresh['plate_no'] ?? '').trim().isEmpty || (fresh['chassis_no'] ?? '').trim().isEmpty) {
      throw const ReserveException(ReserveProblem.idsMissing);
    }
    return {
      'sale_status': 'pending',
      'buyer_customer_id': '${buyer['id']}',
      'buyer_name': f('name'),
      'buyer_phone': f('phone'),
      'buyer_id_no': f('id_number'),
      'pending_note': note.trim(),
      'pending_since': _today(),
      'pending_at': DateTime.now().toUtc().toIso8601String(),
      'agreed_price': '${price.round()}',
      'deposits': first > 0 ? jsonEncode([_deposit(deposit!)]) : '',
    };
  });
}

Map<String, dynamic> _deposit(Map<String, dynamic> d) => {
      'amount': _n(d['amount']),
      'method': '${d['method'] ?? 'cash'}',
      'date': '${d['date'] ?? _today()}',
      'at': DateTime.now().toUtc().toIso8601String(),
      if ('${d['reference'] ?? ''}'.trim().isNotEmpty) 'reference': '${d['reference']}'.trim(),
    };

/// What happened to a deposit.
enum DepositOutcome { saved, sold, noCustomer }

/// Adds [deposit] to a pending car, checked against its latest balance (two
/// people may take payments at once). The one that completes the price
/// records the sale; [t] words the sale's note.
Future<DepositOutcome> addCarDeposit(Session s, Map<String, dynamic> vehicle, Map<String, dynamic> deposit, T t) async {
  final amount = _n(deposit['amount']);
  final merged = await patchCar(s, '${vehicle['id']}', (fresh) {
    final pay = carPayments(fresh, vehicle['selling_price']);
    if (amount <= 0 || amount > pay.balance) throw const ReserveException(ReserveProblem.depositInvalid);
    return {'deposits': jsonEncode([...pay.deposits, _deposit(deposit)])};
  });
  if (!carPayments(merged, vehicle['selling_price']).full) return DepositOutcome.saved;
  return await sellPaidCar(s, vehicle, merged, t) ? DepositOutcome.sold : DepositOutcome.noCustomer;
}

/// Records the sale of a fully paid pending car to its buyer at the agreed
/// price, as the website does: the payment method most of the money came
/// by, and a note with every deposit and the car's plate and chassis (the
/// record the company keeps). False when the reservation has no customer
/// record (older ones): the sale is then made by hand.
Future<bool> sellPaidCar(Session s, Map<String, dynamic> vehicle, Map<String, String> a, T t) async {
  final customer = a['buyer_customer_id'] ?? '';
  if (customer.isEmpty) return false;
  final pay = carPayments(a, vehicle['selling_price']);
  final byMethod = <String, num>{};
  for (final d in pay.deposits) {
    byMethod.update('${d['method']}', (v) => v + _n(d['amount']), ifAbsent: () => _n(d['amount']));
  }
  final method = byMethod.isEmpty ? 'cash' : (byMethod.entries.toList()..sort((x, y) => y.value.compareTo(x.value))).first.key;
  final paid = pay.deposits.map((d) => '${d['date']} ${groupDigits(_n(d['amount']).round())} ${t('pm.${d['method']}')}').join('; ');
  final car = [
    if ((a['plate_no'] ?? '').isNotEmpty) '${t('car.plate_no')} ${a['plate_no']}',
    if ((a['chassis_no'] ?? '').isNotEmpty) '${t('car.chassis_no')} ${a['chassis_no']}',
  ].join(' · ');
  await s.api.post('${Svc.sales}/sales', {
    'product_id': '${vehicle['id']}',
    'customer_id': customer,
    'quantity': 1,
    'unit_price': pay.price,
    'payment_method': method,
    'amount_paid': pay.price,
    'notes': ['${t('car.deposit_sale_note')}: $paid.', if (car.isNotEmpty) car].join(' '),
  });
  return true;
}

/// Releases the car: available to other buyers again, the buyer's details
/// and deposits removed from it.
Future<void> releaseCar(Session s, Map<String, dynamic> vehicle) => patchCar(s, '${vehicle['id']}', (_) => clearReservation);

// ── Actions with their questions and messages ─────────────────────────────

void _say(BuildContext context, String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

/// "Add deposit" on a pending car: the same form as a proforma's (amount
/// with 30 % / 50 % / full-balance picks, how it was paid, date,
/// reference). A fully paid car is sold instead. True when something changed.
Future<bool> takeCarDeposit(BuildContext context, Map<String, dynamic> vehicle) async {
  final s = SessionScope.of(context);
  final t = T.of(context);
  final pay = carPayments(attributesOf(vehicle['attributes']), vehicle['selling_price']);
  if (pay.full) return completeCarSale(context, vehicle);
  final deposit = await askDeposit(context, balance: pay.balance, currency: s.currency);
  if (deposit == null || !context.mounted) return false;
  try {
    final outcome = await addCarDeposit(s, vehicle, deposit, t);
    if (!context.mounted) return true;
    _say(context, t(switch (outcome) {
      DepositOutcome.saved => 'car.deposit_saved',
      DepositOutcome.sold => 'car.paid_sold',
      DepositOutcome.noCustomer => 'car.no_buyer_customer',
    }));
    return true;
  } on ReserveException catch (e) {
    if (context.mounted) _say(context, e.text(t));
    return true; // the balance moved meanwhile: show the latest
  } catch (e) {
    if (context.mounted) _say(context, errorText(t, e));
    return false;
  }
}

/// A paid-up car whose sale wasn't recorded yet (or failed): record it.
Future<bool> completeCarSale(BuildContext context, Map<String, dynamic> vehicle) async {
  final s = SessionScope.of(context);
  final t = T.of(context);
  try {
    final res = await s.api.get('${Svc.products}/products/${vehicle['id']}');
    final a = attributesOf(((res as Map)['data'] as Map?)?['attributes']);
    final sold = await sellPaidCar(s, vehicle, a, t);
    if (context.mounted) _say(context, t(sold ? 'car.paid_sold' : 'car.no_buyer_customer'));
    return sold;
  } catch (_) {
    if (context.mounted) _say(context, t('car.sale_failed'));
    return false;
  }
}

/// "Release" (asked first; with deposits, says how much was paid in).
Future<bool> confirmReleaseCar(BuildContext context, Map<String, dynamic> vehicle) async {
  final s = SessionScope.of(context);
  final t = T.of(context);
  final pay = carPayments(attributesOf(vehicle['attributes']), vehicle['selling_price']);
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(t('car.release_title')),
      content: Text([
        t('car.release_confirm'),
        if (pay.paid > 0) '${t('car.release_confirm_deposits')} ${money(pay.paid, s.currency)}.',
      ].join(' ')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('app.cancel'))),
        FilledButton(
          style: pay.paid > 0 ? FilledButton.styleFrom(backgroundColor: Hgv.of(context).danger) : null,
          onPressed: () => Navigator.pop(c, true),
          child: Text(t('car.release')),
        ),
      ],
    ),
  );
  if (ok != true || !context.mounted) return false;
  try {
    await releaseCar(s, vehicle);
    if (context.mounted) _say(context, t('car.released'));
    return true;
  } catch (e) {
    if (context.mounted) _say(context, errorText(t, e));
    return false;
  }
}

// ── What a pending car shows ──────────────────────────────────────────────

/// A pending car's payments: agreed price, paid so far and balance (one
/// bar, in the brand's ink — colour only for the status itself), the buyer
/// it's reserved for, and every deposit. [onAdd] adds a deposit.
class CarPaymentsCard extends StatelessWidget {
  const CarPaymentsCard({super.key, required this.vehicle, this.onAdd, this.compact = false});
  final Map<String, dynamic> vehicle;
  final VoidCallback? onAdd;

  /// Without the list of deposits (the story card).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final a = attributesOf(vehicle['attributes']);
    final pay = carPayments(a, vehicle['selling_price']);
    final buyer = [a['buyer_name'], a['buyer_phone']].where((x) => (x ?? '').isNotEmpty).join(' · ');
    TextStyle label() => TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: c.faint);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (buyer.isNotEmpty) ...[
          Text(t('story.holder').toUpperCase(), style: label()),
          const SizedBox(height: 4),
          Text(buyer, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
        ],
        Row(children: [
          for (final (k, v) in [('car.agreed_price', pay.price), ('car.paid', pay.paid), ('car.balance', pay.balance)])
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t(k), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: c.muted)),
                Text(groupDigits(v.round()),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: k == 'car.balance' ? FontWeight.w900 : FontWeight.w700, color: c.text)),
              ]),
            ),
        ]),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(value: pay.ratio, minHeight: 6, backgroundColor: c.border, color: c.ink),
        ),
        const SizedBox(height: 4),
        Text(pay.full ? t('car.fully_paid') : '${money(pay.paid, s.currency)} ${t('car.paid_of')} ${money(pay.price, s.currency)}',
            style: TextStyle(fontSize: 12, color: c.muted)),
        if (!compact) ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: Text(t('car.deposits_title').toUpperCase(), style: label())),
            if (onAdd != null && !pay.full)
              TextButton.icon(onPressed: onAdd, icon: const Icon(PhosphorIconsBold.plus, size: 16), label: Text(t('car.add_deposit'))),
          ]),
          if (pay.deposits.isEmpty)
            Text(t('car.no_deposits'), style: TextStyle(color: c.muted, fontSize: 12.5))
          else
            for (final d in pay.deposits)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(children: [
                  Icon(PhosphorIconsRegular.wallet, size: 18, color: c.muted),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      [
                        '${d['date'] ?? ''}'.replaceAll('-', '.'),
                        t('pm.${d['method']}'),
                        if ('${d['reference'] ?? ''}'.isNotEmpty) '${d['reference']}',
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: c.muted),
                    ),
                  ),
                  Text(money(_n(d['amount']), s.currency), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800)),
                ]),
              ),
          const SizedBox(height: 6),
          Text(t('car.fines_still_yours'), style: TextStyle(fontSize: 11.5, color: c.faint, height: 1.3)),
        ],
      ]),
    );
  }
}
