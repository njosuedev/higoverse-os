import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'theme.dart';
import 'ui.dart';

final _bytesCache = <String, Uint8List>{};

/// The bytes of a `data:` URL (product photos and logos come that way),
/// decoded once. Null for anything else; empty when it can't be decoded.
Uint8List? dataUrlBytes(String? d) {
  if (d == null || !d.startsWith('data:') || !d.contains(',')) return null;
  return _bytesCache[d] ??= (() {
    try {
      return base64Decode(d.substring(d.indexOf(',') + 1));
    } catch (_) {
      return Uint8List(0);
    }
  })();
}

/// An image from a data: or http(s) URL, or [fallback] when there is none
/// or it fails to load.
class UrlImage extends StatelessWidget {
  const UrlImage({super.key, required this.url, required this.fallback, this.fit = BoxFit.cover});
  final String? url;
  final Widget fallback;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final u = url;
    final bytes = dataUrlBytes(u);
    if (bytes != null) {
      return bytes.isEmpty
          ? fallback
          : Image.memory(bytes, fit: fit, gaplessPlayback: true, errorBuilder: (_, __, ___) => fallback);
    }
    if (u != null && (u.startsWith('https://') || u.startsWith('http://'))) {
      return Image.network(u, fit: fit, gaplessPlayback: true, errorBuilder: (_, __, ___) => fallback);
    }
    return fallback;
  }
}

/// A product's or vehicle's photo, or an icon on a soft background.
class ProductThumb extends StatelessWidget {
  const ProductThumb(this.url, {super.key, required this.isCar, this.width = 52, this.height = 40, this.radius = 8});
  final String? url;
  final bool isCar;
  final double width, height, radius;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        width: width,
        height: height,
        child: UrlImage(
          url: url,
          fallback: Container(
            color: c.paper,
            child: Icon(isCar ? Icons.directions_car_filled_outlined : Icons.inventory_2_outlined,
                color: c.faint, size: (height * 0.45).clamp(16, 40).toDouble()),
          ),
        ),
      ),
    );
  }
}

/// The business logo in a rounded square; its initials when there is none.
class ShopLogo extends StatelessWidget {
  const ShopLogo({super.key, required this.name, this.url, this.size = 36});
  final String name;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = Avatar.colorFor(name);
    final initials = Container(
      color: color,
      alignment: Alignment.center,
      child: Text(Avatar.initials(name),
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: size * 0.38, height: 1)),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.28),
        border: Border.all(color: Hgv.of(context).border.withValues(alpha: 0.8)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.28),
        child: UrlImage(url: url, fit: BoxFit.cover, fallback: initials),
      ),
    );
  }
}

/// A round grey icon button with an optional count badge — the top-bar
/// buttons (search, notifications).
class RoundIconButton extends StatelessWidget {
  const RoundIconButton({super.key, required this.icon, required this.tooltip, required this.onTap, this.badge = 0});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        child: Material(
          color: c.paper,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            // 44px: the smallest target a thumb hits reliably.
            child: SizedBox(
              width: 44,
              height: 44,
              child: Badge(
                isLabelVisible: badge > 0,
                offset: const Offset(4, -4),
                label: Text(badge > 99 ? '99+' : '$badge'),
                child: Center(child: Icon(icon, size: 21, color: c.text)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A section's bold title with an optional "See all" on the right.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction, this.count});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 18, 0, 8),
      child: Row(children: [
        Expanded(
          child: Row(children: [
            Flexible(
              child: Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, letterSpacing: -0.2)),
            ),
            if (count != null && count! > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                decoration: BoxDecoration(color: c.ink.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                child: Text('$count', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: c.ink)),
              ),
            ],
          ]),
        ),
        if (action != null)
          InkWell(
            borderRadius: BorderRadius.circular(6),
            onTap: onAction,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Text(action!, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.ink)),
            ),
          ),
      ]),
    );
  }
}
