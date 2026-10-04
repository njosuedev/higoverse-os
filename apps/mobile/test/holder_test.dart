import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:higoverse_inventory_mobile/src/holder.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';

http.Response _ok(Object? data) =>
    http.Response(jsonEncode({'success': true, 'data': data}), 200, headers: {'content-type': 'application/json'});

Session _session() => Session(client: MockClient((req) async {
      final p = req.url.path, q = req.url.queryParameters;
      if (p.endsWith('/sales')) {
        return _ok({
          'items': switch (q['product_id']) {
            'partly' => [
                {'id': 's1', 'customer_id': 'c1', 'total_amount': 18000000, 'amount_paid': 6000000, 'payment_method': 'mtn'}
              ],
            'credit' => [
                {'id': 's2', 'customer_id': 'c2', 'total_amount': 9000000, 'amount_paid': null, 'payment_method': 'debt'}
              ],
            'cash' => [
                {'id': 's3', 'total_amount': 5000000, 'payment_method': 'cash'}
              ],
            _ => [],
          },
        });
      }
      if (p.endsWith('/suppliers/c1')) {
        return _ok({'name': 'Jean Bosco', 'phone': '0788123456', 'id_number': '1199080012345678', 'address': 'Kicukiro'});
      }
      if (p.endsWith('/suppliers/c2')) return _ok({'name': 'Aline Uwase', 'phone': '0722000111'});
      if (p.endsWith('/debts')) {
        return _ok({
          'items': [
            {'sale_id': 's2', 'amount_owed': 9000000, 'amount_paid': 2500000},
          ],
        });
      }
      return _ok(null);
    }))
  ..accessToken = 'x';

void main() {
  test('partly paid: the customer from the sale, what they still owe', () async {
    final h = (await carHolder(_session(), {'id': 'partly', 'attributes': '{}'}))!;
    expect(h.name, 'Jean Bosco');
    expect(h.phone, '0788123456');
    expect(h.idNumber, '1199080012345678');
    expect(h.address, 'Kicukiro');
    expect(h.pay, PayState.partial);
    expect(h.balance, 12000000);
  });

  test('sold on credit: payments come from the debt', () async {
    final h = (await carHolder(_session(), {'id': 'credit', 'attributes': '{}'}))!;
    expect(h.name, 'Aline Uwase');
    expect(h.paid, 2500000);
    expect(h.balance, 6500000);
    expect(h.pay, PayState.partial);
  });

  test('no customer record: the buyer saved on the vehicle; cash sale paid in full', () async {
    final h = (await carHolder(_session(), {
      'id': 'cash',
      'attributes': jsonEncode({'buyer_name': 'Eric H', 'buyer_phone': '0733444555', 'buyer_id_no': '1198'}),
    }))!;
    expect(h.name, 'Eric H');
    expect(h.phone, '0733444555');
    expect(h.pay, PayState.paid);
    expect(h.balance, 0);
  });

  test('never sold and no buyer: nobody', () async {
    expect(await carHolder(_session(), {'id': 'none', 'attributes': '{}'}), isNull);
  });
}
