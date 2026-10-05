import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_settings.dart';
import '../covers.dart';
import '../holder.dart';
import '../format.dart';
import '../i18n.dart';
import '../live/activity.dart';
import '../live/live.dart';
import '../live/notifier.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../nav_bar.dart';
import '../sheets.dart';
import '../theme.dart';
import '../updates/update_controller.dart';
import 'activity_screen.dart';
import 'dashboard_screen.dart';
import 'more_screen.dart';
import 'products_screen.dart';
import 'sales_screen.dart';
import 'search_screen.dart';

/// Signed-in app: four tabs, each keeping its place when you switch, with
/// search and notifications at the top of Home. Owns the live connection,
/// the activity feed and phone notifications for this account.
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

  bool _foreground = true;

  /// New since the tab was last opened: sales (Sales tab), fines,
  /// transfers and stock alerts (Vehicles/Stock tab).
  int _newSales = 0, _newStock = 0;

  /// Something happened while another tab was open: a red dot on Home.
  bool _newHome = false;

  /// A context below the live/feed scopes, for pages opened from a
  /// notification tap.
  BuildContext? _scoped;

  @override
  void initState() {
    super.initState();
    _life = AppLifecycleListener(
      // Coming back: reconnect if needed, and every screen reloads its data.
      onResume: () {
        _foreground = true;
        _live?.start();
        AppNotifier.instance.recheck();
        _keepAlive();
        SessionScope.of(context).refreshTick.value++;
      },
      // In the background the connection stays (LiveService keeps the app
      // awake), so alerts ring and count as they happen.
      onPause: () => _foreground = false,
    );
    AppNotifier.instance
      ..onOpen = _openFromNotification
      ..onMarkRead = (() => _feed?.markAllRead())
      ..init();
    WidgetsBinding.instance.addPostFrameCallback((_) => _keepAlive());
  }

  void _keepAlive() {
    if (!mounted) return;
    final s = SessionScope.of(context);
    AppNotifier.keepAlive(s.shop?.name ?? 'Higoverse', T.of(context)('notif.live'));
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
    AppNotifier.letGo();
    AppNotifier.instance
      ..onOpen = null
      ..onMarkRead = null;
    _feed?.dispose();
    _live?.dispose();
    _productFilter.dispose();
    super.dispose();
  }

  void _openTab(int i) => setState(() {
        _tab = i;
        if (i == 0) _newHome = false;
        if (i == 1) _newStock = 0;
        if (i == 2) _newSales = 0;
      });

  void _openProducts(String filter) {
    _productFilter.value = filter;
    _openTab(1);
  }

  Future<void> _openActivity(BuildContext context) async {
    setState(() {
      _activityOpen = true;
      _banner = null;
    });
    AppNotifier.instance.clear();
    await pushScoped<void>(context, const ActivityScreen(visible: true));
    if (mounted) setState(() => _activityOpen = false);
  }

  void _openFromNotification() {
    final ctx = _scoped;
    if (ctx != null && !_activityOpen) _openActivity(ctx);
  }

  void _openSearch(BuildContext context) => pushScoped<void>(context, const SearchScreen());

  /// Something happened: count it on its tab and, unless that alert is
  /// turned off, notify: a phone notification (sound, count) and, with the
  /// app on screen, a banner.
  Future<void> _onFresh(ActivityItem item) async {
    if (!mounted || item.read) return;
    final session = SessionScope.of(context);
    // A fine on a car that is paid and transferred is the owner's business.
    if (item.kind == ActivityKind.fineRecorded) {
      final holder = await carHolder(session, item.data);
      if (!mounted || isReleased(item.data, holder)) return;
    }
    setState(() {
      // Red counts: sales and money owed on Sales; fines, transfers and
      // stock alerts on Vehicles/Stock.
      if ((item.kind == ActivityKind.sale || item.kind == ActivityKind.debtNew) && _tab != 2) _newSales++;
      if ((item.kind.isStockAlert || item.kind.isVehicleAlert) && _tab != 1) _newStock++;
      if (_tab != 0) _newHome = true;
    });
    final settings = AppSettingsScope.of(context);
    if (_activityOpen || !AppNotifier.wanted(item, settings)) return;
    final productId = '${item.data['product_id'] ?? item.data['id'] ?? ''}';
    AppNotifier.instance.show(
      item,
      t: T.of(context),
      session: session,
      sound: settings.sound,
      unread: _feed?.unread ?? 1,
      photo: productId.isEmpty ? null : CoverStore.of(session).cover(productId),
    );
    // Like WhatsApp, the phone's own pop-up shows (with sound) even while
    // the app is open; the in-app banner is only for phones that block
    // notifications.
    if (!_foreground || AppNotifier.instance.allowed) return;
    HapticFeedback.mediumImpact();
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
      openItem(context, item.data);
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
          _scoped = context;
          return Scaffold(
            // Fixed like Instagram's: the keyboard covers the tabs instead of
            // pushing them up over the page.
            bottomNavigationBar: ListenableBuilder(
              listenable: AppUpdates.instance,
              builder: (context, _) => BottomBar(
                index: _tab,
                onTap: _openTab,
                items: [
                  NavItem(
                      label: t('nav.home'), icon: Icons.home_outlined, activeIcon: Icons.home_rounded, dot: _newHome && _tab != 0),
                  NavItem(
                    label: s.isCar ? t('nav.vehicles') : t('nav.stock'),
                    icon: s.isCar ? Icons.directions_car_outlined : Icons.inventory_2_outlined,
                    activeIcon: s.isCar ? Icons.directions_car_rounded : Icons.inventory_2_rounded,
                    badge: _newStock,
                  ),
                  NavItem(
                      label: t('nav.sales'), icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long_rounded, badge: _newSales),
                  // The business: a red dot while a new version of the app waits.
                  NavItem(
                    label: t('nav.menu'),
                    logoName: s.shop?.name ?? s.user?.name ?? '?',
                    logoUrl: s.shop?.logoUrl,
                    dot: AppUpdates.instance.updateAvailable,
                  ),
                ],
              ),
            ),
            body: Stack(children: [
              Column(children: [
                TopBar(
                  onSearch: () => _openSearch(context),
                  onNotifications: () => _openActivity(context),
                  unread: FeedScope.of(context)?.unread ?? 0,
                ),
                Expanded(
                  child: MediaQuery.removePadding(
                    context: context,
                    removeBottom: true,
                    child: IndexedStack(index: _tab, children: [
                      DashboardScreen(onOpenTab: _openTab, onOpenProducts: _openProducts),
                      ProductsScreen(filter: _productFilter),
                      const SalesScreen(),
                      const MoreScreen(),
                    ]),
                  ),
                ),
              ]),
              _BannerHost(item: _banner, onTap: _openBanner, onDismiss: () => setState(() => _banner = null)),
            ]),
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
