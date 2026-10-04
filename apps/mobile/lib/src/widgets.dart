import 'package:flutter/material.dart';

import 'api.dart';
import 'i18n.dart';
import 'theme.dart';

export 'loading.dart';
export 'media.dart';
export 'ui.dart';

/// A failure as text in the app's language. The server's own messages are
/// shown as they come.
String errorText(T t, Object e) => e is ApiException && e.key != null ? t(e.key!, e.args) : '$e';

/// Section title used above cards and lists.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
        child: Row(children: [
          Expanded(
            child: Text(text.toUpperCase(),
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Hgv.of(context).muted)),
          ),
          if (trailing != null) trailing!,
        ]),
      );
}

/// One key figure: label, value, optional context line.
class FigureTile extends StatelessWidget {
  const FigureTile({super.key, required this.label, required this.value, this.detail, this.icon, this.color});
  final String label, value;
  final String? detail;
  final IconData? icon;
  final Color? color;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(label.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: Hgv.of(context).muted)),
              ),
              if (icon != null) Icon(icon, size: 16, color: color ?? Hgv.of(context).ink),
            ]),
            const SizedBox(height: 6),
            // Long amounts shrink to fit instead of being cut off.
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value, maxLines: 1, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color ?? Hgv.of(context).text)),
            ),
            if (detail != null) ...[
              const SizedBox(height: 2),
              Text(detail!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Hgv.of(context).faint)),
            ],
          ]),
        ),
      );
}

/// Small coloured label, e.g. a vehicle's status.
class StatusChip extends StatelessWidget {
  const StatusChip(this.text, this.color, {super.key});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
      );
}

/// Shown when a list has nothing, or loading failed.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.message, this.onRetry});
  final IconData icon;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
        child: Column(children: [
          Icon(icon, size: 36, color: Hgv.of(context).faint),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: Hgv.of(context).muted)),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: Text(T.of(context)('app.retry'))),
          ],
        ]),
      );
}

/// Nested circles around a short label: a soft outer halo, then a ring
/// holding the label — e.g. the quantity left on a stock alert, or initials.
class RingBadge extends StatelessWidget {
  const RingBadge({super.key, required this.color, required this.child, this.size = 38, this.solid = false});
  final Color color;
  final Widget child;
  final double size;

  /// Filled inner circle (white label) instead of a tinted one.
  final bool solid;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        padding: EdgeInsets.all(size * 0.09),
        decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.10)),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: solid ? color : color.withValues(alpha: 0.14),
            border: Border.all(color: color.withValues(alpha: solid ? 1 : 0.55), width: 1.5),
          ),
          child: DefaultTextStyle.merge(
            style: TextStyle(color: solid ? Colors.white : color, fontWeight: FontWeight.w800, fontSize: size * 0.32),
            child: FittedBox(fit: BoxFit.scaleDown, child: Padding(padding: const EdgeInsets.all(2), child: child)),
          ),
        ),
      );
}
