import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import '../chat/chat_service.dart';
import '../i18n.dart';
import '../screens/chat_screen.dart';
import '../screens/messages_screen.dart' show roleLabel;
import '../session.dart';
import '../theme.dart';
import '../ui.dart';
import '../widgets.dart';
import 'live.dart';
import 'scoped_route.dart';

/// The live connection's colour: green when live, amber while connecting,
/// grey when offline.
Color liveColor(Hgv c, LiveStatus? status) => switch (status) {
      LiveStatus.live => c.success,
      LiveStatus.connecting => c.warning,
      _ => c.faint,
    };

/// Held on the logo: whether updates arrive live, and who of the team is
/// online now (tap one to write to them). Offline, a button reconnects.
Future<void> showLiveSheet(BuildContext context) {
  final live = LiveScope.read(context);
  final session = SessionScope.of(context);
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    backgroundColor: Hgv.of(context).elevated,
    builder: (sheet) => ListenableBuilder(
      listenable: Listenable.merge([if (live != null) live, ChatService.of(session)]),
      builder: (sheet, _) {
        final t = T.of(sheet);
        final c = Hgv.of(sheet);
        final status = live?.status;
        final me = session.user?.id;
        final online = (live?.online ?? const <Teammate>[]).where((u) => u.id != me).toList();
        final members = {for (final m in ChatService.of(session).others) m.id: m};
        final (label, sub) = switch (status) {
          LiveStatus.live => (t('live.status_live'), t('live.live_sub')),
          LiveStatus.connecting => (t('live.status_connecting'), t('live.connecting_sub')),
          _ => (t('live.status_offline'), t('live.offline_sub')),
        };
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              PulseDot(color: liveColor(c, status), active: status == LiveStatus.live, size: 12),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  Text(sub, style: TextStyle(color: c.muted)),
                ]),
              ),
              if (status == LiveStatus.offline && live != null)
                TextButton(onPressed: live.start, child: Text(t('live.reconnect'))),
            ]),
            const SizedBox(height: 18),
            Text(t('live.active_now'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.muted)),
            const SizedBox(height: 4),
            if (online.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 14),
                child: Text(t('live.nobody'), style: TextStyle(color: c.faint)),
              )
            else
              for (final u in online)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Avatar(name: u.name, size: 42, online: true),
                  title: Text(u.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(roleLabel(t, u.role)),
                  trailing: members[u.id] == null ? null : Icon(PhosphorIconsRegular.chatCircleDots, color: c.ink),
                  onTap: members[u.id] == null
                      ? null
                      : () {
                          Navigator.pop(sheet);
                          pushScoped<void>(context, ChatScreen(member: members[u.id]!));
                        },
                ),
          ]),
        );
      },
    ),
  );
}
