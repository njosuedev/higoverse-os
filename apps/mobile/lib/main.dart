import 'package:flutter/material.dart';

import 'src/screens/home_shell.dart';
import 'src/screens/login_screen.dart';
import 'src/session.dart';
import 'src/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(HigoverseApp(session: Session()));
}

class HigoverseApp extends StatefulWidget {
  const HigoverseApp({super.key, required this.session});
  final Session session;

  @override
  State<HigoverseApp> createState() => _HigoverseAppState();
}

class _HigoverseAppState extends State<HigoverseApp> {
  late final Future<bool> _restored = widget.session.restore();

  @override
  Widget build(BuildContext context) {
    return SessionScope(
      session: widget.session,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Higoverse',
        theme: buildTheme(),
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
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.white,
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.asset('assets/higoverse-logo.png', width: 64, height: 64),
            ),
            const SizedBox(height: 18),
            const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Brand.ink)),
          ]),
        ),
      );
}
