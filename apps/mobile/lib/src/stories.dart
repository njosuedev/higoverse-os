import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:phosphor_icons/phosphor_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import 'charts.dart';
import 'config.dart';
import 'covers.dart';
import 'format.dart';
import 'forms.dart';
import 'holder.dart';
import 'i18n.dart';
import 'session.dart';
import 'sheets.dart';
import 'theme.dart';
import 'widgets.dart';

/// What a story is about. Car dealers: a vehicle with traffic fines, or one
/// sold and waiting for its ownership transfer. Shops: an item sold out,
/// one running low, a best seller this week. Both: everything added in the
/// last 3 days ([fresh], like posts on Facebook).
enum StoryKind { fines, pending, soldOut, low, best, fresh }

extension StoryKindX on StoryKind {
  bool get isCar => this == StoryKind.fines || this == StoryKind.pending;
}

/// One frame: one vehicle or item.
class Story {
  const Story(this.kind, this.item);
  final StoryKind kind;
  final Map<String, dynamic> item;
  Map<String, dynamic> get vehicle => item;

  String get itemId => '${item['id'] ?? item['product_id'] ?? ''}';
  Map<String, String> get attrs => attributesOf(item['attributes']);

  /// Seen-key: changes when the situation does (more fines, fewer left,
  /// more sold), so the story counts as new again.
  String get id {
    final state = switch (kind) {
      StoryKind.fines => attrs['penalty_count'] ?? '',
      StoryKind.pending => attrs['sale_status'] ?? '',
      StoryKind.soldOut || StoryKind.low => '${item['quantity'] ?? ''}',
      StoryKind.best => '${item['qty_sold'] ?? ''}',
      StoryKind.fresh => '',
    };
    return '${kind.name}:$itemId:$state';
  }
}

/// A card in the tray, like one person's stories on Facebook: one topic,
/// every vehicle or item in it played one after the other.
class StoryGroup {
  StoryGroup(this.kind, this.stories);
  final StoryKind kind;
  final List<Story> stories;
  bool get seen => stories.every((x) => StorySeen.instance.has(x.id));
}

/// How long something added stays a story.
const freshFor = Duration(days: 3);

/// The stories built from what Home already loaded; empty topics left out,
/// topics not seen yet first, then what needs action first.
List<StoryGroup> storyGroups({
  required bool isCar,
  List<Map<String, dynamic>> fined = const [],
  List<Map<String, dynamic>> pending = const [],
  List<Map<String, dynamic>> alerts = const [],
  List<Map<String, dynamic>> top = const [],
  List<Map<String, dynamic>> newest = const [],
  DateTime? now,
}) {
  num q(Map<String, dynamic> m) => m['quantity'] is num ? m['quantity'] as num : num.tryParse('${m['quantity']}') ?? 0;
  final since = (now ?? DateTime.now()).subtract(freshFor);
  // Everything added in the last 3 days, newest first.
  final added = StoryGroup(StoryKind.fresh, [
    for (final p in newest)
      if (parseTimestamp(p['created_at'])?.isAfter(since) ?? false) Story(StoryKind.fresh, p),
  ]);
  final groups = <StoryGroup>[
    if (isCar) ...[
      StoryGroup(StoryKind.fines, [for (final v in fined) Story(StoryKind.fines, v)]),
      StoryGroup(StoryKind.pending, [for (final v in pending) Story(StoryKind.pending, v)]),
      added,
    ] else ...[
      StoryGroup(StoryKind.soldOut, [for (final p in alerts) if (q(p) <= 0) Story(StoryKind.soldOut, p)]),
      StoryGroup(StoryKind.low, [for (final p in alerts) if (q(p) > 0) Story(StoryKind.low, p)]),
      StoryGroup(StoryKind.best, [
        for (final p in top.take(5))
          if ((p['qty_sold'] as num? ?? 0) > 0) Story(StoryKind.best, {...p, 'id': p['product_id'], 'name': p['product_name']}),
      ]),
      added,
    ],
  ].where((g) => g.stories.isNotEmpty).toList();
  groups.sort((a, b) => a.seen != b.seen ? (a.seen ? 1 : -1) : a.kind.index.compareTo(b.kind.index));
  return groups;
}

