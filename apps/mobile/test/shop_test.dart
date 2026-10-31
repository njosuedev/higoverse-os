import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/screens/partners_screen.dart';
import 'package:higoverse_inventory_mobile/src/screens/settings_screen.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/shop_sale.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';

Widget _wrap(Widget child, Session s) => SessionScope(
      session: s,
      child: MaterialApp(
        theme: buildTheme(Brightness.light),
        builder: (context, c) => LangScope(lang: 'en', child: c!),
        home: child,
      ),
    );

void main() {
  test('what the customer hands over goes to the items in order', () {
    expect(sharePaid([3000, 2000], 5000), [3000, 2000]);
    expect(sharePaid([3000, 2000], 4000), [3000, 1000]);
    expect(sharePaid([3000, 2000], 1000), [1000, 0]);
    // More than the total (change is given back): each item fully paid.
    expect(sharePaid([3000, 2000], 10000), [3000, 2000]);
    expect(sharePaid([3000], 0), [0]);
  });

  test('a supplier is a partner saved with a TIN in the address', () {
    final sup = Partner({'id': '1', 'name': 'INYANGE', 'address': 'TIN:123456789|KN 5 Ave'});
    expect(sup.isSupplier, isTrue);
    expect(sup.tin, '123456789');
    expect(sup.address, 'KN 5 Ave');
    final only = Partner({'id': '2', 'name': 'X', 'address': 'TIN:987654321'});
    expect(only.tin, '987654321');
    expect(only.address, '');
    final cust = Partner({'id': '3', 'name': 'Jean', 'phone': '0781234567', 'address': 'Musanze'});
    expect(cust.isSupplier, isFalse);
    expect(cust.address, 'Musanze');
  });

  test('TIN and address are stored the way the website stores them', () {
    expect(encodePartnerAddress('123456789', 'Kigali'), 'TIN:123456789|Kigali');
    expect(encodePartnerAddress('123456789', ''), 'TIN:123456789');
    expect(encodePartnerAddress('', ' Kigali '), 'Kigali');
    expect(encodePartnerAddress('', ''), '');
  });

  test('business phone numbers are checked and stored as +250…', () {
    expect(normalizePhone('0788 123 456'), '+250788123456');
    expect(normalizePhone('+250 788 123 456'), '+250788123456');
    expect(normalizePhone('250788123456'), '+250788123456');
    expect(normalizePhone('0688 123 456'), isNull);
    expect(normalizePhone('abc'), isNull);
    expect(normalizePhone(''), isNull);
  });

  test('every new string exists in every language', () {
    final keys = translationKeys;
    for (final lang in supportedLangs) {
      expect(keys[lang]!.containsAll(keys['en']!), isTrue, reason: lang);
    }
    expect(const T('rw')('att.present'), 'Yaje');
    expect(const T('zh')('m.receipt'), '收据');
  });

  test('a till receipt is a PDF', () async {
    final s = Session()..shop = Shop(id: 's', name: 'Duka', layout: 'retail', phone: '+250788123456', tin: '123456789');
    final bytes = await receiptPdf(
      [
        {
          'id': 'abcd1234-x',
          'product_name': 'Sugar 1kg',
          'quantity': 2,
          'unit_price': 1000,
          'total_amount': 2000,
          'created_at': '2026-10-31T10:00:00Z'
        },
        {'id': 'efgh', 'product_name': 'Rice 5kg', 'quantity': 1, 'unit_price': 4500, 'total_amount': 4500},
      ],
      s,
      const T('en'),
      method: 'cash',
      paid: 10000,
      change: 3500,
    );
    expect(String.fromCharCodes(bytes.take(4)), '%PDF');
  });

  testWidgets('shop sale: nothing is sent without an item', (tester) async {
    final s = Session()..shop = Shop(id: 's', name: 'Duka', layout: 'retail');
    await tester.pumpWidget(_wrap(const ShopSaleFormScreen(product: {'id': 'p', 'name': 'Soap', 'quantity': 0}), s));
    await tester.pump();
    // An item that is sold out is not added; the picker would open instead.
    expect(find.text('Soap'), findsNothing);
  });

  testWidgets('shop sale: items, quantity and the change to give back', (tester) async {
    final s = Session()..shop = Shop(id: 's', name: 'Duka', layout: 'retail');
    await tester.pumpWidget(
        _wrap(const ShopSaleFormScreen(product: {'id': 'p', 'name': 'Soap', 'quantity': 5, 'selling_price': 1500, 'cost_price': 1000}), s));
    await tester.pump();
    expect(find.text('Soap'), findsOneWidget);
    expect(find.text('Items (1)'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add).first);
    await tester.pump();
    expect(find.text('2'), findsOneWidget);
    expect(find.textContaining('3,000 RWF'), findsWidgets);
    await tester.enterText(find.byType(TextFormField).at(1), '5000');
    await tester.pump();
    expect(find.text('Change: 2,000 RWF'), findsOneWidget);
  });

  testWidgets('partner form: a TIN makes a supplier, and bad ones are refused', (tester) async {
    final s = Session()..shop = Shop(id: 's', name: 'Duka', layout: 'retail');
    final others = [
      Partner({'id': 'x', 'name': 'INYANGE', 'address': 'TIN:123456789'})
    ];
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_wrap(PartnerFormScreen(others: others), s));
    expect(find.text('Will be saved as a Customer'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), 'Another');
    await tester.enterText(find.byType(TextFormField).at(2), '123456789');
    await tester.pump();
    expect(find.text('Will be saved as a Supplier'), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pump();
    expect(find.text('TIN already registered to "INYANGE"'), findsOneWidget);
  });
}
