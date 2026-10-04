import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'config.dart';
import 'media.dart';
import 'session.dart';
import 'theme.dart';

/// Sharp photos for cards and stories. Lists only carry a 160px thumbnail;
/// this asks product-service for each product's first photo resized for a
/// phone (`/products/covers`), a few ids per request, and remembers them for
/// the session.
class CoverStore extends ChangeNotifier {
  CoverStore._(this._session);
  final Session _session;

  static final _stores = Expando<CoverStore>();
  static CoverStore of(Session s) => _stores[s] ??= CoverStore._(s);

  /// Product id → photo bytes, or null when it has no photo.
  final Map<String, Uint8List?> _covers = {};
  final Set<String> _wanted = {}, _inFlight = {};
  Timer? _batch;

  static const size = 720;

  Uint8List? cover(String id) => _covers[id];
  bool known(String id) => _covers.containsKey(id);

  /// Asks for [id]'s photo; requests made together go as one.
  void want(String id) {
    if (id.isEmpty || _covers.containsKey(id) || _inFlight.contains(id)) return;
    _wanted.add(id);
    _batch ??= Timer(const Duration(milliseconds: 60), _fetch);
  }

  Future<void> _fetch() async {
    _batch = null;
    final ids = _wanted.take(30).toList();
    _wanted.removeAll(ids);
    _inFlight.addAll(ids);
    try {
      final res = await _session.api.get('${Svc.products}/products/covers', query: {'ids': ids.join(','), 'size': '$size'});
      final data = (res as Map)['data'];
      for (final id in ids) {
        final url = data is Map ? data[id] as String? : null;
        final bytes = dataUrlBytes(url);
        _covers[id] = bytes == null || bytes.isEmpty ? null : bytes;
      }
      notifyListeners();
    } catch (_) {
      // Network trouble: try again next time the photo is shown.
    } finally {
      _inFlight.removeAll(ids);
      if (_wanted.isNotEmpty) _batch ??= Timer(const Duration(milliseconds: 60), _fetch);
    }
  }
}

/// A product's photo: the thumbnail at once, then the sharp version fades
/// in over it. Falls back to an icon when there is no photo at all.
class CoverPhoto extends StatefulWidget {
  const CoverPhoto({
    super.key,
    required this.id,
    required this.thumbnail,
    required this.isCar,
    this.width,
    this.height,
    this.radius = 0,
    this.fallback,
  });
  final String id;
  final String? thumbnail;
  final bool isCar;
  final double? width, height;
  final double radius;
  final Widget? fallback;

  @override
  State<CoverPhoto> createState() => _CoverPhotoState();
}

class _CoverPhotoState extends State<CoverPhoto> {
  CoverStore? _store;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final store = CoverStore.of(SessionScope.of(context));
    if (!identical(store, _store)) {
      _store?.removeListener(_changed);
      _store = store..addListener(_changed);
    }
    store.want(widget.id);
  }

  @override
  void didUpdateWidget(CoverPhoto old) {
    super.didUpdateWidget(old);
    if (old.id != widget.id) _store?.want(widget.id);
  }

  @override
  void dispose() {
    _store?.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final sharp = _store?.cover(widget.id);
    final fallback = widget.fallback ??
        Container(
          color: c.paper,
          child: Icon(widget.isCar ? Icons.directions_car_filled_outlined : Icons.inventory_2_outlined,
              color: c.faint, size: ((widget.height ?? 60) * 0.4).clamp(16, 44).toDouble()),
        );
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final cacheW = widget.width == null ? null : (widget.width! * dpr).round();
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.radius),
      child: SizedBox(
        width: widget.width,
        height: widget.height,
        child: Stack(fit: StackFit.expand, children: [
          UrlImage(url: widget.thumbnail, fallback: fallback),
          AnimatedOpacity(
            opacity: sharp == null ? 0 : 1,
            duration: const Duration(milliseconds: 280),
            child: sharp == null
                ? const SizedBox.shrink()
                : Image.memory(sharp,
                    fit: BoxFit.cover, gaplessPlayback: true, filterQuality: FilterQuality.medium, cacheWidth: cacheW),
          ),
        ]),
      ),
    );
  }
}
