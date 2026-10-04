import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../config.dart';
import '../session.dart';

/// Where the app stands with live updates.
enum LiveStatus { offline, connecting, live }

/// One change in the shop, as announced by the services
/// (backend/*/app/core/events.py): `sale.created`, `product.updated`…
/// The app also makes `resync` itself: events may have been missed (after a
/// reconnect), so screens should reload.
class LiveEvent {
  LiveEvent(this.type, {Map<String, dynamic>? data, DateTime? at, this.byId, this.byName})
      : data = data ?? const {},
        at = at ?? DateTime.now();

  factory LiveEvent.fromJson(Map<String, dynamic> j) {
    final by = j['by'] is Map ? j['by'] as Map : const {};
    return LiveEvent(
      '${j['type']}',
      data: j['data'] is Map ? Map<String, dynamic>.from(j['data'] as Map) : null,
      at: DateTime.tryParse('${j['at']}')?.toLocal(),
      byId: by['id']?.toString(),
      byName: by['name']?.toString(),
    );
  }

  final String type;
  final Map<String, dynamic> data;
  final DateTime at;
  final String? byId, byName;

  /// `sale`, `product`, `debt`, `expense`, `purchase` or `resync`.
  String get topic => type.split('.').first;
  bool get isResync => type == 'resync';
}

/// Someone from the business with the app or website open right now.
class Teammate {
  const Teammate(this.id, this.name, this.role);
  final String id, name, role;
}

/// Opens a WebSocket; replaceable in tests.
typedef SocketConnector = Future<WebSocket> Function(Uri url);

/// The live connection to the shop (sale-service's /ws, see
/// backend/sale-service/app/realtime.py). Connects while the app is open,
/// reconnects with growing pauses when the network drops, renews its token
/// with the session, and lets go of the socket in the background to save
/// battery — the screens reload when the app comes back.
class Live extends ChangeNotifier {
  Live(this.session, {SocketConnector? connect}) : _connector = connect ?? _defaultConnect;

  final Session session;
  final SocketConnector _connector;

  static Future<WebSocket> _defaultConnect(Uri url) =>
      WebSocket.connect(url.toString()).timeout(const Duration(seconds: 15));

  static Uri get url {
    final base = Uri.parse(apiBase);
    return base.replace(
      scheme: base.scheme == 'https' ? 'wss' : 'ws',
      path: '${base.path}${Svc.sales}/ws',
    );
  }

  LiveStatus status = LiveStatus.offline;

  /// Who is online in the business (this account included).
  List<Teammate> online = const [];

  final _events = StreamController<LiveEvent>.broadcast();
  Stream<LiveEvent> get events => _events.stream;

  WebSocket? _socket;
  StreamSubscription<dynamic>? _sub;
  Timer? _ping, _retry;
  bool _wanted = false, _connecting = false, _wasLive = false, _disposed = false;
  int _attempt = 0, _authFailures = 0;
  String? _sentToken;
  DateTime _lastHeard = DateTime.now();

  static const _pingEvery = Duration(seconds: 25);
  static const _silenceLimit = Duration(seconds: 65);

  /// Starts (or resumes) live updates.
  void start() {
    _wanted = true;
    _retry?.cancel();
    _connect();
  }

  /// Lets go of the connection (app in the background).
  void pause() {
    _wanted = false;
    _retry?.cancel();
    _drop();
    _set(LiveStatus.offline);
  }

  Future<void> _connect() async {
    if (!_wanted || _disposed || _socket != null || _connecting) return;
    final token = session.accessToken;
    if (token == null) return;
    _connecting = true;
    _set(LiveStatus.connecting);
    try {
      final ws = await _connector(url);
      _connecting = false;
      if (!_wanted || _disposed) {
        unawaited(ws.close());
        return;
      }
      _socket = ws;
      ws.pingInterval = const Duration(seconds: 20);
      _lastHeard = DateTime.now();
      _sub = ws.listen(
        _onMessage,
        onDone: () => _onClosed(ws, ws.closeCode),
        onError: (_) => _onClosed(ws, null),
        cancelOnError: true,
      );
      _send({'type': 'auth', 'token': token});
      _sentToken = token;
      _ping = Timer.periodic(_pingEvery, (_) => _tick());
    } catch (_) {
      _connecting = false;
      _set(LiveStatus.offline);
      _scheduleRetry();
    }
  }

