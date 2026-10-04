import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'src/app_settings.dart';
import 'src/i18n.dart';
import 'src/screens/home_shell.dart';
import 'src/screens/login_screen.dart';
import 'src/session.dart';
import 'src/theme.dart';
import 'src/updates/update_controller.dart';
import 'src/widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(HigoverseApp(session: Session(), settings: AppSettings()));
}

class HigoverseApp extends StatefulWidget {
  const HigoverseApp({super.key, required this.session, required this.settings});
  final Session session;
  final AppSettings settings;

  @override
  State<HigoverseApp> createState() => _HigoverseAppState();
}

class _HigoverseAppState extends State<HigoverseApp> {
  final _navigator = GlobalKey<NavigatorState>();
  final _messenger = GlobalKey<ScaffoldMessengerState>();

  late final Future<bool> _restored = () async {
    await widget.settings.load();
    return widget.session.restore();
  }();

  @override
  void initState() {
    super.initState();
    // Updates are looked for in the background once the app is open; the
    // app never waits for them (see updates/update_controller.dart).
    AppUpdates.instance
      ..navigatorKey = _navigator
      ..messengerKey = _messenger;
    _restored.whenComplete(AppUpdates.instance.start);
  }

  @override
  Widget build(BuildContext context) {
    return AppSettingsScope(
      settings: widget.settings,
      child: SessionScope(
        session: widget.session,
        child: ListenableBuilder(
          listenable: Listenable.merge([widget.settings, widget.session]),
          builder: (context, _) {
            final lang = widget.settings.effectiveLanguage(
              account: widget.session.accountLanguage,
              device: WidgetsBinding.instance.platformDispatcher.locale,
            );
            return MaterialApp(
              navigatorKey: _navigator,
              scaffoldMessengerKey: _messenger,
              debugShowCheckedModeBanner: false,
              title: 'Higoverse',
              theme: buildTheme(Brightness.light),
              darkTheme: buildTheme(Brightness.dark),
              themeMode: widget.settings.themeMode,
              // Flutter's own texts (tooltips, date pickers…) and the right
              // fonts for Chinese. Flutter has no Kinyarwanda: English there.
              locale: Locale(lang == 'rw' ? 'en' : lang),
              supportedLocales: const [Locale('en'), Locale('fr'), Locale('sw'), Locale('zh')],
              localizationsDelegates: GlobalMaterialLocalizations.delegates,
              builder: (context, child) => LangScope(lang: lang, child: child!),
              home: FutureBuilder<bool>(
                future: _restored,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) return const _Splash();
                  // Keyed by account so nothing from a previous account survives.
                  return widget.session.signedIn
                      ? HomeShell(key: ValueKey(widget.session.user!.id))
                      : const LoginScreen();
                },
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Hgv.of(context).surface,
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.asset('assets/higoverse-logo.png', width: 64, height: 64),
            ),
            const SizedBox(height: 22),
            const RingsLoader(size: 34),
          ]),
        ),
      );
}
