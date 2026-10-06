import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.key, this.args = const {}, this.detail});
  final int status;

  /// The server's structured `detail`, when it sent one (e.g. a duplicate
  /// car: {field, product_id, product_name, message}).
  final Map<String, dynamic>? detail;

  /// The server's own message, or the English text of [key].
  final String message;

  /// Set for messages written by the app (not the server), so screens can
  /// show them in the app's language: see i18n.dart.
  final String? key;
  final Map<String, Object?> args;

  @override
  String toString() => message;
}

/// How an attempt to renew the access token went.
enum Renewal {
  renewed,

  /// The server refused the refresh token (signed out elsewhere, account or
  /// business deactivated): the session is over.
  rejected,

  /// No answer — offline, timeout, server restarting. The session stays;
  /// renewal is tried again on the next request.
  unavailable,
}

/// What the client needs from the session: the current token, a way to
/// renew it, and a way to end the session when renewal is refused.
abstract class TokenSource {
  String? get accessToken;
  Future<Renewal> refresh();
  Future<void> expire();
}

/// JSON client for the Higoverse services. Adds the bearer token, renews it
/// once on a 401 and retries, and turns error bodies into readable messages.
class Api {
  Api(this.tokens, {http.Client? client}) : _http = client ?? http.Client();

  final TokenSource tokens;
  final http.Client _http;
  static const _timeout = Duration(seconds: 20);

  Uri uri(String path, [Map<String, String>? query]) {
    final u = Uri.parse('$apiBase$path');
    return query == null ? u : u.replace(queryParameters: {...u.queryParameters, ...query});
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _send('GET', uri(path, query));

  Future<dynamic> post(String path, Object? body) => _send('POST', uri(path), body: body);

  Future<dynamic> put(String path, Object? body) => _send('PUT', uri(path), body: body);

  Future<dynamic> patch(String path, Object? body) => _send('PATCH', uri(path), body: body);

  Future<dynamic> delete(String path) => _send('DELETE', uri(path));

  Future<dynamic> _send(String method, Uri url, {Object? body, bool retried = false}) async {
    final headers = <String, String>{'Accept': 'application/json'};
    if (body != null) headers['Content-Type'] = 'application/json';
    final token = tokens.accessToken;
    if (token != null) headers['Authorization'] = 'Bearer $token';

    final req = http.Request(method, url)..headers.addAll(headers);
    if (body != null) req.body = jsonEncode(body);

    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(_timeout));
    } on TimeoutException {
      throw ApiException(0, 'The server took too long to answer. Check your connection and try again.', key: 'err.timeout');
    } catch (_) {
      throw ApiException(0, 'No connection to Higoverse. Check your internet and try again.', key: 'err.network');
    }

    if (res.statusCode == 401 && token != null && !retried) {
      switch (await tokens.refresh()) {
        case Renewal.renewed:
          return _send(method, url, body: body, retried: true);
        case Renewal.rejected:
          await tokens.expire();
          throw ApiException(401, 'Your session has ended. Please sign in again.', key: 'err.session');
        case Renewal.unavailable:
          // Stay signed in: a slow or dropped connection must not end the session.
          throw ApiException(0, 'No connection to Higoverse. Check your internet and try again.', key: 'err.network');
      }
    }
    return decode(res);
  }

  /// Parses a response body, raising [ApiException] with the server's
  /// `detail` message for non-2xx responses.
  static dynamic decode(http.Response res) {
    dynamic data;
    try {
      data = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      data = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    final generic = 'Something went wrong (${res.statusCode}). Please try again.';
    final d = data is Map ? data['detail'] : null;
    final detail = d is String ? d : (d is List && d.isNotEmpty && d.first is Map ? '${d.first['msg']}' : null);
    if (detail != null) throw ApiException(res.statusCode, detail);
    if (d is Map) throw ApiException(res.statusCode, '${d['message'] ?? generic}', detail: Map<String, dynamic>.from(d));
    throw ApiException(res.statusCode, generic, key: 'err.generic', args: {'code': res.statusCode});
  }
}