/// Stories watched on this phone, kept across restarts (newest 400).
class StorySeen {
  StorySeen._();
  static final instance = StorySeen._();
  static const _key = 'hgv_story_seen';
  final _store = const FlutterSecureStorage();
  final List<String> _ids = [];
  bool _loaded = false;

  bool has(String id) => _ids.contains(id);

  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final raw = await _store.read(key: _key);
      if (raw != null) _ids.addAll(List<String>.from(jsonDecode(raw) as List));
    } catch (_) {}
  }

  void add(String id) {
    if (has(id)) return;
    _ids.add(id);
    if (_ids.length > 400) _ids.removeRange(0, _ids.length - 400);
    _store.write(key: _key, value: jsonEncode(_ids)).catchError((_) {});
  }
}

Color _color(BuildContext context, StoryKind k) {
  final c = Hgv.of(context);
  return switch (k) {
    StoryKind.fines || StoryKind.soldOut => c.danger,
    StoryKind.pending || StoryKind.low => c.warning,
    StoryKind.best => c.success,
    StoryKind.fresh => c.ink,
  };
}

IconData _icon(StoryKind k) => switch (k) {
      StoryKind.fines => PhosphorIconsFill.policeCar,
      StoryKind.pending => PhosphorIconsFill.arrowsLeftRight,
      StoryKind.soldOut => PhosphorIconsFill.prohibit,
      StoryKind.low => PhosphorIconsFill.warning,
      StoryKind.best => PhosphorIconsFill.trendUp,
      StoryKind.fresh => PhosphorIconsFill.sparkle,
    };

String _title(T t, StoryKind k) => switch (k) {
      StoryKind.fines => t('story.fines'),
      StoryKind.pending => t('story.pending'),
      StoryKind.soldOut => t('story.sold_out'),
      StoryKind.low => t('story.low'),
      StoryKind.best => t('story.best'),
      StoryKind.fresh => t('story.fresh'),
    };

String _titleFor(T t, StoryKind k, bool car) => k == StoryKind.fresh && car ? t('story.fresh_car') : _title(t, k);

/// The topic's picture: its icon on its colour, in a ring that is blue
/// until every story in it has been seen, then grey (as on Facebook).
class _TopicAvatar extends StatelessWidget {
  const _TopicAvatar({required this.kind, required this.seen, this.size = 40});
  final StoryKind kind;
  final bool seen;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.075),
      decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: seen ? c.faint : c.ink, width: size * 0.075)),
      child: Container(
        decoration: BoxDecoration(shape: BoxShape.circle, color: _color(context, kind)),
        child: Icon(_icon(kind), size: size * 0.44, color: Colors.white),
      ),
    );
  }
}

/// The tray: one tall card per topic, like Facebook's stories row.
/// Tapping one plays its stories, then the next topics'.
class StoriesRow extends StatefulWidget {
  const StoriesRow({super.key, required this.groups});
  final List<StoryGroup> groups;

  @override
  State<StoriesRow> createState() => _StoriesRowState();
}

class _StoriesRowState extends State<StoriesRow> {
  @override
  void initState() {
    super.initState();
    StorySeen.instance.load().then((_) {
      if (mounted) setState(() {});
    });
  }

  Future<void> _open(int i) async {
    await Navigator.of(context).push(PageRouteBuilder<void>(
      opaque: false,
      transitionDuration: const Duration(milliseconds: 260),
      reverseTransitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (_, __, ___) => StoryViewer(groups: widget.groups, initial: i),
      transitionsBuilder: (_, a, __, child) => FadeTransition(
        opacity: a,
        child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOut)), child: child),
      ),
    ));
    if (mounted) setState(() {}); // rings of the stories just seen
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 200,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: widget.groups.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, i) => _StoryCard(group: widget.groups[i], onTap: () => _open(i)),
        ),
      );
}

