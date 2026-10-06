import 'dart:convert';
import 'dart:ui' as ui;

import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import '../car_photos.dart';
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
/// shield to check nobody is in the middle. Photos (up to 4 a message,
/// encrypted like the text) and emojis: the smiley swaps the keyboard for
/// the emoji picker (categories, search, recent), as WhatsApp does.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.member});
  final Member member;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  final _focus = FocusNode();
  bool _emoji = false, _picking = false;

  /// Photos chosen for the next message (up to 4).
  final List<CarPhoto> _photos = [];
  static const _maxPhotos = 4;
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
    _focus.dispose();
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
    final photos = List<CarPhoto>.of(_photos);
    if ((text.trim().isEmpty && photos.isEmpty) || _sending) return;
    setState(() {
      _sending = true;
      _photos.clear();
    });
    _text.clear();
    try {
      await _chat.send(_with, text, photos: photos);
      HapticFeedback.selectionClick();
    } catch (e) {
      _text.text = text;
      setState(() => _photos.addAll(photos));
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(T.of(context), e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _attach() async {
    if (_picking) return;
    final room = _maxPhotos - _photos.length;
    if (room <= 0) return;
    setState(() => _picking = true);
    try {
      final picked = await pickPhotos(context, room: room);
      if (mounted) setState(() => _photos.addAll(picked.take(room)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(T.of(context)('photo.unreadable'))));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  void _toggleEmoji() {
    if (_emoji) {
      setState(() => _emoji = false);
      _focus.requestFocus();
    } else {
      _focus.unfocus();
      setState(() => _emoji = true);
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
        if (_photos.isNotEmpty)
          Container(
            height: 86,
            color: c.chrome,
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (var i = 0; i < _photos.length; i++)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Stack(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.memory(photoBytes(_photos[i].thumb), width: 74, height: 74, fit: BoxFit.cover),
                    ),
                    Positioned(
                      top: 3,
                      right: 3,
                      child: InkWell(
                        onTap: () => setState(() => _photos.removeAt(i)),
                        child: Container(
                          width: 22,
                          height: 22,
                          decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.black87),
                          child: const Icon(Icons.close_rounded, size: 14, color: Colors.white),
                        ),
                      ),
                    ),
                  ]),
                ),
            ]),
          ),
        SafeArea(
          top: false,
          bottom: !_emoji,
          child: Container(
            padding: const EdgeInsets.fromLTRB(6, 6, 8, 8),
            decoration: BoxDecoration(color: c.chrome, border: Border(top: BorderSide(color: c.border, width: 0.6))),
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              IconButton(
                tooltip: t(_emoji ? 'chat.keyboard' : 'chat.emoji'),
                onPressed: _toggleEmoji,
                icon: Icon(_emoji ? PhosphorIconsRegular.keyboard : PhosphorIconsRegular.smiley, color: c.muted),
              ),
              Expanded(
                child: TextField(
                  controller: _text,
                  focusNode: _focus,
                  minLines: 1,
                  maxLines: 5,
                  onTap: () {
                    if (_emoji) setState(() => _emoji = false);
                  },
                  textCapitalization: TextCapitalization.sentences,
                  keyboardType: TextInputType.multiline,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: t('chat.write'),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                    filled: true,
                    fillColor: c.paper,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    suffixIcon: IconButton(
                      tooltip: t('chat.photo'),
                      onPressed: _photos.length < _maxPhotos && !_picking ? _attach : null,
                      icon: _picking
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : Icon(PhosphorIconsRegular.image, color: c.muted),
                    ),
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
        if (_emoji)
          SizedBox(
            height: 280 + MediaQuery.paddingOf(context).bottom,
            child: EmojiPicker(
              textEditingController: _text,
              onEmojiSelected: (_, __) => setState(() {}),
              config: Config(
                height: 280,
                checkPlatformCompatibility: true,
                emojiViewConfig: EmojiViewConfig(
                  backgroundColor: c.chrome,
                  columns: 8,
                  emojiSizeMax: 28 * (defaultTargetPlatform == TargetPlatform.iOS ? 1.2 : 1.0),
                  noRecents: Text(t('chat.no_recent'), style: TextStyle(color: c.faint)),
                ),
                categoryViewConfig: CategoryViewConfig(
                  backgroundColor: c.chrome,
                  indicatorColor: c.ink,
                  iconColorSelected: c.ink,
                  iconColor: c.faint,
                  backspaceColor: c.ink,
                ),
                bottomActionBarConfig: BottomActionBarConfig(
                  backgroundColor: c.chrome,
                  buttonColor: c.chrome,
                  buttonIconColor: c.muted,
                ),
                searchViewConfig: SearchViewConfig(backgroundColor: c.chrome, buttonIconColor: c.muted, hintText: t('chat.emoji_search')),
              ),
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
          padding: m.files.isNotEmpty ? const EdgeInsets.fromLTRB(4, 4, 8, 6) : const EdgeInsets.fromLTRB(12, 8, 10, 6),
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
            if (m.files.isNotEmpty) ...[
              _PhotoGrid(files: m.files),
              if ((m.text ?? '').isNotEmpty) const SizedBox(height: 6),
            ],
            if (m.text != null && m.text!.isNotEmpty)
              SelectableText(m.text!, style: TextStyle(fontSize: 15, height: 1.3, color: fg))
            else if (m.text == null)
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

/// A message's photos: one large, or a 2-column grid; each shown blurred
/// from its tiny preview until it has been fetched and opened on this phone.
class _PhotoGrid extends StatelessWidget {
  const _PhotoGrid({required this.files});
  final List<Map<String, dynamic>> files;

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width * 0.7;
    final one = files.length == 1;
    final size = one ? w : (w - 4) / 2;
    return SizedBox(
      width: w,
      child: Wrap(spacing: 4, runSpacing: 4, children: [
        for (var i = 0; i < files.length; i++)
          GestureDetector(
            onTap: () => Navigator.of(context).push(PageRouteBuilder<void>(
              opaque: false,
              pageBuilder: (_, __, ___) => _PhotoView(files: files, initial: i),
              transitionsBuilder: (_, a, __, child) => FadeTransition(opacity: a, child: child),
            )),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(width: size, height: one ? w * 0.75 : size, child: _ChatPhoto(file: files[i])),
            ),
          ),
      ]),
    );
  }
}

class _ChatPhoto extends StatelessWidget {
  const _ChatPhoto({required this.file, this.fit = BoxFit.cover});
  final Map<String, dynamic> file;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final chat = ChatService.of(SessionScope.of(context));
    final th = file['th'] is String ? file['th'] as String : null;
    final preview = th == null
        ? ColoredBox(color: c.paper)
        : ImageFiltered(imageFilter: ui.ImageFilter.blur(sigmaX: 6, sigmaY: 6), child: Image.memory(photoBytes(th), fit: BoxFit.cover));
    return FutureBuilder<Uint8List?>(
      future: chat.photo(file),
      builder: (context, snap) {
        if (snap.data != null) return Image.memory(snap.data!, fit: fit, gaplessPlayback: true);
        return Stack(fit: StackFit.expand, children: [
          preview,
          if (snap.connectionState != ConnectionState.done)
            const Center(child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)))
          else
            Center(child: Icon(PhosphorIconsRegular.lockSimple, color: c.faint)),
        ]);
      },
    );
  }
}

/// Full screen, swipe between the message's photos, save one to the phone.
class _PhotoView extends StatefulWidget {
  const _PhotoView({required this.files, required this.initial});
  final List<Map<String, dynamic>> files;
  final int initial;

  @override
  State<_PhotoView> createState() => _PhotoViewState();
}

class _PhotoViewState extends State<_PhotoView> {
  late int _i = widget.initial;

  Future<void> _save() async {
    final t = T.of(context);
    final bytes = await ChatService.of(SessionScope.of(context)).photo(widget.files[_i]);
    if (bytes == null || !mounted) return;
    final ok = await savePhotoToPhone('data:image/jpeg;base64,${base64Encode(bytes)}');
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t(ok ? 'photo.saved_to_phone' : 'photo.save_to_phone_failed'))));
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: widget.files.length > 1 ? Text('${_i + 1} / ${widget.files.length}', style: const TextStyle(color: Colors.white)) : null,
        actions: [IconButton(tooltip: t('photo.save_to_phone'), onPressed: _save, icon: const Icon(PhosphorIconsRegular.downloadSimple))],
      ),
      body: PageView.builder(
        controller: PageController(initialPage: widget.initial),
        itemCount: widget.files.length,
        onPageChanged: (i) => setState(() => _i = i),
        itemBuilder: (_, i) => InteractiveViewer(child: Center(child: _ChatPhoto(file: widget.files[i], fit: BoxFit.contain))),
      ),
    );
  }
}
