import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'format.dart';
import 'i18n.dart';
import 'session.dart';
import 'sheets.dart';
import 'theme.dart';

/// Low and empty stock as overlapping circles — the same as the website's
/// home (StockAlertCircles): the count in the middle, the ring filled against
/// the low-stock level (red when empty), emptiest first. Tapping a circle
/// brings it forward and shows it below; "View" opens it. "+N" opens the list.
class StockCircles extends StatefulWidget {
  const StockCircles({super.key, required this.items, required this.total, required this.onAll});
  final List<Map<String, dynamic>> items;
  final int total;
  final VoidCallback onAll;

  @override
  State<StockCircles> createState() => _StockCirclesState();
}

class _StockCirclesState extends State<StockCircles> {
  int _active = 0;

  static const _size = 48.0, _overlap = 12.0;

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final c = Hgv.of(context);
    final items = [...widget.items]..sort((a, b) => _qty(a).compareTo(_qty(b)));
    if (items.isEmpty) return const SizedBox.shrink();
    final active = _active.clamp(0, items.length - 1);
    final extra = widget.total - items.length;
    final count = items.length + (extra > 0 ? 1 : 0);
    final it = items[active];
    final q = _qty(it);
    final left = q <= 0 ? t('dash.out_of_stock') : t('dash.left', {'n': groupDigits(q)});

    // Drawn back to front so the active circle sits on top of its neighbours.
    final order = [for (var i = 0; i < items.length; i++) if (i != active) i, active];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(
        height: _size + 8,
        width: double.infinity,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SizedBox(
            width: _size + (count - 1) * (_size - _overlap) + 4,
            height: _size + 8,
            child: Stack(clipBehavior: Clip.none, children: [
              if (extra > 0)
                Positioned(
                  left: items.length * (_size - _overlap),
                  top: 6,
                  child: GestureDetector(
                    onTap: widget.onAll,
                    child: Container(
                      width: _size,
                      height: _size,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: c.paper, border: Border.all(color: c.surface, width: 2.5)),
                      child: Text('+$extra', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                    ),
                  ),
                ),
              for (final i in order)
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 180),
                  left: i * (_size - _overlap),
                  top: i == active ? 0 : 6,
                  child: Semantics(
                    button: true,
                    selected: i == active,
                    label: '${items[i]['name'] ?? ''}: ${_qty(items[i]) <= 0 ? t('dash.out_of_stock') : t('dash.left', {'n': _qty(items[i])})}',
                    child: GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        if (i == active) {
                          openItem(context, items[i]);
                        } else {
                          setState(() => _active = i);
                        }
                      },
                      child: _Ring(qty: _qty(items[i]), level: s.lowStock, size: _size),
                    ),
                  ),
                ),
            ]),
          ),
        ),
      ),
      const SizedBox(height: 8),
      AnimatedSwitcher(
        duration: const Duration(milliseconds: 160),
        child: Row(key: ValueKey(it['id']), children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${it['name'] ?? ''}',
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
              Text.rich(
                TextSpan(children: [
                  TextSpan(text: left, style: TextStyle(fontWeight: FontWeight.w700, color: q <= 0 ? c.danger : c.warning)),
                  TextSpan(text: ' · ${money(it['selling_price'] as num? ?? 0, s.currency)}'),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.5, color: c.muted),
              ),
            ]),
          ),
          const SizedBox(width: 8),
          Material(
            color: c.danger.withValues(alpha: 0.10),
            shape: const StadiumBorder(),
            child: InkWell(
              customBorder: const StadiumBorder(),
              onTap: () => openItem(context, it),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                child: Text(t('story.view_short'), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: c.danger)),
              ),
            ),
          ),
        ]),
      ),
    ]);
  }

  static num _qty(Map<String, dynamic> m) => m['quantity'] as num? ?? 0;
}

/// One circle: track, the arc filled to quantity ÷ low-stock level, the
/// count in the middle; red when empty. A white rim separates overlapping
/// circles.
class _Ring extends StatelessWidget {
  const _Ring({required this.qty, required this.level, required this.size});
  final num qty;
  final int level;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final empty = qty <= 0;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: empty ? Color.alphaBlend(c.danger.withValues(alpha: 0.12), c.surface) : c.surface,
        border: Border.all(color: c.surface, width: 2.5),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 4, offset: Offset(0, 1))],
      ),
      child: CustomPaint(
        painter: _RingPainter(
          done: empty ? 0 : (qty / math.max(1, level)).toDouble(),
          track: empty ? c.danger : c.border,
          color: c.warning,
        ),
        child: Center(
          child: Text(groupDigits(qty),
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: size * 0.3, color: empty ? c.danger : c.text)),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.done, required this.track, required this.color});
  final double done;
  final Color track, color;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 3.2;
    final rect = Offset.zero & size;
    final r = rect.deflate(stroke / 2 + 1);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(r, 0, math.pi * 2, false, paint..color = track);
    if (done > 0) canvas.drawArc(r, -math.pi / 2, math.pi * 2 * done.clamp(0, 1), false, paint..color = color);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.done != done || old.track != track || old.color != color;
}
