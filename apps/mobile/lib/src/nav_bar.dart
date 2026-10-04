import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'theme.dart';
import 'ui.dart';

/// One tab of [AppNavBar].
class NavItem {
  const NavItem({required this.label, this.icon, this.activeIcon, this.avatarName, this.badge = 0});
  final String label;
  final IconData? icon, activeIcon;

  /// Shows this person's initials instead of an icon (the Menu tab).
  final String? avatarName;

  /// Unread count shown on the icon (hidden at 0).
  final int badge;
}

/// The bottom bar: outlined icons, the selected one filled inside a soft pill
/// with a bold label, red count badges — like the big messaging apps.
class AppNavBar extends StatelessWidget {
  const AppNavBar({super.key, required this.items, required this.index, required this.onTap});
  final List<NavItem> items;
  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Material(
      color: c.surface,
      child: Container(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.7), width: 0.6))),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 62,
            child: Row(children: [
              for (var i = 0; i < items.length; i++)
                Expanded(child: _Tab(item: items[i], selected: i == index, onTap: () => onTap(i))),
            ]),
          ),
        ),
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
    final color = selected ? c.ink : c.muted;
    Widget icon = item.avatarName != null
        ? Container(
            padding: const EdgeInsets.all(1.5),
            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: selected ? c.ink : Colors.transparent, width: 1.8)),
            child: Avatar(name: item.avatarName!, size: 22),
          )
        : Icon(selected ? (item.activeIcon ?? item.icon) : item.icon, size: 24, color: color);
    if (item.badge > 0) {
      icon = Badge(
        backgroundColor: c.danger,
        offset: const Offset(8, -5),
        label: Text(item.badge > 99 ? '99+' : '${item.badge}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
        child: icon,
      );
    }
    return Semantics(
      selected: selected,
      button: true,
      label: item.badge > 0 ? '${item.label}, ${item.badge}' : item.label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        radius: 36,
        highlightShape: BoxShape.rectangle,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            width: selected ? 58 : 44,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? c.ink.withValues(alpha: 0.13) : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
            ),
            child: icon,
          ),
          const SizedBox(height: 3),
          Text(item.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, height: 1.1, color: color, fontWeight: selected ? FontWeight.w800 : FontWeight.w500)),
        ]),
      ),
    );
  }
}
