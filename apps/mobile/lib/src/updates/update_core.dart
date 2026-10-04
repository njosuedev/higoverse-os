import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

/// The update logic with no UI: what the server offers, whether this install
/// must or may update, the background check with its cache, and the
/// resumable, SHA-256-checked download. See update_controller.dart for the
/// screens around it, and backend/settings-service app_updates.py for the
/// endpoint.

/// One release as the endpoint describes it.
class ReleaseInfo {
  ReleaseInfo({
    required this.version,
    required this.versionCode,
    required this.downloadUrl,
    required this.sha256,
    this.size,
    this.forceUpdate = false,
    this.minSupportedVersionCode = 0,
    this.releaseNotes = '',
  });

  final String version;
  final int versionCode;
  final Uri downloadUrl;
  final String sha256;
  final int? size;
  final bool forceUpdate;
  final int minSupportedVersionCode;
  final String releaseNotes;

  static final _semver = RegExp(r'^\d+\.\d+\.\d+$');
  static final _hex64 = RegExp(r'^[0-9a-f]{64}$');

  /// Null when anything is missing or unsafe (not HTTPS, bad hash…): such a
  /// release is ignored rather than downloaded.
  static ReleaseInfo? fromJson(Object? j, {bool allowHttp = false}) {
    if (j is! Map) return null;
    final version = j['version'], code = j['version_code'], url = j['download_url'], sha = j['sha256'];
    if (version is! String || !_semver.hasMatch(version)) return null;
    if (code is! int || code <= 0) return null;
    if (sha is! String || !_hex64.hasMatch(sha.toLowerCase())) return null;
    final uri = url is String ? Uri.tryParse(url) : null;
    if (uri == null || !(uri.scheme == 'https' || (allowHttp && uri.scheme == 'http')) || uri.host.isEmpty) return null;
    final size = j['size'], min = j['min_supported_version_code'], notes = j['release_notes'];
    return ReleaseInfo(
      version: version,
      versionCode: code,
      downloadUrl: uri,
      sha256: sha.toLowerCase(),
      size: size is int && size > 0 ? size : null,
      forceUpdate: j['force_update'] == true,
      minSupportedVersionCode: min is int ? min : 0,
      releaseNotes: notes is String ? notes.trim() : '',
    );
  }

  Map<String, Object?> toJson() => {
        'version': version,
        'version_code': versionCode,
        'download_url': '$downloadUrl',
        'sha256': sha256,
        'size': size,
        'force_update': forceUpdate,
        'min_supported_version_code': minSupportedVersionCode,
        'release_notes': releaseNotes,
      };
}

enum UpdateKind { none, optional, required }

/// Only a higher versionCode is an update; "required" when the release is
/// forced or this install is below the minimum still supported.
UpdateKind decide(ReleaseInfo? release, int currentCode) {
  if (release == null || release.versionCode <= currentCode) return UpdateKind.none;
  if (release.forceUpdate || currentCode < release.minSupportedVersionCode) return UpdateKind.required;
  return UpdateKind.optional;
}

/// Small key/value storage (secure storage in the app, a map in tests).
abstract class UpdateStore {
  Future<String?> read(String key);
  Future<void> write(String key, String? value);
}

/// Asks the endpoint at most every [interval] (unless asked by hand), keeps
/// the last answer, and falls back to it when the server can't be reached.
class UpdateChecker {
  UpdateChecker({
    required this.endpoint,
    required this.store,
    http.Client? client,
    this.platform = 'android',
    this.interval = const Duration(hours: 6),
    this.timeout = const Duration(seconds: 10),
    this.allowHttp = false,
    DateTime Function()? now,
  })  : _client = client ?? http.Client(),
        _now = now ?? DateTime.now;

  final Uri endpoint;
  final UpdateStore store;
  final String platform;
  final Duration interval, timeout;
  final bool allowHttp;
  final http.Client _client;
  final DateTime Function() _now;

  static const _kCheckedAt = 'hgv_upd_checked_at', _kRelease = 'hgv_upd_release';

  /// The latest release, or null when there is none or nothing is known.
  /// Never throws: no network means "use what we knew".
  Future<ReleaseInfo?> latest({bool force = false}) async {
    final cached = await _cached();
    if (!force) {
      final at = DateTime.tryParse(await store.read(_kCheckedAt) ?? '');
      if (at != null && _now().difference(at) < interval) return cached;
    }
    try {
      final res = await _client
          .get(endpoint.replace(queryParameters: {...endpoint.queryParameters, 'platform': platform}),
              headers: {'Accept': 'application/json'})
          .timeout(timeout);
      if (res.statusCode == 404) {
        await _remember(null);
        return null;
      }
      if (res.statusCode != 200) return cached;
      final release = ReleaseInfo.fromJson(jsonDecode(utf8.decode(res.bodyBytes)), allowHttp: allowHttp);
      await _remember(release);
      return release;
    } catch (_) {
      return cached;
    }
  }

  Future<ReleaseInfo?> _cached() async {
    try {
      final raw = await store.read(_kRelease);
      return raw == null ? null : ReleaseInfo.fromJson(jsonDecode(raw), allowHttp: allowHttp);
    } catch (_) {
      return null;
    }
  }

  Future<void> _remember(ReleaseInfo? r) async {
    await store.write(_kRelease, r == null ? null : jsonEncode(r.toJson()));
    await store.write(_kCheckedAt, _now().toIso8601String());
  }
}

