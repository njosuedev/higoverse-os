import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'i18n.dart';
import 'theme.dart';

/// Drives every [Bone] below it with one animation and one gradient laid
/// over the whole area, so the placeholders read as one surface with a single
/// light passing across it (Flutter cookbook "shimmer loading"), not as
/// blocks flashing one by one. With animations turned off (Android "Remove
/// animations") the bones stay still. Screen readers hear "Loading" once and
/// never the placeholders.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});
  final Widget child;

  /// One pass of the light, left to right: slow enough to read as progress,
  /// not as flashing.
  static const period = Duration(milliseconds: 1500);

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: Shimmer.period)..repeat();
  final _area = GlobalKey();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
        label: T.of(context)('app.loading'),
        liveRegion: true,
        child: ExcludeSemantics(
          child: _ShimmerScope(
            animation: _c,
            area: _area,
            child: KeyedSubtree(key: _area, child: widget.child),
          ),
        ),
      );
}

class _ShimmerScope extends InheritedWidget {
  const _ShimmerScope({required this.animation, required this.area, required super.child});
  final Animation<double> animation;

  /// The [Shimmer]'s own box: every bone paints its slice of one gradient
  /// spread over it.
  final GlobalKey area;

  @override
  bool updateShouldNotify(_ShimmerScope old) => old.animation != animation || old.area != area;
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
    final scope = context.dependOnInheritedWidgetOfExactType<_ShimmerScope>();
    final still = scope == null || MediaQuery.maybeDisableAnimationsOf(context) == true;
    final w = circle ? height : width;
    final shape = circle ? BoxShape.circle : BoxShape.rectangle;
    final corners = circle ? null : BorderRadius.circular(radius);
    if (still) {
      return Container(width: w, height: height, decoration: BoxDecoration(shape: shape, borderRadius: corners, color: c.skeleton));
    }
    return AnimatedBuilder(
      animation: scope.animation,
      builder: (context, _) => Container(
        width: w,
        height: height,
        decoration: BoxDecoration(
          shape: shape,
          borderRadius: corners,
          gradient: LinearGradient(
            // A soft diagonal band: the highlight takes a fifth of the area.
            begin: const Alignment(-1, -0.3),
            end: const Alignment(1, 0.3),
            colors: [c.skeleton, c.skeletonHi, c.skeleton],
            stops: const [0.4, 0.5, 0.6],
            transform: _Sweep(scope.animation.value, _areaFrom(context, scope.area)),
          ),
        ),
      ),
    );
  }

  /// The [Shimmer]'s box as seen from this bone (null until both are laid out).
  static Rect? _areaFrom(BuildContext bone, GlobalKey area) {
    final me = bone.findRenderObject();
    final all = area.currentContext?.findRenderObject();
    if (me is! RenderBox || all is! RenderBox || !me.attached || !all.attached || !me.hasSize || !all.hasSize) return null;
    final at = me.localToGlobal(Offset.zero, ancestor: all);
    return Rect.fromLTWH(-at.dx, -at.dy, all.size.width, all.size.height);
  }
}

/// Lays the gradient over the whole [Shimmer] area (not just this bone) and
/// moves the light across it: from off the left edge to off the right edge.
class _Sweep extends GradientTransform {
  const _Sweep(this.t, this.area);
  final double t;

  /// The shimmer's box relative to this bone; null paints the bone on its own.
  final Rect? area;

  @override
  Matrix4? transform(Rect bounds, {TextDirection? textDirection}) {
    final a = area;
    if (a == null || bounds.width <= 0 || bounds.height <= 0) {
      return Matrix4.translationValues(bounds.width * (t * 2 - 1), 0, 0);
    }
    // Map the bone's rect onto the area's (both in the bone's coordinates),
    // then slide by up to one area width either way.
    return Matrix4.translationValues(bounds.left + a.left + a.width * (t * 2 - 1), bounds.top + a.top, 0)
      ..multiply(Matrix4.diagonal3Values(a.width / bounds.width, a.height / bounds.height, 1))
      ..multiply(Matrix4.translationValues(-bounds.left, -bounds.top, 0));
  }
}