class _StoryCard extends StatelessWidget {
  const _StoryCard({required this.group, required this.onTap});
  final StoryGroup group;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final car = SessionScope.of(context).isCar;
    final first = group.stories.first;
    final n = group.stories.length;
    final sub = n == 1 ? '${first.item['name'] ?? ''}' : (car ? t('story.n_cars', {'n': n}) : t('story.n_items', {'n': n}));
    return Semantics(
      button: true,
      label: '${_titleFor(t, group.kind, car)}, $sub',
      child: GestureDetector(
        onTap: onTap,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 112,
            child: Stack(fit: StackFit.expand, children: [
              CoverPhoto(
                id: first.itemId,
                thumbnail: first.item['thumbnail'] as String?,
                isCar: car,
                fallback: _Backdrop(url: null, kind: group.kind),
              ),
              // Darkens the top and bottom so the picture and words read on any photo.
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0, 0.3, 0.55, 1],
                    colors: [Color(0x66000000), Colors.transparent, Colors.transparent, Color(0xCC000000)],
                  ),
                ),
              ),
              Positioned(left: 8, top: 8, child: _TopicAvatar(kind: group.kind, seen: group.seen)),
              Positioned(
                left: 9,
                right: 9,
                bottom: 9,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text(_titleFor(t, group.kind, car),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700, height: 1.15)),
                  const SizedBox(height: 2),
                  Text(sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Color(0xD9FFFFFF), fontSize: 11.5, fontWeight: FontWeight.w500)),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// The photo, or the topic's colour with a picture of what it is about.
class _Backdrop extends StatelessWidget {
  const _Backdrop({required this.url, required this.kind, this.fit = BoxFit.cover});
  final String? url;
  final StoryKind kind;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final base = _color(context, kind);
    final car = kind.isCar || SessionScope.of(context).isCar;
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
        child: Center(
          child: Icon(car ? PhosphorIconsFill.car : PhosphorIconsFill.package, color: const Color(0x55FFFFFF), size: 52),
        ),
      ),
    );
  }
}

/// Full-screen stories, as on Facebook: bars at the top fill as each frame
/// plays (8 s); tap right for the next, left for the previous, hold to
/// pause, swipe down to close. At the end of a topic the next one follows.
/// Each frame shows the vehicle or item large with its card and one clear
/// action (call, restock, sell, view).
class StoryViewer extends StatefulWidget {
  const StoryViewer({super.key, required this.groups, required this.initial});
  final List<StoryGroup> groups;
  final int initial;

  @override
  State<StoryViewer> createState() => _StoryViewerState();
}

