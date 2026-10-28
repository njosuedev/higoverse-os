import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/screens/payroll_screen.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// A pretend expense-service: one person paid (with a bonus added later),
/// one still to pay (with an advance), and what the screen posts.
class _Server {
  final posts = <(String, Map<String, dynamic>)>[];

  static final _month = {
    'period': '2026-10',
    'rows': [
      {
        'employee': {'id': 'e1', 'full_name': 'Eugene Hakizimana', 'position': 'Car wash', 'monthly_salary': 80000, 'active': true},
        'payment': {
          'id': 'p1', 'employee_id': 'e1', 'period': '2026-10', 'employee_name': 'Eugene Hakizimana', 'position': 'Car wash',
          'gross': 80000, 'bonus': 10000, 'accommodation': 0, 'overtime_amount': 0, 'deductions': 0, 'net': 90000,
          'paid_on': '2026-10-28', 'method': 'bank',
        },
        'advances': [],
        'bonuses': [
          {'id': 'b1', 'payment_id': 'p1', 'employee_name': 'Eugene Hakizimana', 'amount': 10000, 'given_on': '2026-10-28', 'method': 'cash', 'note': 'Target'},
        ],
      },
      {
        'employee': {'id': 'e2', 'full_name': 'Happy Mukama', 'position': 'Sales', 'monthly_salary': 300000, 'active': true},
        'payment': null,
        'advances': [
          {'id': 'a1', 'employee_id': 'e2', 'amount': 50000, 'given_on': '2026-10-05', 'method': 'cash'},
        ],
        'bonuses': [],
      },
    ],
    'totals': {
      'employees': 2, 'paid_count': 1, 'paid_net': 90000, 'paid_gross': 80000, 'paid_bonus': 10000,
      'due_count': 1, 'due_gross': 300000, 'advances_outstanding': 50000,
    },
  };

  late final client = MockClient((req) async {
    final p = req.url.path;
    http.Response ok(Object data) => http.Response(jsonEncode({'success': true, 'data': data}), 200);
    if (req.method == 'GET' && p.contains('/payroll/months/')) return ok(_month);
    if (req.method == 'POST' && p.contains('/payroll/')) {
      posts.add((p, jsonDecode(req.body) as Map<String, dynamic>));
      return ok({'id': 'new'});
    }
    return http.Response('{}', 404);
  });

  Session session() => Session(client: client)
    ..accessToken = 'a'
    ..user = User(id: 'u1', name: 'Manager', email: 'm@x.rw', role: 'manager')
    ..shop = Shop(id: 's1', name: 'Cars Ltd', layout: 'car');
}

Widget _app(Session s) => SessionScope(
      session: s,
      child: MaterialApp(
        theme: buildTheme(Brightness.light),
        builder: (context, c) => LangScope(lang: 'en', child: c!),
        home: const PayrollScreen(),
      ),
    );

/// Lets the mock server answer; the loading shimmer never settles.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 400));
  }
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Future<_Server> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 3200);
    tester.view.devicePixelRatio = 1.5;
    addTearDown(tester.view.reset);
    final server = _Server();
    await tester.pumpWidget(_app(server.session()));
    await _settle(tester);
    return server;
  }

  testWidgets('the month: totals, who is paid and who is still to pay', (tester) async {
    await open(tester);
    expect(find.text('Eugene Hakizimana'), findsOneWidget);
    expect(find.text('Happy Mukama'), findsOneWidget);
    expect(find.text('1 of 2 paid'), findsOneWidget);
    expect(find.text('To pay'), findsOneWidget, reason: "Happy's status");
    expect(find.textContaining('Bonus +10,000'), findsOneWidget, reason: "Eugene's bonus on his row");
    expect(find.textContaining('Advance -50,000'), findsOneWidget, reason: "Happy's advance on his row");
    expect(find.text('Pay 1'), findsOneWidget, reason: 'one person still to pay');
  });

  testWidgets('a bonus on a salary already paid', (tester) async {
    final server = await open(tester);
    await tester.tap(find.text('Eugene Hakizimana'));
    await _settle(tester);
    expect(find.text('Add bonus'), findsOneWidget);
    expect(find.text('+10,000 RWF'), findsWidgets, reason: 'the bonus already added is listed');

    await tester.tap(find.text('Add bonus'));
    await _settle(tester);
    expect(find.text('Bonus for Eugene Hakizimana'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, '25000');
    await tester.pump();
    expect(find.text('115,000 RWF'), findsOneWidget, reason: 'new net pay: 90,000 + 25,000');

    await tester.tap(find.text('Add bonus').last);
    await _settle(tester);
    expect(server.posts, hasLength(1));
    final (path, body) = server.posts.single;
    expect(path, endsWith('/payroll/payments/p1/bonuses'));
    expect(body['amount'], 25000);
    expect(body['method'], 'bank', reason: 'paid the way the salary was, unless changed');
  });

  testWidgets('paying everyone still to pay, with a bonus typed beside one', (tester) async {
    final server = await open(tester);
    await tester.tap(find.text('Pay 1'));
    await _settle(tester);
    expect(find.text('Pay everyone still to pay (1)'), findsOneWidget);
    // Salary 300,000 less the 50,000 advance.
    expect(find.text('250,000 RWF'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '5000');
    await tester.pump();
    expect(find.text('255,000 RWF'), findsOneWidget);

    await tester.tap(find.text('Pay · 255,000 RWF'));
    await _settle(tester);
    expect(server.posts, hasLength(1));
    final (path, body) = server.posts.single;
    expect(path, endsWith('/payroll/payments'));
    expect(body['employee_id'], 'e2');
    expect(body['gross'], 300000);
    expect(body['bonus'], 5000);
    expect(body['period'], isNotEmpty);
  });

  test('every payroll text exists in all five languages', () {
    for (final lang in supportedLangs) {
      final t = T(lang);
      for (final k in ['pr.title', 'pr.add_bonus', 'pr.mark_all', 'pr.undo_body', 'pr.bonus_hint']) {
        expect(t(k), isNot(k), reason: '$lang $k');
      }
    }
  });
}
