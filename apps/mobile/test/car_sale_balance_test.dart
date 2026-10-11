import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/forms.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/reservation.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _buyer = {'id': 'c1', 'name': 'Eric Mugisha', 'phone': '0788000000', 'id_number': '1199080000000000', 'address': 'Kigali'};
const _carAttrs = {'plate_no': 'RAK 094 L', 'chassis_no': 'LGXCE4CB0P0000001', 'year': '2024'};
final _car = {'id': 'v1', 'name': 'BYD E2', 'quantity': 1, 'selling_price': 15000000, 'attributes': jsonEncode(_carAttrs)};

/// A pretend server: a car whose attributes change with PUTs, sales and
/// debts recorded as posted.
class _Server {
  _Server({Map<String, String> attrs = _carAttrs}) : attrs = {...attrs};
  Map<String, String> attrs;
  final sales = <Map<String, dynamic>>[];
  final debts = <Map<String, dynamic>>[];
  int puts = 0;

  late final client = MockClient((req) async {
    final p = req.url.path;
    http.Response ok(Object data) => http.Response(jsonEncode({'data': data}), 200);
    if (req.method == 'GET' && p.endsWith('/suppliers')) return ok([_buyer]);
    if (req.method == 'GET' && p.endsWith('/products/v1')) return ok({..._car, 'attributes': jsonEncode(attrs)});
    if (req.method == 'PUT' && p.endsWith('/products/v1')) {
      puts++;
      final body = jsonDecode(req.body) as Map;
      attrs = body['attributes'] == null ? {} : Map<String, String>.from(jsonDecode(body['attributes'] as String) as Map);
      return ok({'id': 'v1'});
    }
    if (req.method == 'POST' && p.endsWith('/sales')) {
      sales.add(jsonDecode(req.body) as Map<String, dynamic>);
      return ok({'id': 'sale${sales.length}'});
    }
    if (req.method == 'POST' && p.endsWith('/debts')) {
      debts.add(jsonDecode(req.body) as Map<String, dynamic>);
      return ok({'id': 'debt1'});
    }
    return http.Response('{}', 404);
  });

  Session session() => Session(client: client)
    ..accessToken = 'a'
    ..user = User(id: 'u1', name: 'Owner', email: 'o@x.rw', role: 'owner')
    ..shop = Shop(id: 's1', name: 'Cars Ltd', layout: 'car');
}

/// The sale form opened from a page (so saving can close it).
Widget _app(Session s) => SessionScope(
      session: s,
      child: MaterialApp(
        theme: buildTheme(Brightness.light),
        builder: (context, c) => LangScope(lang: 'en', child: c!),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<bool>(builder: (_) => SaleFormScreen(product: _car))),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );

/// Lets the (mock) server answer and the screens catch up; the loading
/// shimmer never settles, so no pumpAndSettle.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 400));
  }
}

