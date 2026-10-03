import 'package:flutter/material.dart';

import 'theme.dart';

/// Section title used above cards and lists.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 18, 2, 8),
        child: Row(children: [
          Expanded(
            child: Text(text.toUpperCase(),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Brand.muted)),
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
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(label.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: Brand.muted)),
              ),
              if (icon != null) Icon(icon, size: 16, color: color ?? Brand.ink),
            ]),
            const SizedBox(height: 6),
            // Long amounts shrink to fit instead of being cut off.
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value, maxLines: 1, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color ?? Brand.text)),
            ),
            if (detail != null) ...[
              const SizedBox(height: 2),
              Text(detail!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Brand.faint)),
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
          Icon(icon, size: 36, color: Brand.faint),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted)),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ]),
      );
}

/// Grey placeholder block while something loads.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.height = 64});
  final double height;

  @override
  Widget build(BuildContext context) => Container(
        height: height,
        decoration: BoxDecoration(color: const Color(0xFFE8E7E4), borderRadius: BorderRadius.circular(8)),
      );
}