/// Shows [skeleton] while [loading], following the usual guidance for
/// skeleton screens:
/// - nothing for the first [delay]: a fast answer never flashes a skeleton;
/// - once shown, the skeleton stays at least [minShown], so it never blinks;
/// - the real content fades in over it.
class SkeletonGate extends StatefulWidget {
  const SkeletonGate({
    super.key,
    required this.loading,
    required this.skeleton,
    required this.child,
    this.delay = const Duration(milliseconds: 180),
    this.minShown = const Duration(milliseconds: 450),
  });

  final bool loading;
  final Widget skeleton, child;
  final Duration delay, minShown;

  @override
  State<SkeletonGate> createState() => _SkeletonGateState();
}

class _SkeletonGateState extends State<SkeletonGate> {
  Timer? _timer;
  DateTime? _shownAt;

  /// The skeleton is on screen (possibly held after loading ended).
  bool get _showing => _shownAt != null;

  @override
  void initState() {
    super.initState();
    if (widget.loading) _arm();
  }

  @override
  void didUpdateWidget(SkeletonGate old) {
    super.didUpdateWidget(old);
    if (widget.loading == old.loading) return;
    _timer?.cancel();
    if (widget.loading) {
      if (!_showing) _arm();
    } else if (_showing) {
      final left = widget.minShown - DateTime.now().difference(_shownAt!);
      if (left > Duration.zero) {
        _timer = Timer(left, () => setState(() => _shownAt = null));
      } else {
        _shownAt = null;
      }
    }
  }

  void _arm() => _timer = Timer(widget.delay, () => setState(() => _shownAt = DateTime.now()));

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final (key, child) = _showing
        ? ('skeleton', widget.skeleton)
        : widget.loading
            ? ('wait', const SizedBox.shrink())
            : ('content', widget.child);
    final still = MediaQuery.maybeDisableAnimationsOf(context) == true;
    return AnimatedSwitcher(
      duration: still ? Duration.zero : const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOut,
      switchOutCurve: Curves.easeIn,
      layoutBuilder: (current, previous) => Stack(alignment: Alignment.topCenter, children: [...previous, if (current != null) current]),
      child: KeyedSubtree(key: ValueKey(key), child: child),
    );
  }
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

/// The whole app while it starts: top bar, stories, the day's card, the
/// status tiles and the tab bar, all as placeholders — no spinner.
class AppSkeleton extends StatelessWidget {
  const AppSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Scaffold(
      backgroundColor: c.chrome,
      body: Shimmer(
        child: Column(children: [
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 10, 6),
              child: Row(children: [
                const Bone(width: 32, height: 32, radius: 9),
                const SizedBox(width: 8),
                const Bone(width: 120, height: 20, radius: 6),
                const Spacer(),
                for (var i = 0; i < 2; i++) ...const [SizedBox(width: 8), Bone(height: 44, circle: true)],
              ]),
            ),
          ),
          Divider(height: 1, thickness: 0.6, color: c.border),
          Expanded(
            child: ListView(
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              children: [
                const SizedBox(
                  height: 150,
                  child: Row(children: [
                    SizedBox(width: 112, child: Bone(height: 150, radius: 14)),
                    SizedBox(width: 8),
                    SizedBox(width: 112, child: Bone(height: 150, radius: 14)),
                    SizedBox(width: 8),
                    SizedBox(width: 112, child: Bone(height: 150, radius: 14)),
                  ]),
                ),
                const SizedBox(height: 8),
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Bone(width: 50, height: 9),
                      SizedBox(height: 10),
                      Bone(width: 180, height: 24, radius: 7),
                      SizedBox(height: 8),
                      Bone(width: 110, height: 9),
                      SizedBox(height: 16),
                      Bone(height: 90, radius: 8),
                    ]),
                  ),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  for (var i = 0; i < 4; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    const Expanded(
                      child: Card(
                        child: Padding(
                          padding: EdgeInsets.all(10),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Bone(height: 26, circle: true),
                            SizedBox(height: 8),
                            Bone(width: 24, height: 16),
                            SizedBox(height: 6),
                            Bone(width: 50, height: 9),
                          ]),
                        ),
                      ),
                    ),
                  ],
                ]),
              ],
            ),
          ),
          Divider(height: 1, thickness: 0.6, color: c.border),
          SafeArea(
            top: false,
            child: SizedBox(
              height: 54,
              child: Row(children: [
                for (var i = 0; i < 4; i++)
                  const Expanded(
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Bone(width: 24, height: 24, radius: 7),
                      SizedBox(height: 5),
                      Bone(width: 40, height: 8),
                    ]),
                  ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}
