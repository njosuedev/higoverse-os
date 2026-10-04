import 'package:flutter/material.dart';

import 'src/app_settings.dart';
import 'src/screens/home_shell.dart';
import 'src/screens/login_screen.dart';
import 'src/session.dart';
import 'src/theme.dart';

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
  late final Future<bool> _restored = () async {
    await widget.settings.load();
    return widget.session.restore();
  }();

  @override
  Widget build(BuildContext context) {
    return AppSettingsScope(
      settings: widget.settings,
      child: SessionScope(
      session: widget.session,
      child: ListenableBuilder(
        listenable: widget.settings,
        builder: (context, _) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Higoverse',
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: widget.settings.themeMode,
        home: FutureBuilder<bool>(
          future: _restored,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const _Splash();
            // Rebuilds on sign-in / sign-out / expiry.
            return ListenableBuilder(
              listenable: widget.session,
              // Keyed by account so nothing from a previous account survives.
              builder: (context, _) => widget.session.signedIn
                  ? HomeShell(key: ValueKey(widget.session.user!.id))
                  : const LoginScreen(),
            );
          },
        ),
      ),
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
            const SizedBox(height: 18),
            SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Hgv.of(context).ink)),
          ]),
        ),
      );
}
