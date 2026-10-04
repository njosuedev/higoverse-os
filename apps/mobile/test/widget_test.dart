import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/format.dart';
import 'package:higoverse_inventory_mobile/src/screens/login_screen.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';

Widget _wrap(Widget child) =>
    SessionScope(session: Session(), child: MaterialApp(theme: buildTheme(Brightness.light), home: child));

void main() {
  testWidgets('login screen shows the sign-in form and no fake options', (tester) async {
    await tester.pumpWidget(_wrap(const LoginScreen()));
    expect(find.text('Log into Higoverse'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Forgot password?'), findsOneWidget);
    expect(find.textContaining('Google'), findsNothing);
    expect(find.text('Register'), findsNothing);
  });

  testWidgets('empty sign-in explains what is missing', (tester) async {
    await tester.pumpWidget(_wrap(const LoginScreen()));
    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(find.text('Enter the email address of your account.'), findsOneWidget);
  });

  test('money and digits formatting', () {
    expect(groupDigits(1250000), '1,250,000');
    expect(groupDigits(999), '999');
    expect(money(27000000, 'RWF'), '27,000,000 RWF');
  });

  test('car attributes parse safely', () {
    expect(attributesOf('{"plate_no":"RAC 123 A","year":2023}')['year'], '2023');
    expect(attributesOf('not json'), isEmpty);
    expect(attributesOf(null), isEmpty);
  });
}
