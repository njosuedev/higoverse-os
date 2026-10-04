import 'package:flutter/material.dart';

import '../i18n.dart';
import '../session.dart';
import '../updates.dart';
import 'dashboard_screen.dart';
import 'more_screen.dart';
import 'products_screen.dart';
import 'sales_screen.dart';

/// Signed-in app: four tabs, each keeping its place when you switch.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  late final AppLifecycleListener _life;

  @override
  void initState() {
    super.initState();
    // Coming back to the app: every screen reloads its data.
    _life = AppLifecycleListener(onResume: () => SessionScope.of(context).refreshTick.value++);
    // Look for a newer version shortly after start.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) AppUpdates.check(context);
      });
    });
  }

  @override
  void dispose() {
    _life.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    return Scaffold(
      body: IndexedStack(index: _tab, children: [
        DashboardScreen(onOpenTab: (i) => setState(() => _tab = i)),
        const ProductsScreen(),
        const SalesScreen(),
        const MoreScreen(),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: t('nav.home')),
          NavigationDestination(
            icon: Icon(s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined),
            selectedIcon: Icon(s.isCar ? Icons.directions_car : Icons.inventory_2),
            label: s.isCar ? t('nav.vehicles') : t('nav.stock'),
          ),
          NavigationDestination(
              icon: const Icon(Icons.point_of_sale_outlined), selectedIcon: const Icon(Icons.point_of_sale), label: t('nav.sales')),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: t('nav.account')),
        ],
      ),
    );
  }
}
