import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

import '../config.dart';
import '../live/live.dart';
import '../session.dart';
import 'crypto.dart';

/// Someone of the business (from the account service's team list).
class Member {
  Member({required this.id, required this.name, required this.role, required this.active});
  factory Member.fromJson(Map j) => Member(
        id: '${j['id']}',
        name: '${j['name'] ?? j['email'] ?? ''}',
        role: '${j['role'] ?? ''}',
        active: j['is_active'] != false,
      );
  final String id, name, role;
  final bool active;
}

/// One message, already decrypted on this device ([text] null: it can't be
/// read here — sent before this device was set up).
class ChatMessage {
  ChatMessage({required this.id, required this.from, required this.to, required this.text, required this.at, this.readAt, this.pending = false});
  final String id, from, to;
  final String? text;
  final DateTime at;
  DateTime? readAt;

  /// Still being sent from this phone.
  bool pending;
}

/// The person-to-person conversations of this account, end-to-end
/// encrypted (see crypto.dart). One per session; screens listen to it.
class ChatService extends ChangeNotifier {
  ChatService._(this._s);
  final Session _s;
  static final _of = Expando<ChatService>();
  static ChatService of(Session s) => _of[s] ??= ChatService._(s);

  ChatDevice? _device;
  Future<void>? _ready;
  StreamSubscription<LiveEvent>? _liveSub;
  Live? _live;
  String? _owner;

  void _reset() {
    _device = null;
    _ready = null;
    members = const [];
    threads.clear();
    unread.clear();
    openWith = null;
    error = null;
  }

  List<Member> members = const [];
  int maxEmployees = 3, employees = 0;
  bool canManage = false;

  /// Other person's id → their conversation, newest last.
  final Map<String, List<ChatMessage>> threads = {};

  /// Other person's id → unread messages from them.
  final Map<String, int> unread = {};

  /// The person whose conversation is open on screen (their messages are read at once).
  String? openWith;
  Object? error;

  String get me => _s.user?.id ?? '';
  int get unreadTotal => unread.values.fold(0, (a, b) => a + b);
  List<Member> get others => members.where((m) => m.id != me).toList();

  /// Sets up this device (key pair, registered public key), loads the team
  /// and conversations, and follows live messages. Safe to call often.
  Future<void> start(Live? live) {
    // Another account signed in on this phone: nothing of the last one stays.
    if (_owner != null && _owner != me) _reset();
    _owner = me;
    if (live != null && !identical(live, _live)) {
      _liveSub?.cancel();
      _live = live;
      _liveSub = live.events.listen(_onLive);
    }
    return _ready ??= _setup().catchError((Object e) {
      error = e;
      _ready = null;
      notifyListeners();
    });
  }

  Future<void> _setup() async {
    final d = _device ??= await ChatDevice.load(me);
    await _s.api.put('${Svc.sales}/chat/devices', {
      'id': d.id,
      'public_key': d.publicKey,
      'label': kIsWeb ? 'Web' : (Platform.isIOS ? 'iPhone' : 'Android'),
    });
    await Future.wait([loadTeam(), loadConversations()]);
    error = null;
  }

  Future<void> loadTeam() async {
    final res = await _s.api.get('${Svc.auth}/api/v1/team');
    final d = (res as Map)['data'] as Map? ?? {};
    members = [for (final m in (d['members'] as List? ?? [])) if (m is Map) Member.fromJson(m)];
    maxEmployees = (d['max_employees'] as num? ?? 3).toInt();
    employees = (d['employees'] as num? ?? 0).toInt();
    canManage = d['can_manage'] == true;
    notifyListeners();
  }

  Future<void> loadConversations() async {
    final d = _device;
    if (d == null) return;
    final res = await _s.api.get('${Svc.sales}/chat/conversations', query: {'device_id': d.id});
    for (final c in ((res as Map)['data'] as List? ?? [])) {
      if (c is! Map) continue;
      final other = '${c['user_id']}';
      final m = await _decrypt(Map<String, dynamic>.from(c['last'] as Map));
      final t = threads[other] ??= [];
      if (!t.any((x) => x.id == m.id)) t.add(m);
      t.sort((a, b) => a.at.compareTo(b.at));
      unread[other] = (c['unread'] as num? ?? 0).toInt();
    }
    notifyListeners();
  }

  /// The latest messages with [other] (and older ones with [older]).
  Future<bool> loadThread(String other, {bool older = false}) async {
    final d = _device;
    if (d == null) return false;
    final t = threads[other] ??= [];
    final q = {'with': other, 'device_id': d.id, 'limit': '40'};
    if (older && t.isNotEmpty) q['before'] = t.first.at.toUtc().toIso8601String();
    final res = await _s.api.get('${Svc.sales}/chat/messages', query: q);
    final list = ((res as Map)['data'] as List? ?? []).whereType<Map>().toList();
    for (final raw in list) {
      final m = await _decrypt(Map<String, dynamic>.from(raw));
      final i = t.indexWhere((x) => x.id == m.id);
      if (i < 0) {
        t.add(m);
      } else {
        t[i] = m;
      }
    }
    t.sort((a, b) => a.at.compareTo(b.at));
    notifyListeners();
    return list.length >= 40;
  }

