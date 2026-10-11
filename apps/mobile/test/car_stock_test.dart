import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/car_stock.dart';
import 'package:higoverse_inventory_mobile/src/forms.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/loading.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> _car(String id, String name, String created, [Map<String, String> attrs = const {}]) =>
    {'id': id, 'name': name, 'quantity': 1, 'selling_price': 25000000, 'created_at': created, 'attributes': jsonEncode(attrs)};

/// A pretend product-service: three BYD Yuan Up stocked in, one already
/// numbered; POST /products/assign records what it was sent.
class _Server {
  final cars = [
    _car('b2', 'BYD Yuan Up', '2026-10-11T10:00:02Z', {'color': 'White'}),
    _car('b1', 'BYD Yuan Up', '2026-10-11T10:00:01Z', {'chassis_no': 'LGX001', 'plate_no': 'RAC 100 A'}),
    _car('b3', 'BYD Yuan Up', '2026-10-11T10:00:03Z'),
  ];
  final assigned = <Map<String, dynamic>>[];
  Map<String, String>? lastQuery;

  late final client = MockClient((req) async {
    final p = req.url.path;
    http.Response ok(Object data) => http.Response(jsonEncode({'data': data}), 200);
    if (req.method == 'GET' && p.endsWith('/products')) {
      lastQuery = req.url.queryParameters;
      return ok({'items': cars, 'total': cars.length});
    }
    if (req.method == 'POST' && p.endsWith('/products/assign')) {
      final body = jsonDecode(req.body) as Map<String, dynamic>;
      for (final c in body['cars'] as List) {
        final row = Map<String, dynamic>.from(c as Map);
        if (row['plate_no'] == 'RAC 100 A') {
          return http.Response(
              jsonEncode({'detail': {'field': 'plate_no', 'car_id': row['id'], 'product_id': 'b1', 'product_name': 'BYD Yuan Up', 'message': 'taken'}}), 409);
        }
        assigned.add(row);
      }
      return ok({'updated': (body['cars'] as List).length});
    }
    return http.Response('{}', 404);
  });

  Session session() => Session(client: client)
    ..accessToken = 'a'
    ..user = User(id: 'u1', name: 'Owner', email: 'o@x.rw', role: 'owner')
    ..shop = Shop(id: 's1', name: 'Cars Ltd', layout: 'car');
}

Widget _app(Session s, Widget home) => SessionScope(
      session: s,
      child: MaterialApp(
        theme: buildTheme(Brightness.light),
        builder: (context, c) => LangScope(lang: 'en', child: c!),
        home: home,
      ),
    );

