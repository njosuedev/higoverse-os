import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import 'i18n.dart';
import 'media.dart';
import 'session.dart';
import 'theme.dart';
import 'ui.dart';

/// One tab of [BottomBar].
class NavItem {
  const NavItem({required this.label, this.icon, this.activeIcon, this.logoName, this.logoUrl, this.badge = 0, this.dot = false});
  final String label;
  final IconData? icon, activeIcon;

  /// Shows the business logo (its initials when it has none) instead of an
  /// icon (the Menu tab).
  final String? logoName, logoUrl;

  /// Unread count on the icon, in Facebook's red (hidden at 0).
  final int badge;

  /// Something new to look at, without a number: a red dot under the icon.
  final bool dot;
}

/// The top of the signed-in app: the Higoverse logo and name beside search
/// and notifications.
class TopBar extends StatelessWidget {
  const TopBar({
    super.key,
    required this.onSearch,
    required this.onNotifications,
    required this.unread,
  });
  final VoidCallback onSearch, onNotifications;
  final int unread;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final t = T.of(context);
    final name = s.shop?.name ?? 'Higoverse';
    return Material(
      color: c.chrome,
      elevation: 0,
      child: SafeArea(
        bottom: false,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 10, 6),
            child: Row(children: [
              // The Higoverse brand, as Facebook shows its own name up here.
              Image.asset('assets/higoverse-logo.png', width: 32, height: 32, filterQuality: FilterQuality.medium,
                  semanticLabel: name),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Higoverse',
                    maxLines: 1,
                    style: TextStyle(fontSize: 23, height: 1.05, fontWeight: FontWeight.w900, letterSpacing: -0.8, color: c.ink)),
              ),
              RoundIconButton(icon: PhosphorIconsRegular.magnifyingGlass, tooltip: t('search.title'), onTap: onSearch),
              const SizedBox(width: 8),
              RoundIconButton(icon: PhosphorIconsRegular.bell, tooltip: t('acc.notifications'), onTap: onNotifications, badge: unread),
            ]),
          ),
          Divider(height: 1, thickness: 0.6, color: c.border),
        ]),
      ),
    );
  }
}

/// The tabs, fixed at the bottom like Instagram's: icons only (Phosphor's
/// Regular outline, its Fill twin when open — same shape, no size jump; the name is read out and shown on a long press), a
/// red count for what's new (Facebook's red) or a red dot under the icon.
/// It stays put: the keyboard covers it instead of pushing it up.
class BottomBar extends StatelessWidget {
  const BottomBar({super.key, required this.items, required this.index, required this.onTap});
  final List<NavItem> items;
  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Material(
      color: c.chrome,
      elevation: 0,
      child: SafeArea(
        top: false,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Divider(height: 1, thickness: 0.6, color: c.border),
          SizedBox(
            height: 52,
            child: Row(children: [
              for (var i = 0; i < items.length; i++)
                Expanded(child: _Tab(item: items[i], selected: i == index, onTap: () => onTap(i))),
            ]),
          ),
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
    // Every tab's picture sits in the same 28px box, so they line up.
    final Widget icon = SizedBox.square(
      dimension: 28,
      child: Center(
        child: item.logoName != null
            // The business logo, ringed in the text colour when open (as
            // Instagram rings the profile picture).
            ? Container(
                padding: const EdgeInsets.all(1.5),
                decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(color: selected ? c.text : Colors.transparent, width: 1.5)),
                child: ShopLogo(name: item.logoName!, url: item.logoUrl, size: 22),
              )
            : Icon(selected ? (item.activeIcon ?? item.icon) : item.icon, size: 26, color: c.text),
      ),
    );
    final label = [
      item.label,
      if (item.badge > 0) '${item.badge}',
      if (item.dot && item.badge == 0) T.of(context)('nav.new'),
    ].join(', ');
    return Semantics(
      selected: selected,
      button: true,
      label: label,
      excludeSemantics: true,
      child: Tooltip(
        message: item.label,
        triggerMode: TooltipTriggerMode.longPress,
        child: InkResponse(
          radius: 28,
          onTap: () {
            HapticFeedback.selectionClick();
            onTap();
          },
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const SizedBox(height: 8),
              WithCount(count: item.badge, dx: -10, dy: -6, child: icon),
              const SizedBox(height: 4),
              // The dot's place is kept, so icons don't move when it shows.
              SizedBox(height: 6, child: item.dot && item.badge == 0 ? const NewDot() : null),
            ]),
          ),
        ),
      ),
    );
  }
}
