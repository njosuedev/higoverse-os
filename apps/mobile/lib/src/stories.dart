import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'charts.dart';
import 'config.dart';
import 'covers.dart';
import 'format.dart';
import 'holder.dart';
import 'i18n.dart';
import 'session.dart';
import 'sheets.dart';
import 'theme.dart';
import 'widgets.dart';

/// What a story is about: a vehicle with traffic fines, or one sold and
/// waiting for its ownership transfer.
enum StoryKind { fines, pending }

class Story {
  const Story(this.kind, this.vehicle);
  final StoryKind kind;
  final Map<String, dynamic> vehicle;

  String get id => '${kind.name}:${vehicle['id']}';
  Map<String, String> get attrs => attributesOf(vehicle['attributes']);
}

/// Stories already opened on this phone (this session): their ring turns grey.
final _seen = <String>{};

Color _ring(BuildContext context, StoryKind k) => k == StoryKind.fines ? Hgv.of(context).danger : Hgv.of(context).warning;
IconData _icon(StoryKind k) => k == StoryKind.fines ? Icons.local_police_rounded : Icons.swap_horiz_rounded;

/// The row of story cards: one per vehicle, fines first. Tapping one opens
/// the viewer at that story and plays through the rest.
class StoriesRow extends StatefulWidget {
  const StoriesRow({super.key, required this.stories});
  final List<Story> stories;

  @override
  State<StoriesRow> createState() => _StoriesRowState();
}

class _StoriesRowState extends State<StoriesRow> {
  Future<void> _open(int i) async {
    await Navigator.of(context).push(PageRouteBuilder<void>(
      opaque: false,
      transitionDuration: const Duration(milliseconds: 260),
      reverseTransitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (_, __, ___) => StoryViewer(stories: widget.stories, initial: i),
      transitionsBuilder: (_, a, __, child) => FadeTransition(
        opacity: a,
        child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOut)), child: child),
      ),
    ));
    if (mounted) setState(() {}); // rings of the stories just seen
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 176,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: widget.stories.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, i) => _StoryCard(story: widget.stories[i], onTap: () => _open(i)),
        ),
      );
}

class _StoryCard extends StatelessWidget {
  const _StoryCard({required this.story, required this.onTap});
  final Story story;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final s = SessionScope.of(context);
    final c = Hgv.of(context);
    final a = story.attrs;
    final ring = _seen.contains(story.id) ? c.faint : _ring(context, story.kind);
    // Fines: who has the car (the one to call about them); pending: the buyer.
    final fallback = story.kind == StoryKind.fines
        ? _finesLine(t, s, a)
        : (a['buyer_name'] ?? '').isNotEmpty
            ? a['buyer_name']!
            : t('stock.f_pending');
    return Semantics(
      button: true,
      label: '${story.kind == StoryKind.fines ? t('story.fines') : t('story.pending')}: ${story.vehicle['name'] ?? ''}',
      child: GestureDetector(
        onTap: onTap,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            width: 108,
            child: Stack(fit: StackFit.expand, children: [
              CoverPhoto(
                id: '${story.vehicle['id']}',
                thumbnail: story.vehicle['thumbnail'] as String?,
                isCar: true,
                fallback: _Backdrop(url: null, kind: story.kind),
              ),
              // Darkens the bottom so the white text reads on any photo.
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0.35, 1],
                    colors: [Colors.transparent, Color(0xD9000000)],
                  ),
                ),
              ),
              Positioned(
                left: 8,
                top: 8,
                child: Container(
                  padding: const EdgeInsets.all(2.5),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: ring, width: 2.5)),
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: _ring(context, story.kind)),
                    child: Icon(_icon(story.kind), size: 16, color: Colors.white),
                  ),
                ),
              ),
              Positioned(
                left: 8,
                right: 8,
                bottom: 8,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text('${story.vehicle['name'] ?? ''}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800, height: 1.15)),
                  const SizedBox(height: 2),
                  Text(fallback,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Color(0xE6FFFFFF), fontSize: 11, fontWeight: FontWeight.w600)),
                  if (story.kind == StoryKind.fines)
                    FutureBuilder<CarHolder?>(
                      future: carHolder(s, story.vehicle),
                      builder: (context, snap) {
                        final h = snap.data;
                        if (h == null || h.name == '—') return const SizedBox.shrink();
                        return Row(children: [
                          const Icon(Icons.person_rounded, size: 11, color: Color(0xCCFFFFFF)),
                          const SizedBox(width: 3),
                          Expanded(
                            child: Text(h.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 10.5, fontWeight: FontWeight.w600)),
                          ),
                        ]);
                      },
                    ),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

