import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _Tokens implements TokenSource {
  @override
  String? accessToken = 't';
  @override
  Future<Renewal> refresh() async => Renewal.unavailable;
  @override
  Future<void> expire() async {}
}

const _wait = Duration(milliseconds: 300);

void main() {
  test('an answer that stops halfway fails instead of loading forever', () async {
    http.BaseRequest? sent;
    final client = MockClient.streaming((req, _) async {
      sent = req;
      // Headers and the first bytes arrive, then nothing more, ever.
      final body = StreamController<List<int>>()..add(utf8.encode('{"data": ['));
      return http.StreamedResponse(body.stream, 200);
    });
    final api = Api(_Tokens(), client: client, timeout: _wait);

    await expectLater(
      api.get('/products').timeout(const Duration(seconds: 5)),
      throwsA(isA<ApiException>().having((e) => e.key, 'key', 'err.timeout')),
    );
    // The connection itself is let go, not just stopped waiting for.
    await expectLater((sent! as http.Abortable).abortTrigger, completes);
  });

  test('a slow answer that keeps coming is not cut off', () async {
    final client = MockClient.streaming((req, _) async {
      final body = StreamController<List<int>>();
      () async {
        for (final part in ['{"data":', ' [1, 2', ', 3]}']) {
          await Future<void>.delayed(_wait * 0.6); // each pause shorter than the limit…
          body.add(utf8.encode(part));
        }
        await body.close(); // …though the whole answer takes longer than it
      }();
      return http.StreamedResponse(body.stream, 200);
    });
    final api = Api(_Tokens(), client: client, timeout: _wait);
    expect(await api.get('/products'), {'data': [1, 2, 3]});
  });
}