  Future<ChatMessage> _decrypt(Map<String, dynamic> m, {Map? keys}) async {
    final d = _device!;
    final k = (keys?[d.id] ?? m['key']) as Map?;
    String? text;
    if (k != null && m['sender_public_key'] != null) {
      text = await d.open(
        ciphertext: '${m['ciphertext']}',
        nonce: '${m['nonce']}',
        wrapped: '${k['wrapped']}',
        wrapNonce: '${k['nonce']}',
        senderDeviceId: '${m['sender_device_id']}',
        senderPublicKey: '${m['sender_public_key']}',
        senderId: '${m['sender_id']}',
        recipientId: '${m['recipient_id']}',
      );
    }
    return ChatMessage(
      id: '${m['id']}',
      from: '${m['sender_id']}',
      to: '${m['recipient_id']}',
      text: text,
      at: DateTime.tryParse('${m['created_at']}')?.toLocal() ?? DateTime.now(),
      readAt: DateTime.tryParse('${m['read_at']}')?.toLocal(),
    );
  }

  /// Every device of both people right now (a device added since is included).
  Future<Map<String, String>> _devicesOf(String other) async {
    final res = await _s.api.get('${Svc.sales}/chat/devices', query: {'users': '$me,$other'});
    return {
      for (final d in ((res as Map)['data'] as List? ?? []))
        if (d is Map) '${d['id']}': '${d['public_key']}',
    };
  }

  /// The people's device keys, for the security code.
  Future<List<String>> keysWith(String other) async => (await _devicesOf(other)).values.toList();

  Future<void> send(String other, String text) async {
    final d = _device ?? (throw StateError('Messages are not set up on this device yet.'));
    final clean = text.trim();
    if (clean.isEmpty) return;
    final temp = ChatMessage(id: 'tmp-${DateTime.now().microsecondsSinceEpoch}', from: me, to: other, text: clean, at: DateTime.now(), pending: true);
    (threads[other] ??= []).add(temp);
    notifyListeners();
    try {
      final sealed = await d.seal(clean, senderId: me, recipientId: other, devices: await _devicesOf(other));
      final res = await _s.api.post('${Svc.sales}/chat/messages', {
        'recipient_id': other,
        'device_id': d.id,
        'ciphertext': sealed.ciphertext,
        'nonce': sealed.nonce,
        'keys': [for (final k in sealed.keys.entries) {'device_id': k.key, 'wrapped': k.value.wrapped, 'nonce': k.value.nonce}],
      });
      final saved = Map<String, dynamic>.from((res as Map)['data'] as Map);
      final t = threads[other]!;
      t.remove(temp);
      if (!t.any((x) => x.id == saved['id'])) {
        t.add(ChatMessage(id: '${saved['id']}', from: me, to: other, text: clean,
            at: DateTime.tryParse('${saved['created_at']}')?.toLocal() ?? temp.at));
      }
      t.sort((a, b) => a.at.compareTo(b.at));
    } catch (_) {
      threads[other]?.remove(temp);
      notifyListeners();
      rethrow;
    }
    notifyListeners();
  }

  Future<void> markRead(String other) async {
    if ((unread[other] ?? 0) == 0) return;
    unread[other] = 0;
    notifyListeners();
    try {
      await _s.api.post('${Svc.sales}/chat/read', {'with': other});
    } catch (_) {}
  }

  Future<void> _onLive(LiveEvent e) async {
    if (e.isResync) {
      if (_device != null) unawaited(loadConversations());
      return;
    }
    if (_device == null) return;
    if (e.type == 'chat.message') {
      final m = e.data;
      if (m['ciphertext'] == null) {
        // Too big to come live: fetch the conversation.
        final other = '${m['sender_id']}' == me ? '${m['recipient_id']}' : '${m['sender_id']}';
        unawaited(loadThread(other));
        return;
      }
      final msg = await _decrypt(m, keys: m['keys'] as Map?);
      final other = msg.from == me ? msg.to : msg.from;
      final t = threads[other] ??= [];
      if (t.any((x) => x.id == msg.id)) return;
      // Our own message sent from this phone is already there (pending → saved).
      if (msg.from == me && t.any((x) => x.pending && x.text == msg.text)) return;
      t.add(msg);
      t.sort((a, b) => a.at.compareTo(b.at));
      if (msg.from != me) {
        if (openWith == other) {
          unawaited(markReadNow(other));
        } else {
          unread[other] = (unread[other] ?? 0) + 1;
        }
      }
      notifyListeners();
    } else if (e.type == 'chat.read') {
      final by = '${e.data['by']}', with_ = '${e.data['with']}';
      final at = DateTime.tryParse('${e.data['at']}')?.toLocal() ?? DateTime.now();
      if (by == me) {
        unread[with_] = 0; // read on another of my devices
      } else {
        for (final m in threads[by] ?? const <ChatMessage>[]) {
          if (m.from == me) m.readAt ??= at;
        }
      }
      notifyListeners();
    }
  }

  Future<void> markReadNow(String other) async {
    unread[other] = 0;
    try {
      await _s.api.post('${Svc.sales}/chat/read', {'with': other});
    } catch (_) {}
  }

  // ── Team (owner / admin) ────────────────────────────────────────────────
  Future<void> addEmployee({required String name, required String email, required String password, required String role}) async {
    await _s.api.post('${Svc.auth}/api/v1/team', {'name': name, 'email': email, 'password': password, 'role': role});
    await loadTeam();
  }

  Future<void> setEmployee(String id, {bool? active, String? role}) async {
    await _s.api.patch('${Svc.auth}/api/v1/team/$id', {if (active != null) 'is_active': active, if (role != null) 'role': role});
    await loadTeam();
  }

  Future<void> removeEmployee(String id) async {
    await _s.api.delete('${Svc.auth}/api/v1/team/$id');
    await loadTeam();
  }

  @override
  void dispose() {
    _liveSub?.cancel();
    super.dispose();
  }
}