String _finesLine(T t, Session s, Map<String, String> a) {
  final n = int.tryParse(a['penalty_count'] ?? '') ?? 0;
  final amount = num.tryParse(a['penalty_amount'] ?? '') ?? 0;
  final count = n == 1 ? t('stock.fine_one') : t('stock.fines_n', {'n': n});
  return amount > 0 ? '$count · ${compactMoney(amount, s.currency)}' : count;
}

/// The vehicle photo, or a coloured gradient with a car when there is none.
class _Backdrop extends StatelessWidget {
  const _Backdrop({required this.url, required this.kind, this.fit = BoxFit.cover});
  final String? url;
  final StoryKind kind;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final base = _ring(context, kind);
    return UrlImage(
      url: url,
      fit: fit,
      fallback: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color.lerp(base, Colors.black, 0.15)!, Color.lerp(base, Colors.black, 0.6)!],
          ),
        ),
        child: const Center(child: Icon(Icons.directions_car_filled_rounded, color: Color(0x55FFFFFF), size: 48)),
      ),
    );
  }
}

/// Full-screen stories: bars at the top fill as each one plays (6 s), tap
/// the right side for the next, the left for the previous, hold to pause,
/// swipe down to close. Each story shows the vehicle large with its card.
class StoryViewer extends StatefulWidget {
  const StoryViewer({super.key, required this.stories, required this.initial});
  final List<Story> stories;
  final int initial;

  @override
  State<StoryViewer> createState() => _StoryViewerState();
}

