import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/forms.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';
import 'package:higoverse_inventory_mobile/src/ui.dart';

void main() {
  test('chassis and plate compare without spaces or case (each car is unique)', () {
    expect(carKey('rac 123 a'), carKey('RAC123A'));
    expect(carKey(' LL31233343 '), 'LL31233343');
    expect(carKey(null), '');
  });

  testWidgets('search field: 56 dp pill, clear button appears while typing', (tester) async {
    final q = TextEditingController();
    var last = 'x';
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(Brightness.light),
      home: Scaffold(body: Padding(padding: const EdgeInsets.all(12), child: SearchField(controller: q, hint: 'Search', onChanged: (v) => last = v))),
    ));
    expect(tester.getSize(find.byType(SearchField)).height, 56);
    expect(find.byIcon(Icons.close_rounded), findsNothing);
    await tester.enterText(find.byType(TextField), 'BYD');
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();
    expect(q.text, '');
    expect(last, '');
  });
}
