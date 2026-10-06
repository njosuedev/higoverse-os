import 'package:flutter/material.dart';

import 'package:phosphor_icons/phosphor_icons.dart';

import 'theme.dart';

/// A person's initials in a circle, coloured from their name so everyone
/// keeps the same colour. Optional small badge (bottom right) and an
/// "online" dot — like a notification or a chat list.
class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, this.size = 40, this.badge, this.badgeColor, this.online = false});
  final String name;
  final double size;
  final IconData? badge;
  final Color? badgeColor;
  final bool online;

  static const _palette = [
    Color(0xFF0A66C2), Color(0xFF7A3E9D), Color(0xFF057642), Color(0xFFB24020),
    Color(0xFF00788A), Color(0xFF915907), Color(0xFF5E5CE6), Color(0xFFC3277A),
  ];

  static Color colorFor(String name) {
    var h = 0;
    for (final c in name.toLowerCase().codeUnits) {
      h = (h * 31 + c) & 0x7fffffff;
    }
    return _palette[h % _palette.length];
  }

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final first = parts.first.characters.first;
    final last = parts.length > 1 ? parts.last.characters.first : '';
    return (first + last).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final color = colorFor(name);
    final b = size * 0.44;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(clipBehavior: Clip.none, children: [
        Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.14)),
          child: Text(initials(name),
              style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: size * 0.36, height: 1)),
        ),
        if (badge != null)
          Positioned(
            right: -3,
            bottom: -3,
            child: Container(
              width: b,
              height: b,
              decoration: BoxDecoration(
                  shape: BoxShape.circle, color: badgeColor ?? c.ink, border: Border.all(color: c.surface, width: 2)),
              child: Icon(badge, size: b * 0.56, color: Colors.white),
            ),
          ),
        if (online)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: size * 0.28,
              height: size * 0.28,
              decoration: BoxDecoration(
                  shape: BoxShape.circle, color: c.success, border: Border.all(color: c.surface, width: 2)),
            ),
          ),
      ]),
    );
  }
}

/// An icon in a tinted circle with an optional badge — for entries that
/// no person made (e.g. "running low").
class IconAvatar extends StatelessWidget {
  const IconAvatar({super.key, required this.icon, required this.color, this.size = 40});
  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.13)),
        child: Icon(icon, color: color, size: size * 0.5),
      );
}

/// A small dot that breathes while [active] — the "live" signal.
class PulseDot extends StatefulWidget {
  const PulseDot({super.key, required this.color, this.active = true, this.size = 8});
  final Color color;
  final bool active;
  final double size;

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600));

  @override
  void initState() {
    super.initState();
    if (widget.active) _c.repeat();
  }

  @override
  void didUpdateWidget(PulseDot old) {
    super.didUpdateWidget(old);
    if (widget.active && !_c.isAnimating) _c.repeat();
    if (!widget.active && _c.isAnimating) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.maybeDisableAnimationsOf(context) == true;
    final s = widget.size;
    return SizedBox(
      width: s * 2.2,
      height: s * 2.2,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => Stack(alignment: Alignment.center, children: [
          if (widget.active && !still)
            Container(
              width: s * (1 + 1.2 * _c.value),
              height: s * (1 + 1.2 * _c.value),
              decoration:
                  BoxDecoration(shape: BoxShape.circle, color: widget.color.withValues(alpha: 0.35 * (1 - _c.value))),
            ),
          Container(width: s, height: s, decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color)),
        ]),
      ),
    );
  }
}

/// Up or down compared with before: "↑ 12%" in green, "↓ 5%" in red.
class DeltaChip extends StatelessWidget {
  const DeltaChip(this.percent, {super.key, this.suffix});
  final double percent;
  final String? suffix;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final up = percent >= 0;
    final color = up ? c.success : c.danger;
    final abs = percent.abs();
    final value = abs >= 100 ? '${abs.round()}' : abs.toStringAsFixed(abs >= 10 ? 0 : 1);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(up ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded, size: 13, color: color),
          const SizedBox(width: 2),
          Text('$value%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: color)),
        ]),
      ),
      if (suffix != null) ...[
        const SizedBox(width: 6),
        Flexible(child: Text(suffix!, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.faint))),
      ],
    ]);
  }
}

/// Briefly tints its child when it first appears with [flash] set — how a
/// row that just arrived live draws the eye, then settles.
class Flash extends StatefulWidget {
  const Flash({super.key, required this.flash, required this.child});
  final bool flash;
  final Widget child;

  @override
  State<Flash> createState() => _FlashState();
}

class _FlashState extends State<Flash> {
  late bool _on = widget.flash;

  @override
  void initState() {
    super.initState();
    if (_on) {
      Future.delayed(const Duration(milliseconds: 1600), () {
        if (mounted) setState(() => _on = false);
      });
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedContainer(
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeOut,
        color: _on ? Hgv.of(context).ink.withValues(alpha: 0.10) : Colors.transparent,
        child: widget.child,
      );
}

/// Floating "↑ 3 new sales" pill over a list.
class NewItemsPill extends StatelessWidget {
  const NewItemsPill({super.key, required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Hgv.of(context).ink,
        elevation: 3,
        shadowColor: Colors.black38,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.arrow_upward_rounded, size: 16, color: Colors.white),
              const SizedBox(width: 6),
              Flexible(
                child: Text(label,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            ]),
          ),
        ),
      );
}

