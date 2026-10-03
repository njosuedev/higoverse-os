import 'package:flutter/material.dart';

import '../session.dart';
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

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
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
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(
            icon: Icon(s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined),
            selectedIcon: Icon(s.isCar ? Icons.directions_car : Icons.inventory_2),
            label: s.isCar ? 'Vehicles' : 'Stock',
          ),
          const NavigationDestination(icon: Icon(Icons.point_of_sale_outlined), selectedIcon: Icon(Icons.point_of_sale), label: 'Sales'),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
        ],
      ),
    );
  }
}