class _StoryViewerState extends State<StoryViewer> with SingleTickerProviderStateMixin {
  late int _i = widget.initial;
  late final _clock = AnimationController(vsync: this, duration: const Duration(seconds: 8))
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) _next();
    });
  double _drag = 0;

  /// Full photos, fetched when a story is shown (lists only carry thumbnails).
  final Map<String, Future<List<String>>> _photos = {};

  Story get _story => widget.stories[_i];

  @override
  void initState() {
    super.initState();
    _show();
  }

  @override
  void dispose() {
    _clock.dispose();
    super.dispose();
  }

  void _show() {
    _seen.add(_story.id);
    _clock.forward(from: 0);
    HapticFeedback.selectionClick();
  }

  void _next() {
    if (_i < widget.stories.length - 1) {
      setState(() => _i++);
      _show();
    } else {
      Navigator.of(context).maybePop();
    }
  }

  void _prev() {
    if (_i > 0) setState(() => _i--);
    _show();
  }

  Future<List<String>> _photosOf(Map<String, dynamic> v) => _photos['${v['id']}'] ??= () async {
        try {
          final res = await SessionScope.of(context).api.get('${Svc.products}/products/${v['id']}');
          final raw = ((res as Map)['data'] as Map?)?['images'];
          final list = raw is String ? jsonDecode(raw) : raw;
          if (list is List) return list.whereType<String>().toList();
        } catch (_) {}
        return const <String>[];
      }();

  Future<void> _pausedWhile(Future<void> Function() f) async {
    _clock.stop();
    await f();
    if (mounted) _clock.forward();
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final s = SessionScope.of(context);
    final story = _story;
    final v = story.vehicle;
    final color = _ring(context, story.kind);
    final added = parseTimestamp(v['created_at']);
    final top = MediaQuery.paddingOf(context).top;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: GestureDetector(
        onVerticalDragUpdate: (d) => setState(() => _drag = (_drag + d.delta.dy).clamp(0, 400)),
        onVerticalDragEnd: (d) {
          if (_drag > 120 || d.velocity.pixelsPerSecond.dy > 700) {
            Navigator.of(context).maybePop();
          } else {
            setState(() => _drag = 0);
          }
        },
        child: Transform.translate(
          offset: Offset(0, _drag),
          child: Opacity(
            opacity: (1 - _drag / 500).clamp(0.3, 1),
            child: Scaffold(
              backgroundColor: Colors.black,
              body: Stack(children: [
                // ── Photo ──
                Positioned.fill(
                  child: FutureBuilder<List<String>>(
                    future: _photosOf(v),
                    builder: (context, snap) {
                      final url = (snap.data?.isNotEmpty ?? false) ? snap.data!.first : v['thumbnail'] as String?;
                      return Stack(fit: StackFit.expand, children: [
                        // Blurred fill behind a photo that doesn't match the screen's shape.
                        Opacity(opacity: 0.35, child: _Backdrop(url: url, kind: story.kind)),
                        _Backdrop(url: url, kind: story.kind, fit: BoxFit.contain),
                        if ((snap.data?.length ?? 0) > 1)
                          Positioned(
                            right: 14,
                            top: top + 64,
                            child: _Pill(icon: Icons.photo_library_outlined, text: '${snap.data!.length}'),
                          ),
                      ]);
                    },
                  ),
                ),
                // ── Tap zones: left = back, right = next, hold = pause ──
                Positioned.fill(
                  child: Row(children: [
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onTap: _prev,
                        onLongPressStart: (_) => _clock.stop(),
                        onLongPressEnd: (_) => _clock.forward(),
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onTap: _next,
                        onLongPressStart: (_) => _clock.stop(),
                        onLongPressEnd: (_) => _clock.forward(),
                      ),
                    ),
                  ]),
                ),
                // ── Top: progress bars and who/what ──
                Positioned(
                  left: 0,
                  right: 0,
                  top: 0,
                  child: Container(
                    padding: EdgeInsets.fromLTRB(10, top + 8, 4, 16),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0x99000000), Colors.transparent],
                      ),
                    ),
                    child: Column(children: [
                      Row(children: [
                        for (var k = 0; k < widget.stories.length; k++) ...[
                          if (k > 0) const SizedBox(width: 3),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(2),
                              child: AnimatedBuilder(
                                animation: _clock,
                                builder: (_, __) => LinearProgressIndicator(
                                  minHeight: 2.5,
                                  value: k < _i ? 1 : (k == _i ? _clock.value : 0),
                                  backgroundColor: Colors.white30,
                                  valueColor: const AlwaysStoppedAnimation(Colors.white),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ]),
                      const SizedBox(height: 10),
                      Row(children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: color, border: Border.all(color: Colors.white, width: 2)),
                          child: Icon(_icon(story.kind), size: 18, color: Colors.white),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(story.kind == StoryKind.fines ? t('story.fines') : t('story.pending'),
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
                            if (added != null)
                              Text(t('story.added', {'when': t.ago(added)}),
                                  style: const TextStyle(color: Colors.white70, fontSize: 11.5)),
                          ]),
                        ),
                        IconButton(
                          tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                          onPressed: () => Navigator.of(context).maybePop(),
                          icon: const Icon(Icons.close_rounded, color: Colors.white),
                        ),
                      ]),
                    ]),
                  ),
                ),
                // ── Bottom: the vehicle's card ──
                Positioned(
                  left: 10,
                  right: 10,
                  bottom: MediaQuery.paddingOf(context).bottom + 12,
                  child: _VehicleCard(
                    story: story,
                    holder: carHolder(s, v),
                    onDetails: () => _pausedWhile(() => openItem(context, v)),
                    onCall: (phone) => _pausedWhile(() => launchUrl(Uri(scheme: 'tel', path: phone))),
                    onSms: (phone) => _pausedWhile(() => launchUrl(Uri(scheme: 'sms', path: phone))),
                    currency: s.currency,
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 4),
          Text(text, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
        ]),
      );
}

