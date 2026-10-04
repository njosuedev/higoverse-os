import 'package:flutter/material.dart';

import '../i18n.dart';
import '../session.dart';
import '../theme.dart';
import '../ui.dart';
import 'live.dart';

/// "● Live" / "Connecting" / "Offline" — whether the screen updates by itself.
class LivePill extends StatelessWidget {
  const LivePill({super.key});

  @override
  Widget build(BuildContext context) {
    final live = LiveScope.of(context);
    if (live == null) return const SizedBox.shrink();
    final t = T.of(context);
    final c = Hgv.of(context);
    final (label, color) = switch (live.status) {
      LiveStatus.live => (t('live.live'), c.success),
      LiveStatus.connecting => (t('live.connecting'), c.warning),
      LiveStatus.offline => (t('live.offline'), c.faint),
    };
    return Semantics(
      label: label,
      child: Container(
        padding: const EdgeInsets.fromLTRB(4, 3, 10, 3),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          PulseDot(color: color, active: live.status == LiveStatus.live, size: 7),
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        ]),
      ),
    );
  }
}

/// Teammates with Higoverse open right now — like a messenger's "active"
/// row. Hidden when nobody else is online.
class ActiveNowRow extends StatelessWidget {
  const ActiveNowRow({super.key});

  @override
  Widget build(BuildContext context) {
    final live = LiveScope.of(context);
    final me = SessionScope.of(context).user?.id;
    final others = (live?.online ?? const <Teammate>[]).where((u) => u.id != me).toList();
    if (others.isEmpty) return const SizedBox.shrink();
    final t = T.of(context);
    final c = Hgv.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t('live.active_now'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.muted)),
        const SizedBox(height: 8),
        SizedBox(
          height: 70,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: others.length,
            separatorBuilder: (_, __) => const SizedBox(width: 14),
            itemBuilder: (context, i) {
              final u = others[i];
              final first = u.name.split(' ').first;
              return SizedBox(
                width: 56,
                child: Column(children: [
                  Avatar(name: u.name, size: 46, online: true),
                  const SizedBox(height: 5),
                  Text(first,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: c.muted, fontWeight: FontWeight.w600)),
                ]),
              );
            },
          ),
        ),
      ]),
    );
  }
}
