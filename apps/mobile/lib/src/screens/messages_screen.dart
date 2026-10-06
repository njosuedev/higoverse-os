import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import '../chat/chat_service.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'chat_screen.dart';
import 'team_screen.dart';

String roleLabel(T t, String role) =>
    const {'owner', 'admin', 'manager', 'cashier', 'staff', 'storekeeper', 'accountant'}.contains(role) ? t('role.$role') : role;

/// Messages: the business's people (owner and up to three employees), the
/// last message with each, unread counts and who is online. End-to-end
/// encrypted: only the phones and computers of the two people can read.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  final _q = TextEditingController();
  ChatService? _chat;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final s = SessionScope.of(context);
    _chat ??= ChatService.of(s)..start(LiveScope.read(context));
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    final chat = _chat!;
    await chat.start(LiveScope.read(context));
    await Future.wait([chat.loadTeam(), chat.loadConversations()]);
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final live = LiveScope.of(context);
    final online = {for (final m in live?.online ?? const []) m.id};
    return ListenableBuilder(
      listenable: _chat!,
      builder: (context, _) {
        final chat = _chat!;
        final q = _q.text.trim().toLowerCase();
        final people = chat.others.where((m) => q.isEmpty || m.name.toLowerCase().contains(q)).toList()
          ..sort((a, b) {
            final la = chat.threads[a.id]?.lastOrNull?.at, lb = chat.threads[b.id]?.lastOrNull?.at;
            if (la != null && lb != null) return lb.compareTo(la);
            if (la != null) return -1;
            if (lb != null) return 1;
            return a.name.toLowerCase().compareTo(b.name.toLowerCase());
          });
        final loading = chat.members.isEmpty && chat.error == null;
        return Scaffold(
          body: RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.only(bottom: 24), children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Row(children: [
                  Expanded(child: Text(t('chat.title'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4))),
                  if (chat.canManage)
                    TextButton.icon(
                      onPressed: () => pushScoped<void>(context, const TeamScreen()),
                      icon: const Icon(PhosphorIconsRegular.userPlus, size: 18),
                      label: Text(t('team.title')),
                    ),
                ]),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Row(children: [
                  Icon(PhosphorIconsFill.lockSimple, size: 13, color: c.faint),
                  const SizedBox(width: 5),
                  Expanded(child: Text(t('chat.e2e'), style: TextStyle(fontSize: 12.5, color: c.faint))),
                ]),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
                child: SearchField(controller: _q, hint: t('chat.search'), onChanged: (_) => setState(() {})),
              ),
              if (chat.error != null && chat.members.isEmpty)
                EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, chat.error!), onRetry: _refresh)
              else if (loading)
                const ListSkeleton(count: 4, leading: RowLead.circle)
              else if (chat.others.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(children: [
                    Icon(PhosphorIconsRegular.usersThree, size: 44, color: c.faint),
                    const SizedBox(height: 10),
                    Text(chat.canManage ? t('chat.no_team_owner') : t('chat.no_team'),
                        textAlign: TextAlign.center, style: TextStyle(color: c.muted)),
                    if (chat.canManage) ...[
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                        onPressed: () => pushScoped<void>(context, const TeamScreen()),
                        icon: const Icon(PhosphorIconsBold.userPlus, size: 18),
                        label: Text(t('team.add')),
                      ),
                    ],
                  ]),
                )
              else
                for (final m in people)
                  _PersonRow(member: m, chat: chat, online: online.contains(m.id), t: t),
            ]),
          ),
        );
      },
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.member, required this.chat, required this.online, required this.t});
  final Member member;
  final ChatService chat;
  final bool online;
  final T t;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final last = chat.threads[member.id]?.lastOrNull;
    final unread = chat.unread[member.id] ?? 0;
    final preview = last == null
        ? roleLabel(t, member.role)
        : [
            if (last.from == chat.me) t('chat.you'),
            last.text == null
                ? t('chat.locked')
                : (last.text!.isEmpty && last.files.isNotEmpty ? '📷 ${t('chat.photo_msg')}' : last.text!),
          ].join(': ');
    return InkWell(
      onTap: () => pushScoped<void>(context, ChatScreen(member: member)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 9, 16, 9),
        child: Row(children: [
          Avatar(name: member.name, size: 52, online: online),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: Text(member.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 15.5, fontWeight: unread > 0 ? FontWeight.w800 : FontWeight.w700)),
                ),
                if (last != null)
                  Text(t.ago(last.at), style: TextStyle(fontSize: 12, color: unread > 0 ? c.ink : c.faint, fontWeight: FontWeight.w600)),
              ]),
              const SizedBox(height: 2),
              Row(children: [
                Expanded(
                  child: Text(preview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13.5, color: unread > 0 ? c.text : c.faint, fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.w400)),
                ),
                if (unread > 0) ...[const SizedBox(width: 8), CountBadge(count: unread)],
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}
