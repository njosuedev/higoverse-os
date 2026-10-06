import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import '../chat/chat_service.dart';
import '../chat/crypto.dart';
import '../format.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'messages_screen.dart';

/// One conversation: bubbles by day (mine on the right in blue), ✓ sent,
/// ✓✓ read, older ones as you scroll up, and the security code behind the
/// shield to check nobody is in the middle.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.member});
  final Member member;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  late ChatService _chat;
  bool _more = true, _loading = false, _sending = false, _started = false;

  String get _with => widget.member.id;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _chat = ChatService.of(SessionScope.of(context));
    _chat.openWith = _with;
    _chat.start(LiveScope.read(context)).then((_) => _load());
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 200) _load(older: true);
    });
  }

  @override
  void dispose() {
    if (_chat.openWith == _with) _chat.openWith = null;
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool older = false}) async {
    if (_loading || (older && !_more)) return;
    _loading = true;
    try {
      final more = await _chat.loadThread(_with, older: older);
      if (mounted) setState(() => _more = more);
      if (!older) await _chat.markReadNow(_with);
    } catch (_) {
      // Shown from the cache; trying again on the next scroll or message.
    } finally {
      _loading = false;
    }
  }

  Future<void> _send() async {
    final text = _text.text;
    if (text.trim().isEmpty || _sending) return;
    setState(() => _sending = true);
    _text.clear();
    try {
      await _chat.send(_with, text);
      HapticFeedback.selectionClick();
    } catch (e) {
      _text.text = text;
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(T.of(context), e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _showCode() async {
    final t = T.of(context);
    final c = Hgv.of(context);
    final code = securityCode(await _chat.keysWith(_with));
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(PhosphorIconsFill.shieldCheck, color: c.success),
              const SizedBox(width: 8),
              Text(t('chat.code_title'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ]),
            const SizedBox(height: 8),
            Text(t('chat.code_body', {'name': widget.member.name}), style: TextStyle(color: c.muted, height: 1.35)),
            const SizedBox(height: 16),
            FutureBuilder<String>(
              future: code,
              builder: (_, snap) => Center(
                child: Text(snap.data ?? '…',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 2, fontFeatures: [FontFeature.tabularFigures()])),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final live = LiveScope.of(context);
    final online = live?.online.any((m) => m.id == _with) ?? false;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          Avatar(name: widget.member.name, size: 38, online: online),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.member.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              Text(online ? t('chat.online') : roleLabel(t, widget.member.role),
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: online ? c.success : c.faint)),
            ]),
          ),
        ]),
        actions: [
          IconButton(tooltip: t('chat.code_title'), onPressed: _showCode, icon: const Icon(PhosphorIconsRegular.shieldCheck)),
        ],
      ),
      body: Column(children: [
        Expanded(
          child: ListenableBuilder(
            listenable: _chat,
            builder: (context, _) {
              final msgs = _chat.threads[_with] ?? const <ChatMessage>[];
              if (msgs.isEmpty) {
                return ListView(padding: const EdgeInsets.all(24), children: [
                  const SizedBox(height: 40),
                  Icon(PhosphorIconsFill.lockSimple, size: 36, color: c.faint),
                  const SizedBox(height: 10),
                  Text(t('chat.empty', {'name': widget.member.name}), textAlign: TextAlign.center, style: TextStyle(color: c.muted)),
                ]);
              }
              final list = msgs.reversed.toList();
              return ListView.builder(
                controller: _scroll,
                reverse: true,
                padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
                itemCount: list.length,
                itemBuilder: (context, i) {
                  final m = list[i];
                  final older = i + 1 < list.length ? list[i + 1] : null;
                  final newDay = older == null || daysAgo(older.at) != daysAgo(m.at);
                  final bubble = _Bubble(m: m, mine: m.from == _chat.me, t: t);
                  if (!newDay) return bubble;
                  return Column(children: [_DayChip(at: m.at, t: t), bubble]);
                },
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(10, 6, 8, 8),
            decoration: BoxDecoration(color: c.chrome, border: Border(top: BorderSide(color: c.border, width: 0.6))),
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                child: TextField(
                  controller: _text,
                  minLines: 1,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  keyboardType: TextInputType.multiline,
                  decoration: InputDecoration(
                    hintText: t('chat.write'),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                    filled: true,
                    fillColor: c.paper,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              IconButton.filled(
                style: IconButton.styleFrom(backgroundColor: c.ink, fixedSize: const Size(44, 44)),
                tooltip: t('chat.send'),
                onPressed: _sending ? null : _send,
                icon: const Icon(PhosphorIconsFill.paperPlaneRight, size: 20, color: Colors.white),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({required this.at, required this.t});
  final DateTime at;
  final T t;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final n = daysAgo(at);
    final label = n == 0 ? t('act.today') : (n == 1 ? t('act.yesterday') : '${t.weekday(at.weekday)} ${t.date(at)}');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(10)),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.muted)),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.m, required this.mine, required this.t});
  final ChatMessage m;
  final bool mine;
  final T t;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final time = '${m.at.hour.toString().padLeft(2, '0')}:${m.at.minute.toString().padLeft(2, '0')}';
    final fg = mine ? Colors.white : c.text;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 2),
          padding: const EdgeInsets.fromLTRB(12, 8, 10, 6),
          decoration: BoxDecoration(
            color: mine ? c.ink : c.paper,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(18),
              topRight: const Radius.circular(18),
              bottomLeft: Radius.circular(mine ? 18 : 6),
              bottomRight: Radius.circular(mine ? 6 : 18),
            ),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
            if (m.text != null)
              SelectableText(m.text!, style: TextStyle(fontSize: 15, height: 1.3, color: fg))
            else
              Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(PhosphorIconsRegular.lockSimple, size: 14, color: fg.withValues(alpha: 0.7)),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(t('chat.locked'),
                      style: TextStyle(fontSize: 13.5, fontStyle: FontStyle.italic, color: fg.withValues(alpha: 0.75))),
                ),
              ]),
            const SizedBox(height: 2),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Text(time, style: TextStyle(fontSize: 11, color: fg.withValues(alpha: 0.7))),
              if (mine) ...[
                const SizedBox(width: 4),
                Icon(
                  m.pending ? PhosphorIconsRegular.clock : (m.readAt != null ? PhosphorIconsBold.checks : PhosphorIconsBold.check),
                  size: 14,
                  color: m.readAt != null ? const Color(0xFFB3E5FF) : fg.withValues(alpha: 0.75),
                ),
              ],
            ]),
          ]),
        ),
      ),
    );
  }
}
