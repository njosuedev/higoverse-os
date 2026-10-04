import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/forms.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';

Widget _wrap(Widget child, {String lang = 'en'}) => SessionScope(
      session: Session(),
      child: MaterialApp(
        theme: buildTheme(Brightness.light),
        builder: (context, c) => LangScope(lang: lang, child: c!),
        home: child,
      ),
    );

void main() {
  test('amounts typed with grouping are read as numbers', () {
    expect(parseAmount('1,500,000'), 1500000);
    expect(parseAmount(' 2 500 '), 2500);
    expect(parseAmount('12.5'), 12.5);
    expect(parseAmount(''), isNull);
    expect(parseAmount('abc'), isNull);
  });

  test('a car buyer needs name, phone, ID and address', () {
    final full = {'name': 'A', 'phone': '078', 'id_number': '1199', 'address': 'Kigali'};
    expect(customerComplete(full), isTrue);
    expect(customerComplete({...full, 'id_number': ' '}), isFalse);
    expect(customerComplete({...full}..remove('address')), isFalse);
  });

  testWidgets('sale form: nothing is sent without a product', (tester) async {
    await tester.pumpWidget(_wrap(const SaleFormScreen()));
    expect(find.text('Choose a product'), findsOneWidget);
    expect(find.text('Credit'), findsOneWidget);
    await tester.tap(find.text('Save sale'));
    await tester.pump();
    expect(find.text('Choose what you are selling first.'), findsOneWidget);
  });

  testWidgets('sale form on credit asks who owes', (tester) async {
    tester.view.physicalSize = const Size(1080, 3000);
    tester.view.devicePixelRatio = 1.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_wrap(SaleFormScreen(product: const {'id': 'p1', 'name': 'Sugar 1kg', 'quantity': 4, 'selling_price': 1500})));
    expect(find.text('1,500'), findsOneWidget);
    expect(find.text('1,500 RWF'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();
    expect(find.text('3,000 RWF'), findsOneWidget);
    await tester.tap(find.text('Credit'));
    await tester.pump();
    await tester.tap(find.text('Save sale'));
    await tester.pump();
    expect(find.text('Enter who owes the money.'), findsOneWidget);
  });

  testWidgets('product, debt and expense forms check their fields', (tester) async {
    for (final (page, error) in [
      (const ProductFormScreen(), 'Enter a name.'),
      (const DebtFormScreen(), 'Enter who owes the money.'),
      (const ExpenseFormScreen(), 'Enter what it was for.'),
    ]) {
      await tester.pumpWidget(_wrap(page));
      await tester.tap(find.text('Save'));
      await tester.pump();
      expect(find.text(error), findsOneWidget);
    }
  });

  testWidgets('forms read in every language', (tester) async {
    for (final lang in supportedLangs) {
      await tester.pumpWidget(_wrap(const ExpenseFormScreen(), lang: lang));
      expect(tester.takeException(), isNull);
    }
  });
}
