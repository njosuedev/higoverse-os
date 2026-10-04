import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/updates/update_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class MemoryStore implements UpdateStore {
  final data = <String, String>{};
  @override
  Future<String?> read(String key) async => data[key];
  @override
  Future<void> write(String key, String? value) async => value == null ? data.remove(key) : data[key] = value;
}

final apk = List<int>.generate(300 * 1024, (i) => (i * 31) % 251);
final apkSha = sha256.convert(apk).toString();

Map<String, Object?> releaseJson({int code = 4, bool force = false, int min = 0, String? sha, String url = 'https://higoverse.com/downloads/android/Higoverse-1.3.0.apk'}) => {
      'version': '1.3.0',
      'version_code': code,
      'download_url': url,
      'sha256': sha ?? apkSha,
      'size': apk.length,
      'force_update': force,
      'min_supported_version_code': min,
      'release_notes': 'Faster stock lists.',
    };

ReleaseInfo release({String? sha}) => ReleaseInfo.fromJson(releaseJson(sha: sha))!;

/// Serves [apk], honouring Range, optionally breaking off after [cutAt] bytes.
MockClient fileServer({int? cutAt, bool ignoreRange = false, List<String?>? ranges, Duration? stall}) =>
    MockClient.streaming((req, _) async {
      ranges?.add(req.headers['Range']);
      var start = 0;
      final range = req.headers['Range'];
      if (range != null && !ignoreRange) start = int.parse(RegExp(r'bytes=(\d+)-').firstMatch(range)!.group(1)!);
      if (start >= apk.length) return http.StreamedResponse(const Stream.empty(), 416);
      final body = apk.sublist(start);
      final ctrl = StreamController<List<int>>();
      () async {
        for (var i = 0; i < body.length; i += 16 * 1024) {
          if (cutAt != null && start + i >= cutAt) {
            ctrl.addError(const SocketException('connection reset'));
            await ctrl.close();
            return;
          }
          if (stall != null && i > 0) await Future<void>.delayed(stall);
          ctrl.add(body.sublist(i, (i + 16 * 1024).clamp(0, body.length)));
        }
        await ctrl.close();
      }();
      return http.StreamedResponse(ctrl.stream, start > 0 ? 206 : 200, contentLength: body.length);
    });

