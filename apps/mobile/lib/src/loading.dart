import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'i18n.dart';
import 'theme.dart';

/// Drives every [Bone] below it with one animation, so all placeholders on a
/// screen shimmer together — like the website's Reports skeleton.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});
  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
        label: T.of(context)('app.loading'),
        liveRegion: true,
        child: ExcludeSemantics(child: _ShimmerScope(animation: _c, child: widget.child)),
      );
}

class _ShimmerScope extends InheritedWidget {
  const _ShimmerScope({required this.animation, required super.child});
  final Animation<double> animation;

  @override
  bool updateShouldNotify(_ShimmerScope old) => old.animation != animation;
}

/// One placeholder block. Compose these into a screen-shaped skeleton inside
/// a [Shimmer]. Follows the light / dark appearance.
class Bone extends StatelessWidget {
  const Bone({super.key, this.width, this.height = 10, this.radius = 5, this.circle = false});
  final double? width;
  final double height, radius;
  final bool circle;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final anim = context.dependOnInheritedWidgetOfExactType<_ShimmerScope>()?.animation;
    final still = anim == null || MediaQuery.maybeDisableAnimationsOf(context) == true;
    BoxDecoration deco(double t) => BoxDecoration(
          shape: circle ? BoxShape.circle : BoxShape.rectangle,
          borderRadius: circle ? null : BorderRadius.circular(radius),
          color: still ? c.skeleton : null,
          gradient: still
              ? null
              : LinearGradient(
                  colors: [c.skeleton, c.skeletonHi, c.skeleton],
                  stops: const [0.25, 0.5, 0.75],
                  transform: _Sweep(t),
                ),
        );
    final size = circle ? height : null;
    if (still) return Container(width: size ?? width, height: height, decoration: deco(0));
    return AnimatedBuilder(
      animation: anim,
      builder: (_, __) => Container(width: size ?? width, height: height, decoration: deco(anim.value)),
    );
  }
}

/// Moves the highlight from off the left edge to off the right edge.
class _Sweep extends GradientTransform {
  const _Sweep(this.t);
  final double t;

  @override
  Matrix4? transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.translationValues(bounds.width * (t * 2 - 1), 0, 0);
}

/// Placeholder for a [FigureTile]: icon, label, amount, context line.
class FigureTileSkeleton extends StatelessWidget {
  const FigureTileSkeleton({super.key, this.detail = true});
  final bool detail;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            const Row(children: [
              Expanded(child: Align(alignment: Alignment.centerLeft, child: Bone(width: 64, height: 9))),
              Bone(width: 18, height: 18, radius: 6),
            ]),
            const SizedBox(height: 10),
            const Bone(width: 96, height: 18),
            if (detail) ...const [SizedBox(height: 8), Bone(height: 8)],
          ]),
        ),
      );
}

/// Placeholder for one list row: optional picture or badge, two lines, an amount.
class RowSkeleton extends StatelessWidget {
  const RowSkeleton({super.key, this.leading = RowLead.none, this.titleWidth = 150, this.chips = false});
  final RowLead leading;
  final double titleWidth;
  final bool chips;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(children: [
          if (leading == RowLead.thumb) ...const [Bone(width: 52, height: 40, radius: 8), SizedBox(width: 16)],
          if (leading == RowLead.circle) ...const [Bone(height: 34, circle: true), SizedBox(width: 16)],
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Bone(width: titleWidth, height: 12),
              const SizedBox(height: 8),
              if (chips)
                const Row(children: [Bone(width: 58, height: 16, radius: 10), SizedBox(width: 6), Bone(width: 90, height: 9)])
              else
                const Bone(width: 110, height: 9),
            ]),
          ),
          const SizedBox(width: 12),
          const Bone(width: 72, height: 12),
        ]),
      );
}

enum RowLead { none, thumb, circle }

/// A whole list loading: [count] rows with dividers, varied widths.
class ListSkeleton extends StatelessWidget {
  const ListSkeleton({super.key, this.count = 8, this.leading = RowLead.none, this.chips = false});
  final int count;
  final RowLead leading;
  final bool chips;

  static const _widths = [150.0, 120.0, 170.0, 105.0, 140.0, 160.0, 115.0, 135.0];

  @override
  Widget build(BuildContext context) => Shimmer(
        child: Column(children: [
          for (var i = 0; i < count; i++) ...[
            if (i > 0) const Divider(indent: 16, endIndent: 16),
            RowSkeleton(leading: leading, titleWidth: _widths[i % _widths.length], chips: chips),
          ],
        ]),
      );
}

/// Loading indicator of nested circles: three rings turning at different
/// speeds and directions, each over a faint track.
class RingsLoader extends StatefulWidget {
  const RingsLoader({super.key, this.size = 28, this.color});
  final double size;

  /// Defaults to the brand blue of the current appearance.
  final Color? color;

  @override
  State<RingsLoader> createState() => _RingsLoaderState();
}

class _RingsLoaderState extends State<RingsLoader> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? Hgv.of(context).ink;
    return Semantics(
      label: T.of(context)('app.loading'),
      child: SizedBox.square(
        dimension: widget.size,
        child: RepaintBoundary(
          child: CustomPaint(painter: _RingsPainter(_c, color)),
        ),
      ),
    );
  }
}

class _RingsPainter extends CustomPainter {
  _RingsPainter(this.t, this.color) : super(repaint: t);
  final Animation<double> t;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final stroke = math.max(1.6, size.shortestSide * 0.085);
    final outer = size.shortestSide / 2 - stroke / 2;
    // (radius, sweep, turns per cycle, opacity) — inner rings spin the other way, faster.
    final rings = [
      (outer, math.pi * 1.35, 1.0, 1.0),
      (outer * 0.64, math.pi * 1.0, -1.5, 0.8),
      (outer * 0.28, math.pi * 0.8, 2.0, 0.6),
    ];
    for (final (r, sweep, turns, alpha) in rings) {
      if (r <= stroke / 2) continue;
      final rect = Rect.fromCircle(center: center, radius: r);
      final track = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..color = color.withValues(alpha: 0.14 * alpha);
      canvas.drawCircle(center, r, track);
      final arc = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..color = color.withValues(alpha: alpha);
      canvas.drawArc(rect, t.value * turns * 2 * math.pi - math.pi / 2, sweep, false, arc);
    }
  }

  @override
  bool shouldRepaint(_RingsPainter old) => old.color != color || old.t != t;
}

/// "Loading more" row at the end of a list.
class LoadMoreIndicator extends StatelessWidget {
  const LoadMoreIndicator({super.key});

  @override
  Widget build(BuildContext context) =>
      const Padding(padding: EdgeInsets.all(18), child: Center(child: RingsLoader(size: 26)));
}
