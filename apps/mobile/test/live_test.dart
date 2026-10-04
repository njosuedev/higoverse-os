import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/app_settings.dart';
import 'package:higoverse_inventory_mobile/src/format.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/live/activity.dart';
import 'package:higoverse_inventory_mobile/src/live/live.dart';
import 'package:higoverse_inventory_mobile/src/screens/activity_screen.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';

LiveEvent _ev(String type, Map<String, dynamic> data, {String by = 'Alice'}) =>
    LiveEvent(type, data: data, byId: 'u1', byName: by, at: DateTime(2026, 10, 4, 12));

void main() {
  group('activity entries from live events', () {
    ActivityItem? make(LiveEvent e) => ActivityFeed.fromEvent(e, lowStock: 10);

    test('a sale says who sold what', () {
      final i = make(_ev('sale.created', {'id': 's1', 'product_name': 'Soap', 'quantity': 2, 'total_amount': 3000}))!;
      expect(i.kind, ActivityKind.sale);
      expect(i.by, 'Alice');
      expect(activityText(const T('en'), i), 'Alice sold 2 × Soap');
      expect(activityText(const T('fr'), i), 'Alice a vendu 2 × Soap');
      expect(i.data['created_at'], isNotNull, reason: 'the event time stands in until the database sets it');
    });

    test('stock alerts only when the level is crossed', () {
      ActivityKind? kind(num prev, num q) =>
          make(_ev('product.updated', {'id': 'p', 'name': 'Rice', 'quantity': q, 'prev_quantity': prev}))?.kind;
      expect(kind(12, 8), ActivityKind.lowStock);
      expect(kind(3, 0), ActivityKind.outOfStock);
      expect(kind(2, 40), ActivityKind.restocked);
      expect(kind(8, 7), isNull, reason: 'already low: no new alert for every sale');
      expect(kind(50, 49), isNull);
      // Price edits (no quantity change info) are not activity.
      expect(make(_ev('product.updated', {'id': 'p', 'name': 'Rice'})), isNull);
    });

    test('stock alerts are not credited to a person', () {
      final i = make(_ev('product.updated', {'id': 'p', 'name': 'Rice', 'quantity': 0, 'prev_quantity': 1}))!;
      expect(i.by, isNull);
      expect(activityText(const T('en'), i), 'Rice is out of stock');
    });

    test('debts: payment vs paid in full', () {
      expect(make(_ev('debt.updated', {'debtor_name': 'Jo', 'is_paid': false, 'balance': 500}))!.kind, ActivityKind.debtPayment);
      expect(make(_ev('debt.updated', {'debtor_name': 'Jo', 'is_paid': true, 'balance': 0}))!.kind, ActivityKind.debtPaid);
    });

    test('unknown events are ignored', () {
      expect(make(_ev('shop.renamed', {})), isNull);
    });
  });

  test('time helpers', () {
    final now = DateTime(2026, 10, 4, 12);
    expect(shortAgo(now.subtract(const Duration(seconds: 20)), now), (0, 'now'));
    expect(shortAgo(now.subtract(const Duration(minutes: 5)), now), (5, 'm'));
    expect(shortAgo(now.subtract(const Duration(hours: 3)), now), (3, 'h'));
    expect(shortAgo(now.subtract(const Duration(days: 2)), now), (2, 'd'));
    expect(daysAgo(DateTime(2026, 10, 3, 23, 59), now), 1);
    expect(percentChange(150, 100), 50);
    expect(percentChange(5, 0), isNull);
    expect(const T('en').date(DateTime(2026, 10, 3)), '3 Oct');
    expect(const T('zh').date(DateTime(2026, 10, 3)), '10月3日');
    expect(const T('fr').weekday(DateTime(2026, 10, 4).weekday), 'dim.');
  });

  group('live connection', () {
    late HttpServer server;
    late List<WebSocket> sockets;
    late List<Map<String, dynamic>> received;

    setUp(() async {
      sockets = [];
      received = [];
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.transform(WebSocketTransformer()).listen((ws) {
        sockets.add(ws);
        ws.listen((m) {
          final msg = Map<String, dynamic>.from(jsonDecode(m as String) as Map);
          received.add(msg);
          if (msg['type'] == 'auth') {
            ws.add(jsonEncode({
              'type': 'hello',
              'online': [
                {'id': 'u1', 'name': 'Alice', 'role': 'owner'},
                {'id': 'u2', 'name': 'Bob', 'role': 'cashier'},
              ],
            }));
          }
        });
      });
    });

    tearDown(() => server.close(force: true));

    Future<void> until(bool Function() ok) async {
      for (var i = 0; i < 100 && !ok(); i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(ok(), isTrue);
    }

    test('authenticates, goes live, forwards events, and resyncs after a drop', () async {
      final session = Session()..accessToken = 'token-1';
      final live = Live(session, connect: (_) => WebSocket.connect('ws://127.0.0.1:${server.port}'));
      final events = <LiveEvent>[];
      final sub = live.events.listen(events.add);

      live.start();
      await until(() => live.status == LiveStatus.live);
      expect(received.first, {'type': 'auth', 'token': 'token-1'});
      expect(live.online.map((u) => u.name), ['Alice', 'Bob']);

      sockets.last.add(jsonEncode({
        'type': 'sale.created',
        'at': '2026-10-04T10:00:00+00:00',
        'by': {'id': 'u2', 'name': 'Bob'},
        'data': {'id': 's9', 'product_name': 'Milk'},
      }));
      await until(() => events.isNotEmpty);
      expect(events.single.type, 'sale.created');
      expect(events.single.byName, 'Bob');
      expect(events.single.data['product_name'], 'Milk');

      // The server goes away: the app reconnects by itself and, since it may
      // have missed something, tells the screens to reload.
      await sockets.last.close();
      await until(() => live.status != LiveStatus.live);
      await until(() => sockets.length == 2 && live.status == LiveStatus.live);
      await until(() => events.any((e) => e.isResync));

      live.pause();
      expect(live.status, LiveStatus.offline);
      await sub.cancel();
      live.dispose();
    });
  });

  testWidgets('activity screen lists entries with an unread dot', (tester) async {
    final session = Session();
    final feed = ActivityFeed(session);
    feed.add(_ev('sale.created', {'id': 's1', 'product_name': 'Soap', 'quantity': 1, 'total_amount': 1500}, by: 'Bob Kay'));
    await tester.pumpWidget(AppSettingsScope(
      settings: AppSettings(),
      child: SessionScope(
        session: session,
        child: MaterialApp(
          theme: buildTheme(Brightness.light),
          builder: (context, c) => LangScope(lang: 'en', child: c!),
          home: FeedScope(feed: feed, child: const ActivityScreen(visible: false)),
        ),
      ),
    ));
    expect(find.text('Bob Kay sold 1 × Soap'), findsOneWidget);
    expect(find.text('BK'), findsOneWidget);
    expect(feed.unread, 1);
  });
}