  void _tick() {
    if (DateTime.now().difference(_lastHeard) > _silenceLimit) {
      // Nothing heard for a while: the connection is dead even if the phone
      // hasn't noticed. Start over.
      final ws = _socket;
      if (ws != null) _onClosed(ws, null);
      return;
    }
    // The session renews its token on its own; pass the new one along so
    // the server keeps this connection open past the old token's expiry.
    final token = session.accessToken;
    if (token != null && token != _sentToken) {
      _send({'type': 'auth', 'token': token});
      _sentToken = token;
    }
    _send({'type': 'ping'});
  }

  void _send(Map<String, Object?> msg) {
    try {
      _socket?.add(jsonEncode(msg));
    } catch (_) {}
  }

  void _onMessage(dynamic raw) {
    _lastHeard = DateTime.now();
    if (raw is! String) return;
    final Map<String, dynamic> msg;
    try {
      msg = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return;
    }
    switch (msg['type']) {
      case 'hello':
        _attempt = 0;
        _authFailures = 0;
        online = _teammates(msg['online']);
        // Back after a drop: whatever happened meanwhile was missed.
        if (_wasLive) _events.add(LiveEvent('resync'));
        _wasLive = true;
        _set(LiveStatus.live, force: true);
      case 'presence':
        online = _teammates(msg['online']);
        if (!_disposed) notifyListeners();
      case 'pong':
        break;
      case 'resync':
        _events.add(LiveEvent('resync'));
      default:
        if (msg['type'] is String) _events.add(LiveEvent.fromJson(msg));
    }
  }

  static List<Teammate> _teammates(dynamic list) => list is List
      ? [
          for (final u in list.whereType<Map>())
            Teammate('${u['id'] ?? ''}', '${u['name'] ?? ''}'.trim(), '${u['role'] ?? ''}'),
        ]
      : const [];

  void _onClosed(WebSocket ws, int? code) {
    if (!identical(ws, _socket)) return;
    _drop();
    online = const [];
    _set(LiveStatus.offline, force: true);
    if (!_wanted || _disposed) return;
    if (code == 4003) return; // an account without a business: nothing to follow
    if (code == 4001 && _authFailures++ < 2) {
      // Token expired: renew it, then come straight back.
      session.refresh().then((ok) {
        if (ok) {
          _connect();
        } else {
          _scheduleRetry();
        }
      });
      return;
    }
    _scheduleRetry();
  }

  /// 1 s, 2 s, 4 s… up to 30 s, with some jitter so phones don't all
  /// reconnect at the same instant after a server restart.
  void _scheduleRetry() {
    if (!_wanted || _disposed) return;
    _retry?.cancel();
    final secs = math.min(30, 1 << math.min(_attempt, 5));
    _attempt++;
    final jitter = math.Random().nextInt(700);
    _retry = Timer(Duration(milliseconds: secs * 1000 + jitter), _connect);
  }

  void _drop() {
    _ping?.cancel();
    _ping = null;
    _sub?.cancel();
    _sub = null;
    final ws = _socket;
    _socket = null;
    if (ws != null) unawaited(ws.close(WebSocketStatus.normalClosure).catchError((_) {}));
  }

  void _set(LiveStatus s, {bool force = false}) {
    if (_disposed || (status == s && !force)) return;
    status = s;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _wanted = false;
    _retry?.cancel();
    _drop();
    _events.close();
    super.dispose();
  }
}

/// Makes the live connection available below the signed-in shell.
class LiveScope extends InheritedNotifier<Live> {
  const LiveScope({super.key, required Live live, required super.child}) : super(notifier: live);

  /// Rebuilds the caller when the status or who is online changes.
  static Live? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<LiveScope>()?.notifier;

  /// Without rebuilding — for subscribing to [Live.events].
  static Live? read(BuildContext context) => context.getInheritedWidgetOfExactType<LiveScope>()?.notifier;
}

/// For screens that react to live events: subscribes once the screen is in
/// place, and lets go with it. Screens implement [onLive].
mixin LiveListener<W extends StatefulWidget> on State<W> {
  StreamSubscription<LiveEvent>? _liveSub;

  void onLive(LiveEvent event);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _liveSub ??= LiveScope.read(context)?.events.listen((e) {
      if (mounted) onLive(e);
    });
  }

  @override
  void dispose() {
    _liveSub?.cancel();
    super.dispose();
  }
}

/// Runs [action] once things have been quiet for [delay] — several events
/// in a burst cause a single reload.
class Debouncer {
  Debouncer(this.delay);
  final Duration delay;
  Timer? _t;

  void call(VoidCallback action) {
    _t?.cancel();
    _t = Timer(delay, action);
  }

  void dispose() => _t?.cancel();
}