/// "Later" on an optional update: not asked again for that version for a day.
class Snooze {
  Snooze(this.store, {DateTime Function()? now, this.period = const Duration(hours: 24)}) : _now = now ?? DateTime.now;
  final UpdateStore store;
  final Duration period;
  final DateTime Function() _now;
  static const _k = 'hgv_upd_snooze';

  Future<void> snooze(int versionCode) => store.write(_k, '$versionCode|${_now().toIso8601String()}');

  Future<bool> isSnoozed(int versionCode) async {
    final parts = (await store.read(_k))?.split('|');
    if (parts == null || parts.length != 2 || parts[0] != '$versionCode') return false;
    final at = DateTime.tryParse(parts[1]);
    return at != null && _now().difference(at) < period;
  }
}

enum DownloadError { network, http, corrupt, cancelled, storage }

class UpdateDownloadException implements Exception {
  UpdateDownloadException(this.kind, [this.detail]);
  final DownloadError kind;
  final String? detail;
  @override
  String toString() => 'UpdateDownloadException($kind${detail == null ? '' : ': $detail'})';
}

/// Lets the person stop a download; the part already downloaded is kept so
/// "Try again" continues from there.
class CancelToken {
  bool _cancelled = false;
  final _listeners = <void Function()>[];
  bool get isCancelled => _cancelled;
  void cancel() {
    if (_cancelled) return;
    _cancelled = true;
    for (final l in List.of(_listeners)) {
      l();
    }
  }

  void _onCancel(void Function() f) => _listeners.add(f);
}

/// Downloads [release] into [dir] and returns the verified file.
///
/// * Resumes an interrupted download (HTTP Range) from `<name>.part`.
/// * Fails if nothing arrives for [stallTimeout] (dead or very slow network).
/// * Checks the size and SHA-256; a mismatch deletes the file and throws
///   [DownloadError.corrupt], so a damaged file is never installed.
/// * A file already downloaded and verified is reused without downloading.
Future<File> downloadRelease(
  ReleaseInfo release,
  Directory dir, {
  required String fileName,
  http.Client? client,
  CancelToken? cancel,
  void Function(int received, int? total)? onProgress,
  Duration stallTimeout = const Duration(seconds: 30),
}) async {
  final done = File('${dir.path}/$fileName');
  final part = File('${done.path}.part');
  try {
    await dir.create(recursive: true);
    if (await done.exists()) {
      if (await fileSha256(done) == release.sha256) return done;
      await done.delete();
    }
  } on FileSystemException catch (e) {
    throw UpdateDownloadException(DownloadError.storage, e.message);
  }

  final c = client ?? http.Client();
  cancel?._onCancel(c.close);
  try {
    var start = await part.exists() ? await part.length() : 0;
    if (release.size != null && start > release.size!) {
      await part.delete();
      start = 0;
    }
    if (release.size == null || start < release.size!) {
      final req = http.Request('GET', release.downloadUrl);
      if (start > 0) req.headers['Range'] = 'bytes=$start-';
      final http.StreamedResponse res;
      try {
        res = await c.send(req).timeout(stallTimeout);
      } on TimeoutException {
        throw UpdateDownloadException(DownloadError.network, 'no answer');
      }
      var append = false;
      if (res.statusCode == 206) {
        append = true;
      } else if (res.statusCode == 416 && start > 0) {
        // The part already holds the whole file; verify it below.
        append = true;
        await res.stream.drain<void>();
      } else if (res.statusCode == 200) {
        start = 0; // server ignored the Range: start over
      } else {
        await res.stream.drain<void>().catchError((_) {});
        throw UpdateDownloadException(DownloadError.http, 'HTTP ${res.statusCode}');
      }
      if (res.statusCode != 416) {
        final total = release.size ?? (res.contentLength == null ? null : start + res.contentLength!);
        final sink = part.openWrite(mode: append ? FileMode.append : FileMode.write);
        var received = start;
        onProgress?.call(received, total);
        try {
          await for (final chunk in res.stream.timeout(stallTimeout)) {
            if (cancel?.isCancelled ?? false) break;
            sink.add(chunk);
            received += chunk.length;
            onProgress?.call(received, total);
          }
        } finally {
          await sink.flush();
          await sink.close();
        }
      }
    }
    if (cancel?.isCancelled ?? false) throw UpdateDownloadException(DownloadError.cancelled);
    final length = await part.length();
    if (release.size != null && length < release.size!) {
      throw UpdateDownloadException(DownloadError.network, 'incomplete ($length of ${release.size})');
    }
    if (release.size != null && length != release.size || await fileSha256(part) != release.sha256) {
      await part.delete();
      throw UpdateDownloadException(DownloadError.corrupt);
    }
    return await part.rename(done.path);
  } on UpdateDownloadException {
    rethrow;
  } on FileSystemException catch (e) {
    throw UpdateDownloadException(DownloadError.storage, e.message);
  } catch (e) {
    if (cancel?.isCancelled ?? false) throw UpdateDownloadException(DownloadError.cancelled);
    throw UpdateDownloadException(DownloadError.network, '$e');
  } finally {
    if (client == null) c.close();
  }
}

/// SHA-256 of a file, computed off the UI thread.
Future<String> fileSha256(File f) {
  final path = f.path;
  return Isolate.run(() async => (await sha256.bind(File(path).openRead()).first).toString());
}
