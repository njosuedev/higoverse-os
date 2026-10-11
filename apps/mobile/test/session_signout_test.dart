import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/api.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status);

final _signedIn = {
  'access_token': 'a1',
  'refresh_token': 'r1',
  'user': {'id': 'u1', 'name': 'Ann', 'email': 'ann@x.rw', 'role': 'owner'},
};

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('signing out leaves nothing of the account behind (bank, tax, car names)', () async {
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) return _json(_signedIn);
      if (req.url.path.endsWith('/settings')) {
        return _json({
          'data': {
            'tax_rate': 18,
            'bank_name': 'BK',
            'bank_account': '0001',
            'bank_holder': 'Ann Ltd',
            'bank_accounts': [
              {'id': 'b1', 'bank_name': 'BK', 'bank_account': '0001', 'bank_holder': 'Ann Ltd', 'is_default': true},
            ],
            'car_names': ['Toyota RAV4'],
          },
        });
      }
      return _json({'data': {'id': 's1', 'name': 'Shop', 'layout': 'car'}});
    });
    final s = Session(client: client);
    await http.runWithClient(() => s.login('ann@x.rw', 'pw'), () => client);
    expect(s.hasBank, isTrue);
    expect(s.carNames, isNotEmpty);

    await http.runWithClient(s.logout, () => client);
    expect(s.signedIn, isFalse);
    expect(s.hasBank, isFalse);
    expect(s.bankAccounts, isEmpty);
    expect(s.bankName, isEmpty);
    expect(s.taxRate, 0);
    expect(s.carNames, isEmpty);
  });

  test('a token renewal answered after sign-out does not sign back in', () async {
    final renewal = Completer<http.Response>();
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) return _json(_signedIn);
      if (req.url.path.endsWith('/auth/refresh')) return renewal.future;
      return _json({'data': {}});
    });
    const store = FlutterSecureStorage();
    final s = Session(client: client);
    await http.runWithClient(() async {
      await s.login('ann@x.rw', 'pw');
      final pending = s.refresh();
      await s.logout();
      renewal.complete(_json({..._signedIn, 'access_token': 'a2', 'refresh_token': 'r2'}));
      // Not `rejected`: that would end whichever session is open by then.
      expect(await pending, Renewal.unavailable);
    }, () => client);

    expect(s.signedIn, isFalse);
    expect(s.accessToken, isNull);
    expect(await store.read(key: 'hgv_access'), isNull);
    expect(await store.read(key: 'hgv_refresh'), isNull);
    // Opening the app again finds no session.
    expect(await Session(client: client).restore(), isFalse);
  });
}