class _StoryViewerState extends State<StoryViewer> with SingleTickerProviderStateMixin {
  late int _g = widget.initial;
  int _i = 0;
  late final _clock = AnimationController(vsync: this, duration: const Duration(seconds: 8))
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) _next();
    });
  double _drag = 0;

  /// The card at the bottom, measured so the photo sits above it, uncovered.
  final _cardKey = GlobalKey();
  double _cardH = 230;

  void _measureCard() {
    final h = (_cardKey.currentContext?.findRenderObject() as RenderBox?)?.size.height;
    if (h != null && (h - _cardH).abs() > 1 && mounted) setState(() => _cardH = h);
  }

  /// The whole vehicle or item (lists carry a thumbnail only), fetched when shown.
  final Map<String, Future<Map<String, dynamic>?>> _full = {};

  StoryGroup get _group => widget.groups[_g];
  Story get _story => _group.stories[_i];

  @override
  void initState() {
    super.initState();
    // Like Facebook: a topic opens at its first frame not seen yet.
    final firstNew = _group.stories.indexWhere((x) => !StorySeen.instance.has(x.id));
    _i = firstNew < 0 ? 0 : firstNew;
    _show();
  }

  @override
  void dispose() {
    _clock.dispose();
    super.dispose();
  }

  void _show() {
    StorySeen.instance.add(_story.id);
    _clock.forward(from: 0);
    HapticFeedback.selectionClick();
  }

  void _next() {
    if (_i < _group.stories.length - 1) {
      setState(() => _i++);
    } else if (_g < widget.groups.length - 1) {
      setState(() {
        _g++;
        _i = 0;
      });
    } else {
      Navigator.of(context).maybePop();
      return;
    }
    _show();
  }

  void _prev() {
    if (_i > 0) {
      setState(() => _i--);
    } else if (_g > 0) {
      setState(() {
        _g--;
        _i = _group.stories.length - 1;
      });
    }
    _show();
  }

  Future<Map<String, dynamic>?> _fullOf(Story st) => _full[st.itemId] ??= () async {
        try {
          final res = await SessionScope.of(context).api.get('${Svc.products}/products/${st.itemId}');
          final d = (res as Map)['data'];
          return d is Map ? Map<String, dynamic>.from(d) : null;
        } catch (_) {
          return null;
        }
      }();

  List<String> _photos(Map<String, dynamic>? full) {
    final raw = full?['images'];
    try {
      final list = raw is String ? jsonDecode(raw) : raw;
      if (list is List) return list.whereType<String>().toList();
    } catch (_) {}
    return const [];
  }

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
    final group = _group;
    final added = parseTimestamp(story.item['created_at']);
    final top = MediaQuery.paddingOf(context).top;
    final full = _fullOf(story);
    final bottom = MediaQuery.paddingOf(context).bottom;
    WidgetsBinding.instance.addPostFrameCallback((_) => _measureCard());

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
                  child: FutureBuilder<Map<String, dynamic>?>(
                    future: full,
                    builder: (context, snap) {
                      final photos = _photos(snap.data);
                      final url = photos.isNotEmpty ? photos.first : (story.item['thumbnail'] ?? snap.data?['thumbnail']) as String?;
                      return Stack(fit: StackFit.expand, children: [
                        // Blurred fill behind a photo that doesn't match the screen's shape.
                        Opacity(opacity: 0.35, child: _Backdrop(url: url, kind: story.kind)),
                        // The photo itself, whole, between the top bar and the card.
                        Positioned(
                          left: 0,
                          right: 0,
                          top: top + 64,
                          bottom: bottom + 12 + _cardH + 12,
                          child: _Backdrop(url: url, kind: story.kind, fit: BoxFit.contain),
                        ),
                        if (photos.length > 1)
                          Positioned(right: 14, top: top + 64, child: _Pill(icon: PhosphorIconsRegular.images, text: '${photos.length}')),
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
                // ── Top: one bar per frame of this topic, and the topic ──
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
                        for (var k = 0; k < group.stories.length; k++) ...[
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
                        _TopicAvatar(kind: group.kind, seen: false, size: 38),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(_titleFor(t, group.kind, s.isCar),
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14.5)),
                            Text(
                              [
                                if (group.stories.length > 1) '${_i + 1} / ${group.stories.length}',
                                if (added != null && story.kind != StoryKind.best) t('story.added', {'when': t.ago(added)}),
                              ].join(' · '),
                              style: const TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                          ]),
                        ),
                        IconButton(
                          tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                          onPressed: () => Navigator.of(context).maybePop(),
                          icon: const Icon(PhosphorIconsRegular.x, color: Colors.white),
                        ),
                      ]),
                    ]),
                  ),
                ),
                // ── Bottom: the vehicle's or item's card ──
                Positioned(
                  key: _cardKey,
                  left: 10,
                  right: 10,
                  bottom: bottom + 12,
                  child: story.kind.isCar
                      ? _VehicleCard(
                          story: story,
                          holder: carHolder(s, story.item),
                          onDetails: () => _pausedWhile(() => openItem(context, story.item)),
                          onCall: (phone) => _pausedWhile(() => launchUrl(Uri(scheme: 'tel', path: phone))),
                          onSms: (phone) => _pausedWhile(() => launchUrl(Uri(scheme: 'sms', path: phone))),
                          currency: s.currency,
                        )
                      : FutureBuilder<Map<String, dynamic>?>(
                          future: full,
                          builder: (context, snap) => _ProductCard(story: story, full: snap.data, run: _pausedWhile),
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

/// The card of a shop's story: the item, the one thing to know (how many
/// are left, how many sold) and the action that goes with it.
class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.story, required this.full, required this.run});
  final Story story;
  final Map<String, dynamic>? full;
  final Future<void> Function(Future<void> Function()) run;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final item = {...story.item, ...?full}..remove('images');
    num n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
    final qty = n(item['quantity']).toInt();
    final added = parseTimestamp(item['created_at']);
    final color = _color(context, story.kind);
    final (headline, detail) = switch (story.kind) {
      StoryKind.soldOut => (t('story.sold_out'), t('story.sold_out_hint')),
      StoryKind.low => (t('story.left', {'n': groupDigits(qty)}), t('story.low_hint', {'n': s.lowStock})),
      StoryKind.best => (
          t('story.sold_week', {'n': groupDigits(n(story.item['qty_sold']))}),
          s.canSeeFinancials && story.item['revenue'] != null ? money(n(story.item['revenue']), s.currency) : '',
        ),
      _ => (
          qty > 0 ? t('stock.in_stock_n', {'n': groupDigits(qty)}) : t('stock.f_sold'),
          added == null ? '' : t('story.added', {'when': t.ago(added)}),
        ),
    };
    final restockFirst = story.kind == StoryKind.soldOut || story.kind == StoryKind.low;
    // Added and already sold (a car, say): nothing to sell, only to look at.
    final canAct = restockFirst || qty > 0;
    final price = item['selling_price'];
    return Container(
      decoration: BoxDecoration(
        color: c.elevated,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 24, offset: Offset(0, 8))],
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Expanded(
            child: Text('${item['name'] ?? ''}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w900, letterSpacing: -0.3)),
          ),
          if (price != null) Text(money(n(price), s.currency), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: c.muted)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Icon(_icon(story.kind), size: 20, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(headline, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color))),
        ]),
        if (detail.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(detail, style: TextStyle(fontSize: 12.5, color: c.faint)),
        ],
        const SizedBox(height: 12),
        Row(children: [
          if (canAct) Expanded(
            flex: 3,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(42)),
              onPressed: full == null
                  ? null
                  : () => run(() async {
                        if (restockFirst) {
                          await restock(context, item);
                        } else {
                          await recordSale(context, product: item);
                        }
                      }),
              icon: Icon(restockFirst ? PhosphorIconsBold.plus : PhosphorIconsBold.receipt, size: 18),
              label: Text(restockFirst ? t('form.restock') : t('form.sell')),
            ),
          ),
          if (canAct) const SizedBox(width: 8),
          Expanded(
            flex: 2,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(42)),
              onPressed: full == null ? null : () => run(() => openItem(context, item)),
              child: Text(t('story.view_short')),
            ),
          ),
        ]),
      ]),
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
    final color = _color(context, story.kind);
    final fines = int.tryParse(a['penalty_count'] ?? '') ?? 0;
    final fineAmount = num.tryParse(a['penalty_amount'] ?? '') ?? 0;
    final specs = [a['plate_no'], a['year'], a['color']].where((x) => x != null && x.isNotEmpty).join(' · ');

    return Container(
      decoration: BoxDecoration(
        color: c.elevated,
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
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
                  child: const Shimmer(
                    child: Row(children: [
                      Bone(height: 40, circle: true),
                      SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                          Bone(width: 120, height: 12),
                          SizedBox(height: 8),
                          Bone(width: 90, height: 9),
                        ]),
                      ),
                    ]),
                  ),
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