/// Lets the mock server answer and the skeleton gate finish (the shimmer
/// never settles, so no pumpAndSettle).
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  group('stock in', () {
    test('a line says what is missing, in order', () {
      final l = StockLine();
      expect(l.problem, 'vehicle.pick_name');
      l.name = 'BYD Yuan Up';
      expect(l.problem, 'stockin.need_count');
      l.count = 10;
      expect(l.problem, 'form.need_price');
      l.price = 25000000;
      expect(l.problem, 'vehicle.need_type');
      l.type = 'suv';
      expect(l.problem, 'vehicle.need_year');
      l.year = 2025;
      expect(l.problem, 'vehicle.bad_range');
      l.range = 400;
      expect(l.problem, isNull);
    });

    test('the body sends each line, colour only when given', () {
      final body = stockInBody([
        StockLine(name: ' BYD Yuan Up ', count: 10, price: 25000000, type: 'suv', year: 2025, range: 400, color: 'White'),
        StockLine(name: 'Neta U Pro', count: 20, price: 30000000, type: 'suv', year: 2025, range: 380),
      ]);
      final lines = body['lines'] as List;
      expect(lines, hasLength(2));
      expect(lines[0], {'name': 'BYD Yuan Up', 'count': 10, 'selling_price': 25000000, 'car_type': 'suv', 'year': 2025, 'battery_range': 400, 'color': 'White'});
      expect((lines[1] as Map).containsKey('color'), isFalse);
    });
  });

  group('chassis and plate', () {
    final cars = [
      _car('a', 'BYD Yuan Up', '1', {'chassis_no': 'LGX001'}),
      _car('b', 'BYD Yuan Up', '2'),
      _car('c', 'Neta U Pro', '3'),
    ];

    test('cars are numbered per car name', () {
      expect(carNumbers(cars), {'a': 1, 'b': 2, 'c': 1});
    });

    test('a number typed twice, or already on another car, is caught', () {
      expect(repeatedCarIds(cars, {}), isEmpty);
      expect(repeatedCarIds(cars, {'b': {'chassis_no': 'lgx 001'}}), {'chassis_no:LGX001'});
      expect(repeatedCarIds(cars, {'b': {'plate_no': 'RAC 1 A'}, 'c': {'plate_no': 'rac1a'}}), {'plate_no:RAC1A'});
    });

    test('only what changed is sent, upper case with single spaces', () {
      expect(assignBody(cars, {}), isNull);
      expect(assignBody(cars, {'a': {'chassis_no': 'LGX001'}}), isNull);
      expect(assignBody(cars, {'b': {'chassis_no': ' lgx  002 ', 'plate_no': ''}}), {
        'cars': [
          {'id': 'b', 'chassis_no': 'LGX 002'},
        ],
      });
    });
  });

  group('skeleton gate', () {
    Widget gate(bool loading) => MaterialApp(
          theme: buildTheme(Brightness.light),
          home: SkeletonGate(loading: loading, skeleton: const Text('skeleton'), child: const Text('content')),
        );

    testWidgets('a fast answer never flashes the skeleton', (tester) async {
      await tester.pumpWidget(gate(true));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('skeleton'), findsNothing);
      await tester.pumpWidget(gate(false));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('skeleton'), findsNothing);
      expect(find.text('content'), findsOneWidget);
    });

    testWidgets('once shown, the skeleton stays long enough not to blink', (tester) async {
      await tester.pumpWidget(gate(true));
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text('skeleton'), findsOneWidget);
      await tester.pumpWidget(gate(false));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('content'), findsNothing, reason: 'held for its minimum time');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('skeleton'), findsNothing);
      expect(find.text('content'), findsOneWidget);
    });
  });

  testWidgets('bones share one gradient laid over the whole skeleton', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(Brightness.light),
      builder: (context, c) => LangScope(lang: 'en', child: c!),
      home: const Scaffold(
        body: Shimmer(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Bone(width: 100, height: 10),
            SizedBox(height: 40),
            Bone(width: 200, height: 10),
          ]),
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));
    LinearGradient g(int i) =>
        (tester.widget<Container>(find.descendant(of: find.byType(Bone).at(i), matching: find.byType(Container))).decoration! as BoxDecoration).gradient!
            as LinearGradient;
    final a = g(0).transform!.transform(const Rect.fromLTWH(0, 0, 100, 10))!;
    final b = g(1).transform!.transform(const Rect.fromLTWH(0, 50, 200, 10))!;
    // Both bones map onto the same area: the same width scale (the area is
    // 200 wide, the widest bone: 2× the first bone, 1× the second), not each its own box.
    expect(a.entry(0, 0), closeTo(2, 0.001));
    expect(b.entry(0, 0), closeTo(1, 0.001));
    // And the light is at the same place on screen for both.
    expect(a.entry(0, 3), closeTo(b.entry(0, 3), 0.001));
  });

  testWidgets('assign screen: numbered cars, missing numbers typed and saved, refused one shown on its field', (tester) async {
    tester.view.physicalSize = const Size(1080, 3200);
    tester.view.devicePixelRatio = 1.5;
    addTearDown(tester.view.reset);
    final server = _Server();
    await tester.pumpWidget(_app(server.session(), const CarIdsScreen(name: 'BYD Yuan Up')));
    await _settle(tester);

    expect(server.lastQuery?['name'], 'BYD Yuan Up');
    // Oldest first: b1 (#1, numbered) shows its numbers as text.
    expect(find.text('#1'), findsOneWidget);
    expect(find.text('#3'), findsOneWidget);
    expect(find.text('LGX001'), findsOneWidget);
    // b2 and b3 each have two empty fields.
    expect(find.byType(TextField), findsNWidgets(4));

    // Nothing typed: no save bar.
    expect(find.textContaining('Save'), findsNothing);

    await tester.enterText(find.byType(TextField).at(0), 'lgx 002');
    await tester.pump();
    expect(find.text('Save 1'), findsOneWidget);

    // A plate already on #1 is refused by the server and shown on the field.
    await tester.enterText(find.byType(TextField).at(1), 'RAC 100 A');
    await tester.pump();
    expect(find.text('Typed for another car too'), findsOneWidget);
    await tester.enterText(find.byType(TextField).at(1), 'RAC 200 B');
    await tester.pump();
    expect(find.text('Save 1'), findsOneWidget);

    await tester.tap(find.text('Save 1'));
    await _settle(tester);
    expect(server.assigned, [
      {'id': 'b2', 'chassis_no': 'LGX 002', 'plate_no': 'RAC 200 B'},
    ]);
    expect(find.text('1 vehicles updated'), findsOneWidget);
  });

  test('the new texts exist in every language', () {
    for (final lang in supportedLangs) {
      final t = T(lang);
      for (final k in ['stockin.title', 'assign.title', 'models.view_by_name', 'stock.f_no_ids', 'act.cars_stocked']) {
        expect(t(k), isNot(k), reason: '$lang: $k');
      }
    }
  });
}
