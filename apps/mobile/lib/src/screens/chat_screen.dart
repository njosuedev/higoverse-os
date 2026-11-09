import 'dart:convert';
import 'dart:ui' as ui;

import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:phosphor_icons/phosphor_icons.dart';
import 'package:share_plus/share_plus.dart';

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
/// shield to check nobody is in the middle. Photos and documents (up to 4
/// of each a message, encrypted like the text) and emojis: the smiley swaps the keyboard for
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

  /// Documents chosen for the next message (up to 4, 10 MB each).
  final List<ChatDoc> _docs = [];
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
    final docs = List<ChatDoc>.of(_docs);
    if ((text.trim().isEmpty && photos.isEmpty && docs.isEmpty) || _sending) return;
    setState(() {
      _sending = true;
      _photos.clear();
      _docs.clear();
    });
    _text.clear();
    try {
      await _chat.send(_with, text, photos: photos, docs: docs);
      HapticFeedback.selectionClick();
    } catch (e) {
      // The chat may have been closed while the photos uploaded.
      if (!mounted) return;
      _text.text = text;
      setState(() {
        _photos.addAll(photos);
        _docs.addAll(docs);
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(T.of(context), e))));
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

  Future<void> _attachFile() async {
    final t = T.of(context);
    final room = maxDocs - _docs.length;
    if (_picking || room <= 0) return;
    setState(() => _picking = true);
    try {
      final res = await FilePicker.platform.pickFiles(allowMultiple: true, withData: true);
      if (res == null || !mounted) return;
      final big = res.files.where((f) => f.size > maxDocBytes).firstOrNull;
      if (big != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('chat.file_too_big', {'name': big.name}))));
      }
      final ok = [
        for (final f in res.files)
          if (f.bytes != null && f.bytes!.isNotEmpty && f.size <= maxDocBytes) (name: f.name, type: _typeOf(f.name), bytes: f.bytes!),
      ];
      if (ok.length > room) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('chat.files_max', {'n': '$maxDocs'}))));
      }
      setState(() => _docs.addAll(ok.take(room)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('chat.file_failed'))));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  /// Photo or document: asked like WhatsApp's paperclip.
  Future<void> _attachMenu() async {
    final t = T.of(context);
    final pick = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            enabled: _photos.length < _maxPhotos,
            leading: const Icon(PhosphorIconsRegular.image),
            title: Text(t('chat.photo')),
            onTap: () => Navigator.pop(ctx, 'photo'),
          ),
          ListTile(
            enabled: _docs.length < maxDocs,
            leading: const Icon(PhosphorIconsRegular.fileText),
            title: Text(t('chat.file')),
            onTap: () => Navigator.pop(ctx, 'file'),
          ),
        ]),
      ),
    );
    if (pick == 'photo') await _attach();
    if (pick == 'file') await _attachFile();
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
        if (_docs.isNotEmpty)
          Container(
            color: c.chrome,
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
            child: Wrap(spacing: 8, runSpacing: 6, children: [
              for (var i = 0; i < _docs.length; i++)
                InputChip(
                  avatar: Icon(PhosphorIconsRegular.fileText, size: 18, color: c.ink),
                  label: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 180),
                    child: Text('${_docs[i].name} · ${fileSize(_docs[i].bytes.length)}', overflow: TextOverflow.ellipsis),
                  ),
                  onDeleted: () => setState(() => _docs.removeAt(i)),
                ),
            ]),
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
                      tooltip: t('chat.file'),
                      onPressed: (_photos.length < _maxPhotos || _docs.length < maxDocs) && !_picking ? _attachMenu : null,
                      icon: _picking
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : Icon(PhosphorIconsRegular.paperclip, color: c.muted),
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
            if (m.files.any((f) => !isDoc(f))) ...[
              _PhotoGrid(files: [for (final f in m.files) if (!isDoc(f)) f]),
              if ((m.text ?? '').isNotEmpty || m.files.any(isDoc)) const SizedBox(height: 6),
            ],
            for (final f in m.files.where(isDoc)) _DocTile(file: f, mine: mine, pending: m.pending),
            if (m.files.any(isDoc) && (m.text ?? '').isNotEmpty) const SizedBox(height: 2),
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

/// 1.2 MB, 340 KB…
String fileSize(num? n) {
  if (n == null) return '';
  if (n < 1024) return '$n B';
  if (n < 1024 * 1024) return '${(n / 1024).round()} KB';
  return '${(n / 1024 / 1024).toStringAsFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB';
}

/// "PDF", "XLSX"… from a file name.
String _extOf(String? name) {
  final i = name?.lastIndexOf('.') ?? -1;
  return name != null && i > 0 && name.length - i <= 6 ? name.substring(i + 1).toUpperCase() : '';
}

/// A file's type from its name, for the apps that open it.
String? _typeOf(String name) => const {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'csv': 'text/csv',
      'txt': 'text/plain',
      'zip': 'application/zip',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
    }[_extOf(name).toLowerCase()];

/// A document in a message: icon, name, type and size. Tap: open it in
/// another app or save it (the phone's share sheet).
class _DocTile extends StatefulWidget {
  const _DocTile({required this.file, required this.mine, required this.pending});
  final Map<String, dynamic> file;
  final bool mine, pending;

  @override
  State<_DocTile> createState() => _DocTileState();
}

class _DocTileState extends State<_DocTile> {
  bool _busy = false;

  Future<void> _open() async {
    if (_busy || widget.pending) return;
    final t = T.of(context);
    final chat = ChatService.of(SessionScope.of(context));
    final box = context.findRenderObject() as RenderBox?;
    setState(() => _busy = true);
    try {
      final bytes = await chat.photo(widget.file);
      if (!mounted) return;
      if (bytes == null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('chat.file_failed'))));
        return;
      }
      final name = cleanFileName('${widget.file['nm']}');
      final type = widget.file['mt'] is String ? widget.file['mt'] as String : _typeOf(name);
      await SharePlus.instance.share(ShareParams(
        files: [XFile.fromData(bytes, name: name, mimeType: type)],
        fileNameOverrides: [name],
        sharePositionOrigin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      ));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('chat.file_failed'))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final fg = widget.mine ? Colors.white : c.text;
    final name = '${widget.file['nm']}';
    final meta = [_extOf(name), fileSize(widget.file['sz'] as num?)].where((s) => s.isNotEmpty).join(' · ');
    final w = MediaQuery.sizeOf(context).width * 0.7;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: widget.mine ? Colors.white.withValues(alpha: 0.15) : c.chrome,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: _open,
          child: SizedBox(
            width: w,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
              child: Row(children: [
                Icon(PhosphorIconsFill.fileText, size: 32, color: widget.mine ? Colors.white : c.ink),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: fg)),
                    if (meta.isNotEmpty) Text(meta, style: TextStyle(fontSize: 11.5, color: fg.withValues(alpha: 0.7))),
                  ]),
                ),
                const SizedBox(width: 6),
                _busy || widget.pending
                    ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
                    : Icon(PhosphorIconsRegular.downloadSimple, size: 20, color: fg.withValues(alpha: 0.85)),
              ]),
            ),
          ),
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