/// Label on the left, value on the right — the rows of a details sheet.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.valueColor, this.strong = false});
  final String label, value;
  final Color? valueColor;
  final bool strong;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
              flex: 4, child: Text(label, style: TextStyle(color: Hgv.of(context).muted, fontWeight: FontWeight.w500))),
          const SizedBox(width: 12),
          Expanded(
            flex: 6,
            child: Text(value,
                textAlign: TextAlign.right,
                style: TextStyle(
                    fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
                    fontSize: strong ? 16 : 14,
                    color: valueColor ?? Hgv.of(context).text)),
          ),
        ]),
      );
}

/// A rounded card with a title row — the dashboard's building block.
class Panel extends StatelessWidget {
  const Panel({super.key, this.title, this.trailing, required this.child, this.padding = const EdgeInsets.all(12), this.onTap});
  final String? title;
  final Widget? trailing;
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final body = Padding(
      padding: padding,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        if (title != null) ...[
          Row(children: [
            Expanded(
                child: Text(title!, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: -0.2))),
            if (trailing != null) trailing!,
          ]),
          const SizedBox(height: 8),
        ],
        child,
      ]),
    );
    return Card(
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? body : InkWell(onTap: onTap, child: body),
    );
  }
}

/// An unread count the way Facebook draws it: white bold figures on its red,
/// a pill that grows with the number ("99+" at most), set apart from the
/// icon by a ring in the bar's colour. Nothing at 0.
class CountBadge extends StatelessWidget {
  const CountBadge({super.key, required this.count, this.ring});
  final int count;

  /// The colour behind the badge (default: the page's).
  final Color? ring;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
      padding: const EdgeInsets.symmetric(horizontal: 5),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: notifyRed,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: ring ?? Hgv.of(context).chrome, width: 2),
      ),
      child: Text(count > 99 ? '99+' : '$count',
          style: const TextStyle(color: Colors.white, fontSize: 11, height: 1.1, fontWeight: FontWeight.w800)),
    );
  }
}

/// "Something new here" without a number: a small red dot (Instagram puts it
/// under the tab's icon).
class NewDot extends StatelessWidget {
  const NewDot({super.key, this.size = 6});
  final double size;

  @override
  Widget build(BuildContext context) =>
      Container(width: size, height: size, decoration: const BoxDecoration(shape: BoxShape.circle, color: notifyRed));
}

/// [child] with [CountBadge] over its top-right corner.
class WithCount extends StatelessWidget {
  const WithCount({super.key, required this.count, required this.child, this.dx = -8, this.dy = -7, this.ring});
  final int count;
  final Widget child;
  final double dx, dy;
  final Color? ring;

  @override
  Widget build(BuildContext context) => Stack(clipBehavior: Clip.none, children: [
        child,
        if (count > 0) Positioned(right: dx, top: dy, child: CountBadge(count: count, ring: ring)),
      ]);
}

/// The app's search field: one style everywhere, as the big apps do — a
/// filled, fully rounded box (no outline), the magnifying glass in front,
/// a clear button once something is typed, a thin ring only while typing.
class SearchField extends StatefulWidget {
  const SearchField({
    super.key,
    required this.controller,
    required this.hint,
    this.onChanged,
    this.onSubmitted,
    this.focusNode,
    this.autofocus = false,
  });
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged, onSubmitted;
  final FocusNode? focusNode;
  final bool autofocus;

  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fill = dark ? const Color(0xFF25292E) : const Color(0xFFEFEFEF);
    final shape = OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none);
    return SizedBox(
      height: 44,
      child: TextField(
        controller: widget.controller,
        focusNode: widget.focusNode,
        autofocus: widget.autofocus,
        onChanged: widget.onChanged,
        onSubmitted: widget.onSubmitted,
        textInputAction: TextInputAction.search,
        textAlignVertical: TextAlignVertical.center,
        style: TextStyle(fontSize: 15, color: c.text),
        cursorColor: c.ink,
        decoration: InputDecoration(
          isCollapsed: true,
          filled: true,
          fillColor: fill,
          hintText: widget.hint,
          hintStyle: TextStyle(fontSize: 15, color: c.faint),
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
          prefixIcon: Icon(PhosphorIconsRegular.magnifyingGlass, size: 19, color: c.faint),
          prefixIconConstraints: const BoxConstraints(minWidth: 42),
          suffixIcon: widget.controller.text.isEmpty
              ? null
              : IconButton(
                  tooltip: MaterialLocalizations.of(context).deleteButtonTooltip,
                  icon: Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: c.faint.withValues(alpha: 0.35)),
                    child: Icon(Icons.close_rounded, size: 14, color: c.text),
                  ),
                  onPressed: () {
                    widget.controller.clear();
                    widget.onChanged?.call('');
                  },
                ),
          border: shape,
          enabledBorder: shape,
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.ink.withValues(alpha: 0.6))),
        ),
      ),
    );
  }
}
