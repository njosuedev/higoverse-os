import 'package:flutter/material.dart';

import 'theme.dart';

/// One bar of [WeekBars].
class DayValue {
  const DayValue(this.day, this.value, this.label);
  final DateTime day;
  final double value;
  final String label;
}

/// Seven bars, oldest to today. Today is solid brand blue, the other days a
/// lighter tint; tapping a bar selects it ([onSelect]) so the card above can
/// show that day's figure. Zero days keep a thin stub so the week reads.
class WeekBars extends StatelessWidget {
  const WeekBars({super.key, required this.days, required this.selected, required this.onSelect, this.height = 120});
  final List<DayValue> days;
  final int selected;
  final ValueChanged<int> onSelect;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final max = days.fold<double>(0, (m, d) => d.value > m ? d.value : m);
    return SizedBox(
      height: height + 24,
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (var i = 0; i < days.length; i++)
          Expanded(
            child: Semantics(
              button: true,
              selected: i == selected,
              label: days[i].label,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onSelect(i),
                child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: max <= 0 ? 0 : days[i].value / max),
                    duration: const Duration(milliseconds: 500),
                    curve: Curves.easeOutCubic,
                    builder: (context, f, _) => Container(
                      width: 22,
                      height: 4 + (height - 4) * f,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(6),
                        color: i == selected ? c.ink : c.ink.withValues(alpha: 0.22),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(days[i].label,
                      maxLines: 1,
                      overflow: TextOverflow.clip,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: i == selected ? FontWeight.w800 : FontWeight.w500,
                        color: i == selected ? c.text : c.faint,
                      )),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}

/// A thin rounded progress bar (top sellers, debts paid, stock level).
class Meter extends StatelessWidget {
  const Meter({super.key, required this.value, this.color, this.height = 6});
  final double value;
  final Color? color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(height),
      child: LinearProgressIndicator(
        value: value.clamp(0, 1).toDouble(),
        minHeight: height,
        backgroundColor: c.border.withValues(alpha: 0.6),
        valueColor: AlwaysStoppedAnimation(color ?? c.ink),
      ),
    );
  }
}
