import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/loading.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Client _shopIs(String layout) => MockClient((req) async {
      if (req.url.path.endsWith('/shop')) return http.Response(jsonEncode({'data': {'id': 's1', 'name': 'Shop', 'layout': layout}}), 200);
      return http.Response(jsonEncode({'data': {}}), 200);
    });

const _user = '{"id":"u1","name":"Ana","email":"ana@x.rw","role":"owner"}';

Widget _app(Widget child, [Session? session]) => SessionScope(
      session: session ?? Session(client: _shopIs('car')),
      child: MaterialApp(theme: buildTheme(Brightness.light), home: Scaffold(body: SingleChildScrollView(child: child))),
    );

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('the layout is remembered on the phone for the next start', () async {
    final s = Session(client: _shopIs('retail'))
      ..accessToken = 'a'
      ..user = User(id: 'u1', name: 'Ana', email: 'ana@x.rw', role: 'owner');
    await s.loadAccount();
    expect(await const FlutterSecureStorage().read(key: 'hgv_layout'), 'retail');

    // Next start: known as a shop before the shop has loaded.
    FlutterSecureStorage.setMockInitialValues({'hgv_access': 'a', 'hgv_user': _user, 'hgv_layout': 'retail'});
    final next = Session(client: MockClient((_) async => throw http.ClientException('offline')));
    await next.restore();
    expect(next.shop, isNull);
    expect(next.looksCar, isFalse);
  });

  test('a phone that never saw the shop draws the car layout', () {
    expect(Session().looksCar, isTrue);
  });

  test('signing out forgets the layout', () async {
    FlutterSecureStorage.setMockInitialValues({'hgv_access': 'a', 'hgv_user': _user, 'hgv_layout': 'retail'});
    final s = Session(client: MockClient((_) async => throw http.ClientException('offline')));
    await s.restore();
    await s.logout();
    expect(s.looksCar, isTrue);
    expect(await const FlutterSecureStorage().read(key: 'hgv_layout'), isNull);
  });

  // Stories are the only 200-high bones.
  int stories(WidgetTester t) => t.widgetList<Bone>(find.byType(Bone)).where((b) => b.height == 200).length;

  testWidgets('Home skeleton: stories for car companies only', (t) async {
    await t.pumpWidget(_app(const HomeSkeleton()));
    expect(stories(t), greaterThan(0));
    await t.pumpWidget(_app(const HomeSkeleton(car: false)));
    expect(stories(t), 0);
  });

  testWidgets('starting skeleton: four tabs and no stories for a shop', (t) async {
    FlutterSecureStorage.setMockInitialValues({'hgv_access': 'a', 'hgv_user': _user, 'hgv_layout': 'retail'});
    final s = Session(client: MockClient((_) async => throw http.ClientException('offline')));
    await t.runAsync(s.restore);
    await t.pumpWidget(_app(const SizedBox(height: 900, child: AppSkeleton()), s));
    expect(stories(t), 0);
    expect(t.widgetList<Bone>(find.byType(Bone)).where((b) => b.width == 26 && b.height == 26).length, 4);
  });
}
