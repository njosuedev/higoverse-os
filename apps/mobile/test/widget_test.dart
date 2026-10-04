import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/app_settings.dart';
import 'package:higoverse_inventory_mobile/src/format.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/loading.dart';
import 'package:higoverse_inventory_mobile/src/screens/login_screen.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';

Widget _wrap(Widget child, {String lang = 'en', Brightness brightness = Brightness.light}) => AppSettingsScope(
      settings: AppSettings(),
      child: SessionScope(
        session: Session(),
        child: MaterialApp(
          theme: buildTheme(brightness),
          builder: (context, c) => LangScope(lang: lang, child: c!),
          home: child,
        ),
      ),
    );

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

  testWidgets('login screen follows the language', (tester) async {
    await tester.pumpWidget(_wrap(const LoginScreen(), lang: 'fr'));
    expect(find.text('Connexion à Higoverse'), findsOneWidget);
    await tester.tap(find.text('Se connecter'));
    await tester.pump();
    expect(find.text("Saisissez l'adresse e-mail de votre compte."), findsOneWidget);
  });

  testWidgets('skeletons and the rings loader draw in dark mode', (tester) async {
    await tester.pumpWidget(_wrap(
      const Scaffold(body: Column(children: [ListSkeleton(count: 3, leading: RowLead.thumb, chips: true), RingsLoader()])),
      brightness: Brightness.dark,
    ));
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.byType(Bone), findsWidgets);
    final box = tester.widget<Container>(find.descendant(of: find.byType(Bone).first, matching: find.byType(Container)));
    final gradient = (box.decoration! as BoxDecoration).gradient! as LinearGradient;
    expect(gradient.colors.first, Hgv.dark.skeleton);
    expect(gradient.colors[1], Hgv.dark.skeletonHi);
  });

  test('every language has every string', () {
    final keys = translationKeys;
    for (final lang in supportedLangs) {
      expect(keys[lang]!.difference(keys['en']!), isEmpty, reason: '$lang has extra keys');
      expect(keys['en']!.difference(keys[lang]!), isEmpty, reason: '$lang is missing keys');
    }
    expect(const T('sw')('dash.left', {'n': 3}), 'Zimebaki 3');
    expect(const T('xx')('nav.home'), 'Home');
  });

  test('money and digits formatting', () {
    expect(groupDigits(1250000), '1,250,000');
    expect(groupDigits(999), '999');
    expect(money(27000000, 'RWF'), '27,000,000 RWF');
  });

  test('dates in the app language', () {
    expect(shortDateTime('2026-10-03T12:05:00Z', const T('fr').months).contains('oct.'), isTrue);
    expect(const T('zh').dateTime('2026-10-03T12:05:00Z'), contains('10月'));
  });

  test('car attributes parse safely', () {
    expect(attributesOf('{"plate_no":"RAC 123 A","year":2023}')['year'], '2023');
    expect(attributesOf('not json'), isEmpty);
    expect(attributesOf(null), isEmpty);
  });
}