const _en = T('en');

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Future<_Server> sell(WidgetTester tester, {required String paidNow}) async {
    tester.view.physicalSize = const Size(1080, 3200);
    tester.view.devicePixelRatio = 1.5;
    addTearDown(tester.view.reset);
    final server = _Server();
    await tester.pumpWidget(_app(server.session()));
    await tester.tap(find.text('open'));
    await _settle(tester);

    expect(find.text('Agreed price'), findsNWidgets(2), reason: 'the price field and the summary');
    expect(find.text('Paid in full'), findsOneWidget, reason: 'until changed, paid in full');

    await tester.tap(find.text('Choose a customer'));
    await _settle(tester);
    await tester.tap(find.text('Eric Mugisha · 0788000000').last);
    await _settle(tester);
    await tester.tap(find.text('Bank'));
    // Price, paid now, notes.
    await tester.enterText(find.byType(TextFormField).at(1), paidNow);
    await _settle(tester);
    return server;
  }

  testWidgets('paid 10,000,000 of an agreed 15,000,000: the car is reserved with a first deposit, not sold', (tester) async {
    final server = await sell(tester, paidNow: '10000000');
    expect(find.text('Reserve with deposit'), findsOneWidget, reason: 'the button says what will happen');
    expect(find.text('5,000,000 RWF'), findsOneWidget, reason: 'what is left, shown while typing');
    await tester.tap(find.text('Reserve with deposit'));
    await _settle(tester);

    expect(server.sales, isEmpty, reason: 'sold only when fully paid');
    expect(server.debts, isEmpty, reason: 'deposits track what is left, not a debt');
    expect(server.attrs['sale_status'], 'pending');
    expect(server.attrs['buyer_customer_id'], 'c1');
    expect(server.attrs['buyer_name'], 'Eric Mugisha');
    expect(server.attrs['agreed_price'], '15000000');
    expect(server.attrs['plate_no'], 'RAK 094 L', reason: "the car's own details stay");
    final deposits = jsonDecode(server.attrs['deposits']!) as List;
    expect(deposits.single['amount'], 10000000);
    expect(deposits.single['method'], 'bank');
  });

  testWidgets('paid in full: a sale at the agreed price, nothing reserved', (tester) async {
    final server = await sell(tester, paidNow: '15000000');
    await tester.tap(find.text('Save sale'));
    await _settle(tester);
    expect(server.sales.single['amount_paid'], 15000000);
    expect(server.sales.single['payment_method'], 'bank');
    expect(server.puts, 0);
    expect(server.debts, isEmpty);
  });

  testWidgets('paying more than the agreed price is refused before anything is sent', (tester) async {
    final server = await sell(tester, paidNow: '16000000');
    await tester.tap(find.text('Save sale'));
    await _settle(tester);
    expect(server.sales, isEmpty);
    expect(server.puts, 0);
    expect(find.text("Paid now can't be more than the agreed price."), findsWidgets);
  });

  group('deposits on a pending car (same record as the website)', () {
    Map<String, dynamic> pendingCar(_Server server) => {..._car, 'attributes': jsonEncode(server.attrs)};

    test('each deposit lowers the balance; the one that completes the price sells the car to the buyer', () async {
      final server = _Server();
      final s = server.session();
      await reserveCar(s, _car, buyer: _buyer, price: 15000000, deposit: {'amount': 10000000, 'method': 'bank', 'date': '2026-10-01'});
      expect(carPayments(server.attrs, 15000000).balance, 5000000);

      expect(await addCarDeposit(s, pendingCar(server), {'amount': 3000000, 'method': 'mtn', 'date': '2026-10-05', 'reference': 'MP123'}, _en),
          DepositOutcome.saved);
      final pay = carPayments(server.attrs, 15000000);
      expect((pay.paid, pay.balance, pay.full), (13000000, 2000000, false));
      expect(pay.deposits.last['reference'], 'MP123');
      expect(server.sales, isEmpty);

      expect(await addCarDeposit(s, pendingCar(server), {'amount': 2000000, 'method': 'cash', 'date': '2026-10-07'}, _en), DepositOutcome.sold);
      final sale = server.sales.single;
      expect(sale['product_id'], 'v1');
      expect(sale['customer_id'], 'c1');
      expect(sale['unit_price'], 15000000);
      expect(sale['amount_paid'], 15000000);
      expect(sale['payment_method'], 'bank', reason: 'the method most of the money came by');
      expect(sale['notes'], contains('Paid in deposits: 2026-10-01 10,000,000 Bank; 2026-10-05 3,000,000 MTN; 2026-10-07 2,000,000 Cash.'));
      expect(sale['notes'], contains('RAK 094 L'));
    });

    test('a deposit above the balance is refused, checked against the latest record', () async {
      final server = _Server();
      final s = server.session();
      await reserveCar(s, _car, buyer: _buyer, price: 15000000, deposit: {'amount': 10000000, 'method': 'cash'});
      final seenEarlier = pendingCar(server);
      // Someone else takes 4,000,000 meanwhile: 1,000,000 is left, not 5,000,000.
      await addCarDeposit(s, seenEarlier, {'amount': 4000000, 'method': 'cash'}, _en);
      await expectLater(addCarDeposit(s, seenEarlier, {'amount': 2000000, 'method': 'cash'}, _en),
          throwsA(isA<ReserveException>().having((e) => e.problem, 'problem', ReserveProblem.depositInvalid)));
      expect(carPayments(server.attrs, 15000000).paid, 14000000);
    });

    test('reserving needs the plate and chassis, a complete buyer, and a deposit below the price', () async {
      Future<ReserveProblem?> problem(_Server server, {Map<String, dynamic> buyer = _buyer, num deposit = 0}) async {
        try {
          await reserveCar(server.session(), _car, buyer: buyer, price: 15000000, deposit: {'amount': deposit, 'method': 'cash'});
          return null;
        } on ReserveException catch (e) {
          return e.problem;
        }
      }

      expect(await problem(_Server(attrs: {'year': '2024'})), ReserveProblem.idsMissing);
      expect(await problem(_Server(), buyer: {..._buyer, 'id_number': ''}), ReserveProblem.buyerIncomplete);
      expect(await problem(_Server(), deposit: 15000000), ReserveProblem.depositIsFull);
      expect(await problem(_Server()), isNull, reason: 'no deposit yet is fine');
    });

    test('releasing frees the car and keeps its own details', () async {
      final server = _Server();
      final s = server.session();
      await reserveCar(s, _car, buyer: _buyer, price: 15000000, deposit: {'amount': 1000000, 'method': 'cash'});
      await releaseCar(s, pendingCar(server));
      expect(server.attrs, _carAttrs);
    });

    test('older deposits saved by the website read the same', () {
      final pay = carPayments({
        'agreed_price': '9000000',
        'deposits': jsonEncode([
          {'amount': 4000000, 'method': 'cash', 'date': '2026-09-01', 'at': '2026-09-01T08:00:00Z'},
          {'amount': '1000000', 'method': 'mtn', 'date': '2026-09-15', 'at': '2026-09-15T08:00:00Z'},
        ]),
      }, 9500000);
      expect((pay.price, pay.paid, pay.balance), (9000000, 5000000, 4000000));
      expect(carPayments(const {}, 9500000).price, 9500000, reason: 'no agreed price: the car price');
    });
  });
}
