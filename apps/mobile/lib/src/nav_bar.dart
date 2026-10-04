import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'i18n.dart';
import 'live/live.dart';
import 'media.dart';
import 'session.dart';
import 'theme.dart';
import 'ui.dart';

/// One tab of [TopTabs].
class NavItem {
  const NavItem({required this.label, this.icon, this.activeIcon, this.avatarName, this.badge = 0});
  final String label;
  final IconData? icon, activeIcon;

  /// Shows this person's initials instead of an icon (the Menu tab).
  final String? avatarName;

  /// Unread count shown on the icon (hidden at 0).
  final int badge;
}

/// The top of the signed-in app, fixed like Facebook's: the Higoverse logo
/// and name (with live status) beside search and notifications, then a row of icon tabs
/// with a blue line under the open one and red counts for what's new.
class TopBar extends StatelessWidget {
  const TopBar({
    super.key,
    required this.items,
    required this.index,
    required this.onTap,
    required this.onSearch,
    required this.onNotifications,
    required this.unread,
  });
  final List<NavItem> items;
  final int index;
  final ValueChanged<int> onTap;
  final VoidCallback onSearch, onNotifications;
  final int unread;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final t = T.of(context);
    final live = LiveScope.of(context);
    final name = s.shop?.name ?? 'Higoverse';
    final (liveLabel, liveColor) = switch (live?.status) {
      LiveStatus.live => (t('live.live'), c.success),
      LiveStatus.connecting => (t('live.connecting'), c.warning),
      _ => (t('live.offline'), c.faint),
    };
    return Material(
      color: c.chrome,
      elevation: 0,
      child: SafeArea(
        bottom: false,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 12, 6),
            child: Row(children: [
              // The Higoverse brand, as Facebook shows its own name up here.
              Image.asset('assets/higoverse-logo.png', width: 36, height: 36, filterQuality: FilterQuality.medium,
                  semanticLabel: name),
              const SizedBox(width: 9),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text('Higoverse',
                      maxLines: 1,
                      style: TextStyle(fontSize: 23, height: 1.05, fontWeight: FontWeight.w900, letterSpacing: -0.8, color: c.ink)),
                  Row(children: [
                    PulseDot(color: liveColor, active: live?.status == LiveStatus.live, size: 6),
                    Text(liveLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: liveColor)),
                  ]),
                ]),
              ),
              RoundIconButton(icon: Icons.search_rounded, tooltip: t('search.title'), onTap: onSearch),
              const SizedBox(width: 8),
              RoundIconButton(icon: Icons.notifications_rounded, tooltip: t('acc.notifications'), onTap: onNotifications, badge: unread),
            ]),
          ),
          SizedBox(
            height: 46,
            child: Row(children: [
              for (var i = 0; i < items.length; i++)
                Expanded(child: _Tab(item: items[i], selected: i == index, onTap: () => onTap(i))),
            ]),
          ),
          Divider(height: 1, thickness: 0.6, color: c.border),
        ]),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({required this.item, required this.selected, required this.onTap});
  final NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    Widget icon = item.avatarName != null
        ? Container(
            padding: const EdgeInsets.all(1.5),
            decoration: BoxDecoration(
                shape: BoxShape.circle, border: Border.all(color: selected ? c.ink : Colors.transparent, width: 1.8)),
            child: Avatar(name: item.avatarName!, size: 24),
          )
        : Icon(selected ? (item.activeIcon ?? item.icon) : item.icon, size: 26, color: selected ? c.ink : c.muted);
    if (item.badge > 0) {
      icon = Badge(
        backgroundColor: c.danger,
        offset: const Offset(9, -6),
        label: Text(item.badge > 99 ? '99+' : '${item.badge}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
        child: icon,
      );
    }
    return Semantics(
      selected: selected,
      button: true,
      label: item.badge > 0 ? '${item.label}, ${item.badge}' : item.label,
      excludeSemantics: true,
      child: Tooltip(
        message: item.label,
        child: InkWell(
          onTap: () {
            HapticFeedback.selectionClick();
            onTap();
          },
          child: Stack(children: [
            Center(child: icon),
            Positioned(
              left: 10,
              right: 10,
              bottom: 0,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                height: 3,
                decoration: BoxDecoration(
                  color: selected ? c.ink : Colors.transparent,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
