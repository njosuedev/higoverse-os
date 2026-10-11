import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Session _staff(http.Client client) => Session(client: client)
  ..accessToken = 'a'
  ..user = User(id: 'u2', name: 'Eli', email: 'eli@x.rw', role: 'staff');

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('a dropped connection while loading the shop is tried again', () async {
    var shopCalls = 0;
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/shop') && shopCalls++ == 0) throw http.ClientException('Connection reset by peer');
      if (req.url.path.endsWith('/shop')) return http.Response(jsonEncode({'data': {'id': 's1', 'name': 'Cars', 'layout': 'car'}}), 200);
      return http.Response(jsonEncode({'data': {}}), 200);
    });
    final s = _staff(client);
    await s.loadAccount();
    expect(shopCalls, 2);
    expect(s.isCar, isTrue);
    expect(s.canSeeFinancials, isFalse);
  });

  test('staff see no money figures while the shop is unknown', () async {
    final client = MockClient((req) async => throw http.ClientException('offline'));
    final s = _staff(client);
    await s.loadAccount();
    expect(s.shop, isNull);
    // Could be a car company: hide rather than show.
    expect(s.canSeeFinancials, isFalse);
  });
}
