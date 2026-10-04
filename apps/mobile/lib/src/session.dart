import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'api.dart';
import 'config.dart';

class User {
  User({required this.id, required this.name, required this.email, required this.role, this.shopId});

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: '${j['id'] ?? ''}',
        name: '${j['name'] ?? ''}',
        email: '${j['email'] ?? ''}',
        role: '${j['role'] ?? ''}',
        shopId: j['shop_id']?.toString(),
      );

  final String id, name, email, role;
  final String? shopId;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'email': email, 'role': role, 'shop_id': shopId};
}

class Shop {
  Shop({required this.id, required this.name, required this.layout});

  factory Shop.fromJson(Map<String, dynamic> j) =>
      Shop(id: '${j['id'] ?? ''}', name: '${j['name'] ?? ''}', layout: '${j['layout'] ?? 'retail'}');

  final String id, name, layout;
}

/// The signed-in account: tokens, user, shop and shop settings.
/// Same rules as the website — see apps/web/lib/session.ts and permissions.ts.
class Session extends ChangeNotifier implements TokenSource {
  Session({FlutterSecureStorage? storage}) : _store = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _store;
  late final Api api = Api(this);

  /// Bumped when the app comes back to the foreground: screens reload their data.
  final refreshTick = ValueNotifier<int>(0);

  @override
  String? accessToken;
  String? _refreshToken;
  User? user;
  Shop? shop;
  String currency = 'RWF';
  int lowStock = 10;

  /// Language saved on the account (website settings); used until a language
  /// is picked on this phone.
  String? accountLanguage;

  bool get signedIn => accessToken != null && user != null;
  bool get isCar => shop?.layout == 'car';

  /// Car companies keep money figures from their staff; owners and admins
  /// (and every other kind of business) see them. Mirrors hides_financials().
  bool get canSeeFinancials => const {'owner', 'admin'}.contains(user?.role) || !isCar;

  static const _kAccess = 'hgv_access', _kRefresh = 'hgv_refresh', _kUser = 'hgv_user';

  /// Picks up a session saved on this phone. Returns false when there is none
  /// or it can no longer be renewed.
  Future<bool> restore() async {
    try {
      accessToken = await _store.read(key: _kAccess);
      _refreshToken = await _store.read(key: _kRefresh);
      final u = await _store.read(key: _kUser);
      user = u == null ? null : User.fromJson(jsonDecode(u) as Map<String, dynamic>);
    } catch (_) {
      await _clear();
      return false;
    }
    if (!signedIn) return false;
    try {
      await loadAccount();
      return signedIn;
    } catch (_) {
      return signedIn;
    }
  }

  Future<void> login(String email, String password) async {
    final res = await http
        .post(Uri.parse('$apiBase${Svc.auth}/api/v1/auth/login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email.trim(), 'password': password}))
        .timeout(const Duration(seconds: 20))
        .catchError((_) => throw ApiException(0, 'No connection to Higoverse. Check your internet and try again.', key: 'err.network'));
    final data = Api.decode(res) as Map<String, dynamic>;
    // A new session starts clean: nothing from a previous account remains.
    await _clear();
    await _save(data);
    await loadAccount();
    notifyListeners();
  }

  /// Shop (for its layout) and shop settings (currency, low-stock level, language).
  Future<void> loadAccount() async {
    final results = await Future.wait([
      api.get('${Svc.auth}/api/v1/shop').catchError((_) => null),
      api.get('${Svc.settings}/settings').catchError((_) => null),
    ]);
    final s = results[0];
    if (s is Map && s['data'] is Map) shop = Shop.fromJson(Map<String, dynamic>.from(s['data'] as Map));
    final st = results[1];
    if (st is Map && st['data'] is Map) {
      final d = st['data'] as Map;
      currency = (d['currency'] as String?)?.trim().isNotEmpty == true ? d['currency'] as String : 'RWF';
      lowStock = int.tryParse('${d['low_stock_threshold']}') ?? 10;
      accountLanguage = d['language'] as String?;
    }
    notifyListeners();
  }

  Completer<bool>? _refreshing;

  /// Renews the access token with the (single-use, rotating) refresh token.
  /// Concurrent callers share one renewal.
  @override
  Future<bool> refresh() {
    if (_refreshing != null) return _refreshing!.future;
    final c = _refreshing = Completer<bool>();
    () async {
      try {
        final rt = _refreshToken;
        if (rt == null) return c.complete(false);
        final res = await http
            .post(Uri.parse('$apiBase${Svc.auth}/api/v1/auth/refresh'),
                headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refresh_token': rt}))
            .timeout(const Duration(seconds: 20));
        if (res.statusCode != 200) return c.complete(false);
        await _save(Api.decode(res) as Map<String, dynamic>);
        c.complete(true);
      } catch (_) {
        c.complete(false);
      } finally {
        _refreshing = null;
      }
    }();
    return c.future;
  }

  @override
  Future<void> expire() async {
    await _clear();
    notifyListeners();
  }

  /// Signs out: revokes the refresh token (best effort) and removes this
  /// account's data from the phone.
  Future<void> logout() async {
    final rt = _refreshToken;
    if (rt != null) {
      unawaited(http
          .post(Uri.parse('$apiBase${Svc.auth}/api/v1/auth/logout'),
              headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refresh_token': rt}))
          .timeout(const Duration(seconds: 10))
          .then((_) {}, onError: (_) {}));
    }
    await _clear();
    notifyListeners();
  }

  Future<void> _save(Map<String, dynamic> data) async {
    accessToken = data['access_token'] as String?;
    _refreshToken = (data['refresh_token'] as String?) ?? _refreshToken;
    if (data['user'] is Map) user = User.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    try {
      await _store.write(key: _kAccess, value: accessToken);
      await _store.write(key: _kRefresh, value: _refreshToken);
      await _store.write(key: _kUser, value: user == null ? null : jsonEncode(user!.toJson()));
    } catch (_) {/* storage unavailable: the session still works until the app closes */}
  }

  Future<void> _clear() async {
    accessToken = null;
    _refreshToken = null;
    user = null;
    shop = null;
    currency = 'RWF';
    lowStock = 10;
    accountLanguage = null;
    try {
      // Only this account's keys: device preferences (appearance) stay.
      for (final k in const [_kAccess, _kRefresh, _kUser]) {
        await _store.delete(key: k);
      }
    } catch (_) {}
  }
}

/// Makes the session available to every screen.
class SessionScope extends InheritedNotifier<Session> {
  const SessionScope({super.key, required Session session, required super.child}) : super(notifier: session);

  static Session of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SessionScope>()!.notifier!;
}
