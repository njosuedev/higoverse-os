import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_settings.dart';
import '../format.dart';
import '../i18n.dart';
import '../live/activity.dart';
import '../live/live.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import 'activity_screen.dart';
import 'dashboard_screen.dart';
import 'more_screen.dart';
import 'products_screen.dart';
import 'sales_screen.dart';
import 'search_screen.dart';

/// Signed-in app: four tabs, each keeping its place when you switch, with
/// search and notifications at the top of Home. Owns the live connection
/// and the activity feed for this account.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  /// Whether the notifications page is open (no banners over it).
  bool _activityOpen = false;

  /// Home → Vehicles/Stock with a filter already picked.
  final _productFilter = ValueNotifier<String?>(null);
  late final AppLifecycleListener _life;
  Live? _live;
  ActivityFeed? _feed;
  StreamSubscription<ActivityItem>? _freshSub;
  ActivityItem? _banner;
  Timer? _bannerTimer;

  @override
  void initState() {
    super.initState();
    _life = AppLifecycleListener(
      // Coming back: reconnect, and every screen reloads its data.
      onResume: () {
        _live?.start();
        SessionScope.of(context).refreshTick.value++;
      },
      // In the background the socket is let go — no battery spent on it.
      onPause: () => _live?.pause(),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_live == null) {
      final s = SessionScope.of(context);
      _live = Live(s)..start();
      _feed = ActivityFeed(s, live: _live)..seed();
      _freshSub = _feed!.fresh.listen(_onFresh);
    }
  }

  @override
  void dispose() {
    _life.dispose();
    _freshSub?.cancel();
    _bannerTimer?.cancel();
    _feed?.dispose();
    _live?.dispose();
    _productFilter.dispose();
    super.dispose();
  }

  void _openTab(int i) => setState(() => _tab = i);

  void _openProducts(String filter) {
    _productFilter.value = filter;
    setState(() => _tab = 1);
  }

  Future<void> _openActivity(BuildContext context) async {
    setState(() {
      _activityOpen = true;
      _banner = null;
    });
    await pushScoped<void>(context, const ActivityScreen(visible: true));
    if (mounted) setState(() => _activityOpen = false);
  }

  void _openSearch(BuildContext context) => pushScoped<void>(context, const SearchScreen());

  /// Something happened: a banner at the top, unless it was this person's
  /// own doing, the Activity tab is already open, or they turned it off.
  void _onFresh(ActivityItem item) {
    if (!mounted || item.read) return;
    final settings = AppSettingsScope.of(context);
    final wanted = (item.kind == ActivityKind.sale && settings.alertSales) || (item.kind.isStockAlert && settings.alertStock);
    if (_activityOpen || !wanted) return;
    HapticFeedback.lightImpact();
    setState(() => _banner = item);
    _bannerTimer?.cancel();
    _bannerTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) setState(() => _banner = null);
    });
  }

  void _openBanner() {
    final item = _banner;
    _bannerTimer?.cancel();
    setState(() => _banner = null);
    if (item == null) return;
    if (item.kind == ActivityKind.sale) {
      showSaleSheet(context, item.data);
    } else {
      showProductSheet(context, item.data);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    return LiveScope(
      live: _live!,
      child: FeedScope(
        feed: _feed!,
        child: Builder(builder: (context) {
          return Scaffold(
            body: Stack(children: [
              IndexedStack(index: _tab, children: [
                DashboardScreen(
                  onOpenTab: _openTab,
                  onOpenProducts: _openProducts,
                  onSearch: () => _openSearch(context),
                  onNotifications: () => _openActivity(context),
                ),
                ProductsScreen(filter: _productFilter),
                const SalesScreen(),
                const MoreScreen(),
              ]),
              _BannerHost(item: _banner, onTap: _openBanner, onDismiss: () => setState(() => _banner = null)),
            ]),
            bottomNavigationBar: NavigationBar(
              selectedIndex: _tab,
              onDestinationSelected: _openTab,
              destinations: [
                NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home_rounded), label: t('nav.home')),
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
        }),
      ),
    );
  }
}

/// The in-app notification: slides down from the top, swipe up to dismiss.
class _BannerHost extends StatelessWidget {
  const _BannerHost({required this.item, required this.onTap, required this.onDismiss});
  final ActivityItem? item;
  final VoidCallback onTap, onDismiss;

  @override
  Widget build(BuildContext context) {
    final it = item;
    return Positioned(
      left: 10,
      right: 10,
      top: 0,
      child: SafeArea(
        bottom: false,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 280),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          transitionBuilder: (child, a) => SlideTransition(
            position: Tween(begin: const Offset(0, -1.3), end: Offset.zero).animate(a),
            child: FadeTransition(opacity: a, child: child),
          ),
          child: it == null
              ? const SizedBox.shrink()
              : Dismissible(
                  key: ValueKey(it),
                  direction: DismissDirection.up,
                  onDismissed: (_) => onDismiss(),
                  child: Padding(padding: const EdgeInsets.only(top: 8), child: _Banner(item: it, onTap: onTap)),
                ),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.item, required this.onTap});
  final ActivityItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final t = T.of(context);
    final s = SessionScope.of(context);
    final amount = item.args['amount'];
    return Material(
      color: c.surface,
      elevation: 8,
      shadowColor: Colors.black26,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
          child: Row(children: [
            ActivityIcon(item: item, size: 42),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(activityText(t, item), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                if (item.kind == ActivityKind.sale && amount is num) ...[
                  const SizedBox(height: 2),
                  Text(money(amount, s.currency), style: TextStyle(color: c.success, fontWeight: FontWeight.w800)),
                ],
              ]),
            ),
            const SizedBox(width: 6),
            Text(t('time.now'), style: TextStyle(color: c.faint, fontSize: 12)),
          ]),
        ),
      ),
    );
  }
}
