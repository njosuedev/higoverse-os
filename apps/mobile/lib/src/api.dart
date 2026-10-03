import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;

  @override
  String toString() => message;
}

/// What the client needs from the session: the current token, a way to
/// renew it, and a way to end the session when renewal is impossible.
abstract class TokenSource {
  String? get accessToken;
  Future<bool> refresh();
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
      throw ApiException(0, 'The server took too long to answer. Check your connection and try again.');
    } catch (_) {
      throw ApiException(0, 'No connection to Higoverse. Check your internet and try again.');
    }

    if (res.statusCode == 401 && token != null && !retried) {
      if (await tokens.refresh()) return _send(method, url, body: body, retried: true);
      await tokens.expire();
      throw ApiException(401, 'Your session has ended. Please sign in again.');
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
    var message = 'Something went wrong (${res.statusCode}). Please try again.';
    if (data is Map && data['detail'] != null) {
      final d = data['detail'];
      message = d is String ? d : (d is List && d.isNotEmpty && d.first is Map ? '${d.first['msg']}' : message);
    }
    throw ApiException(res.statusCode, message);
  }
}