/// The story's card: the vehicle, what is wrong, and who has it — with the
/// customer's phone to call. A car sold on credit or partly paid stays in the
/// company's name until it is fully paid and transferred, so its fines reach
/// the company: the customer driving it is the one to call.
class _VehicleCard extends StatelessWidget {
  const _VehicleCard({
    required this.story,
    required this.holder,
    required this.onDetails,
    required this.onCall,
    required this.onSms,
    required this.currency,
  });
  final Story story;
  final Future<CarHolder?> holder;
  final VoidCallback onDetails;
  final ValueChanged<String> onCall, onSms;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final v = story.vehicle;
    final a = story.attrs;
    final color = _ring(context, story.kind);
    final fines = int.tryParse(a['penalty_count'] ?? '') ?? 0;
    final fineAmount = num.tryParse(a['penalty_amount'] ?? '') ?? 0;
    final specs = [a['plate_no'], a['year'], a['color']].where((x) => x != null && x.isNotEmpty).join(' · ');

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 24, offset: Offset(0, 8))],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          // ── The vehicle ──
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${v['name'] ?? ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w900, letterSpacing: -0.3)),
                if (specs.isNotEmpty) Text(specs, style: TextStyle(fontSize: 12, color: c.faint, fontWeight: FontWeight.w500)),
              ]),
            ),
            if (story.kind == StoryKind.fines)
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                StatusChip(fines == 1 ? t('stock.fine_one') : t('stock.fines_n', {'n': fines}), color),
                if (fineAmount > 0) ...[
                  const SizedBox(height: 3),
                  Text(money(fineAmount, currency), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: color)),
                ],
              ])
            else
              StatusChip(t('stock.f_pending'), color),
          ]),
          const SizedBox(height: 10),
          // ── Who has it ──
          FutureBuilder<CarHolder?>(
            future: holder,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return Container(
                  height: 86,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
                  child: const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4)),
                );
              }
              return HolderBlock(holder: snap.data, currency: currency, finesNote: story.kind == StoryKind.fines);
            },
          ),
          const SizedBox(height: 10),
          // ── Actions ──
          FutureBuilder<CarHolder?>(
            future: holder,
            builder: (context, snap) {
              final phone = snap.data?.phone ?? '';
              return Row(children: [
                if (phone.isNotEmpty) ...[
                  Expanded(
                    flex: 3,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: c.success,
                        minimumSize: const Size.fromHeight(42),
                        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                      ),
                      onPressed: () => onCall(phone),
                      icon: const Icon(Icons.call_rounded, size: 18),
                      label: Text(t('debts.call')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _SquareButton(icon: Icons.chat_bubble_outline_rounded, tooltip: t('debts.sms'), onTap: () => onSms(phone)),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  flex: 2,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(42)),
                    onPressed: onDetails,
                    icon: const Icon(Icons.directions_car_rounded, size: 18),
                    label: Text(t('story.view_short')),
                  ),
                ),
              ]);
            },
          ),
        ]),
      ),
    );
  }
}

class _SquareButton extends StatelessWidget {
  const _SquareButton({required this.icon, required this.tooltip, required this.onTap});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Tooltip(
      message: tooltip,
      child: Material(
        color: c.paper,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: SizedBox(width: 46, height: 42, child: Icon(icon, size: 20, color: c.ink)),
        ),
      ),
    );
  }
}

/// The customer who has the car: who, how to reach them, what they owe.
class HolderBlock extends StatelessWidget {
  const HolderBlock({super.key, required this.holder, required this.currency, this.finesNote = false});
  final CarHolder? holder;
  final String currency;

  /// Adds why its fines still come to the company.
  final bool finesNote;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final h = holder;
    if (h == null) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(Icons.person_off_outlined, color: c.faint, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(t('story.no_holder'), style: TextStyle(fontSize: 12.5, color: c.muted))),
        ]),
      );
    }
    final (payLabel, payColor) = switch (h.pay) {
      PayState.paid => (t('story.paid_full'), c.success),
      PayState.partial => (t('story.partly_paid'), c.warning),
      PayState.credit => (t('story.on_credit'), c.danger),
      PayState.unknown => (null, c.faint),
    };
    final contact = [h.phone, if (h.idNumber.isNotEmpty) '${t('story.id')} ${h.idNumber}'].where((x) => x.isNotEmpty).join(' · ');
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t('story.holder').toUpperCase(),
            style: TextStyle(fontSize: 10.5, letterSpacing: 0.6, fontWeight: FontWeight.w800, color: c.faint)),
        const SizedBox(height: 6),
        Row(children: [
          Avatar(name: h.name, size: 40),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(h.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
              if (contact.isNotEmpty)
                Text(contact, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.muted)),
              if (h.address.isNotEmpty)
                Text(h.address, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.faint)),
            ]),
          ),
          if (payLabel != null) StatusChip(payLabel, payColor),
        ]),
        if (h.total != null && h.paid != null && h.total! > 0) ...[
          const SizedBox(height: 9),
          Meter(value: h.paid! / h.total!, color: c.success, height: 6),
          const SizedBox(height: 4),
          Row(children: [
            Expanded(
              child: Text(t('debts.paid_of', {'paid': money(h.paid!, currency), 'owed': money(h.total!, currency)}),
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: c.muted)),
            ),
            if ((h.balance ?? 0) > 0)
              Text(t('story.owes', {'amount': money(h.balance!, currency)}),
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: c.danger)),
          ]),
        ],
        if (finesNote) ...[
          const SizedBox(height: 8),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.info_outline_rounded, size: 14, color: c.warning),
            const SizedBox(width: 5),
            Expanded(
              child: Text(t('story.not_transferred'),
                  style: TextStyle(fontSize: 11.5, color: c.warning, fontWeight: FontWeight.w600, height: 1.3)),
            ),
          ]),
        ],
      ]),
    );
  }
}
