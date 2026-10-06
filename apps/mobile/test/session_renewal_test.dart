import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _Tokens implements TokenSource {
  _Tokens(this.result);
  final Renewal result;
  @override
  String? accessToken = 'old';
  bool expired = false;
  @override
  Future<Renewal> refresh() async {
    if (result == Renewal.renewed) accessToken = 'new';
    return result;
  }

  @override
  Future<void> expire() async => expired = true;
}

void main() {
  // 401 until the renewed token is sent.
  final client = MockClient((req) async =>
      req.headers['Authorization'] == 'Bearer new' ? http.Response('{"ok":true}', 200) : http.Response('{"detail":"expired"}', 401));

  test('a renewed token is retried and the user stays signed in', () async {
    final t = _Tokens(Renewal.renewed);
    expect(await Api(t, client: client).get('/x'), {'ok': true});
    expect(t.expired, isFalse);
  });

  test('no connection while renewing keeps the user signed in', () async {
    final t = _Tokens(Renewal.unavailable);
    await expectLater(Api(t, client: client).get('/x'), throwsA(isA<ApiException>().having((e) => e.key, 'key', 'err.network')));
    expect(t.expired, isFalse);
  });

  test('a refused refresh token ends the session', () async {
    final t = _Tokens(Renewal.rejected);
    await expectLater(Api(t, client: client).get('/x'), throwsA(isA<ApiException>().having((e) => e.key, 'key', 'err.session')));
    expect(t.expired, isTrue);
  });
}