void main() {
  late Directory dir;
  setUp(() async => dir = await Directory.systemTemp.createTemp('hgv_upd_'));
  tearDown(() async => dir.delete(recursive: true));

  group('release info', () {
    test('valid release parses', () {
      final r = release();
      expect(r.versionCode, 4);
      expect(r.downloadUrl.host, 'higoverse.com');
    });
    test('unsafe or broken releases are ignored', () {
      expect(ReleaseInfo.fromJson(releaseJson(url: 'http://higoverse.com/a.apk')), isNull);
      expect(ReleaseInfo.fromJson(releaseJson(sha: 'abc')), isNull);
      expect(ReleaseInfo.fromJson({...releaseJson(), 'version': 'latest'}), isNull);
      expect(ReleaseInfo.fromJson({...releaseJson(), 'version_code': 0}), isNull);
      expect(ReleaseInfo.fromJson(null), isNull);
      expect(ReleaseInfo.fromJson('x'), isNull);
    });
  });

  group('decision', () {
    test('current version: nothing to do', () {
      expect(decide(release(), 4), UpdateKind.none);
      expect(decide(release(), 5), UpdateKind.none);
      expect(decide(null, 1), UpdateKind.none);
    });
    test('newer version: optional', () => expect(decide(release(), 3), UpdateKind.optional));
    test('forced: required', () => expect(decide(ReleaseInfo.fromJson(releaseJson(force: true)), 3), UpdateKind.required));
    test('below the minimum supported: required', () {
      final r = ReleaseInfo.fromJson(releaseJson(min: 3))!;
      expect(decide(r, 2), UpdateKind.required);
      expect(decide(r, 3), UpdateKind.optional);
    });
  });

  group('checker', () {
    final endpoint = Uri.parse('https://higoverse.com/svc/settings/api/app-updates/latest');
    var now = DateTime(2026, 10, 4, 9);
    UpdateChecker checker(http.Client c, MemoryStore s, {Duration timeout = const Duration(seconds: 2)}) =>
        UpdateChecker(endpoint: endpoint, store: s, client: c, timeout: timeout, now: () => now);

    test('asks the endpoint for this platform', () async {
      Uri? asked;
      final r = await checker(MockClient((req) async {
        asked = req.url;
        return http.Response(jsonEncode(releaseJson()), 200);
      }), MemoryStore())
          .latest();
      expect(r!.version, '1.3.0');
      expect(asked!.queryParameters['platform'], 'android');
    });

    test('checks at most every 6 hours unless asked by hand', () async {
      var calls = 0;
      final store = MemoryStore();
      final c = MockClient((_) async {
        calls++;
        return http.Response(jsonEncode(releaseJson()), 200);
      });
      await checker(c, store).latest();
      now = now.add(const Duration(hours: 1));
      expect((await checker(c, store).latest())!.versionCode, 4, reason: 'cached answer');
      expect(calls, 1);
      await checker(c, store).latest(force: true);
      expect(calls, 2);
      now = now.add(const Duration(hours: 7));
      await checker(c, store).latest();
      expect(calls, 3);
    });

    test('no internet / server down / slow server: last known answer, no error', () async {
      final store = MemoryStore();
      await checker(MockClient((_) async => http.Response(jsonEncode(releaseJson()), 200)), store).latest();
      expect((await checker(MockClient((_) => throw const SocketException('offline')), store).latest(force: true))!.versionCode, 4);
      expect((await checker(MockClient((_) async => http.Response('bad gateway', 502)), store).latest(force: true))!.versionCode, 4);
      final slow = MockClient((_) async {
        await Future<void>.delayed(const Duration(seconds: 3));
        return http.Response('{}', 200);
      });
      expect((await checker(slow, store, timeout: const Duration(milliseconds: 200)).latest(force: true))!.versionCode, 4);
      expect(await checker(MockClient((_) => throw const SocketException('offline')), MemoryStore()).latest(), isNull);
    });

    test('no release published (404): nothing', () async {
      expect(await checker(MockClient((_) async => http.Response('', 404)), MemoryStore()).latest(), isNull);
    });
  });

  test('"Later" puts a version off for a day', () async {
    var now = DateTime(2026, 10, 4);
    final s = Snooze(MemoryStore(), now: () => now);
    await s.snooze(4);
    expect(await s.isSnoozed(4), isTrue);
    expect(await s.isSnoozed(5), isFalse, reason: 'a newer version asks again');
    now = now.add(const Duration(hours: 25));
    expect(await s.isSnoozed(4), isFalse);
  });

  group('download', () {
    test('successful download, with progress, verified', () async {
      final seen = <int>[];
      final f = await downloadRelease(release(), dir, fileName: 'h.apk', client: fileServer(), onProgress: (got, _) => seen.add(got));
      expect(await f.readAsBytes(), apk);
      expect(seen.last, apk.length);
      expect(seen, orderedEquals([...seen]..sort()));
    });

    test('corrupted update is rejected and removed', () async {
      await expectLater(
        downloadRelease(release(sha: 'f' * 64), dir, fileName: 'h.apk', client: fileServer()),
        throwsA(isA<UpdateDownloadException>().having((e) => e.kind, 'kind', DownloadError.corrupt)),
      );
      expect(dir.listSync(), isEmpty);
    });

    test('interrupted download resumes where it stopped', () async {
      await expectLater(
        downloadRelease(release(), dir, fileName: 'h.apk', client: fileServer(cutAt: 128 * 1024)),
        throwsA(isA<UpdateDownloadException>().having((e) => e.kind, 'kind', DownloadError.network)),
      );
      final kept = File('${dir.path}/h.apk.part').lengthSync();
      expect(kept, greaterThan(0));
      final ranges = <String?>[];
      final f = await downloadRelease(release(), dir, fileName: 'h.apk', client: fileServer(ranges: ranges));
      expect(ranges.single, 'bytes=$kept-');
      expect(await f.readAsBytes(), apk);
    });

    test('server without Range support: starts over and still verifies', () async {
      File('${dir.path}/h.apk.part').writeAsBytesSync(apk.sublist(0, 1000));
      final f = await downloadRelease(release(), dir, fileName: 'h.apk', client: fileServer(ignoreRange: true));
      expect(await f.readAsBytes(), apk);
    });

    test('stalled connection fails instead of hanging', () async {
      await expectLater(
        downloadRelease(release(), dir,
            fileName: 'h.apk', client: fileServer(stall: const Duration(seconds: 2)), stallTimeout: const Duration(milliseconds: 300)),
        throwsA(isA<UpdateDownloadException>().having((e) => e.kind, 'kind', DownloadError.network)),
      );
    });

    test('server error is reported', () async {
      await expectLater(
        downloadRelease(release(), dir, fileName: 'h.apk', client: MockClient((_) async => http.Response('', 503))),
        throwsA(isA<UpdateDownloadException>().having((e) => e.kind, 'kind', DownloadError.http)),
      );
    });

    test('cancel stops the download and keeps the part for later', () async {
      final cancel = CancelToken();
      await expectLater(
        downloadRelease(release(), dir, fileName: 'h.apk', client: fileServer(stall: const Duration(milliseconds: 30)), cancel: cancel,
            onProgress: (got, _) {
          if (got > 64 * 1024) cancel.cancel();
        }),
        throwsA(isA<UpdateDownloadException>().having((e) => e.kind, 'kind', DownloadError.cancelled)),
      );
    });

    test('an already verified download is reused without the network', () async {
      File('${dir.path}/h.apk').writeAsBytesSync(apk);
      final f = await downloadRelease(release(), dir, fileName: 'h.apk', client: MockClient((_) => throw StateError('no network needed')));
      expect(f.lengthSync(), apk.length);
    });
  });
}
