import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../car_photos.dart';
import '../charts.dart';
import '../config.dart';
import '../covers.dart';
import '../format.dart';
import '../forms.dart';
import '../holder.dart';
import '../i18n.dart';
import '../session.dart';
import '../sheets.dart';
import '../stories.dart';
import '../theme.dart';
import '../widgets.dart';

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;

/// One vehicle or product on its own page, opened from search, lists,
/// stories and notifications: its photos to swipe through (tap for full
/// screen), price and status, details, who has the car (with call and
/// text), and its latest sales.
class ItemScreen extends StatefulWidget {
  const ItemScreen({super.key, required this.item});
  final Map<String, dynamic> item;

  @override
  State<ItemScreen> createState() => _ItemScreenState();
}

class _ItemScreenState extends State<ItemScreen> {
  late Map<String, dynamic> _item = widget.item;
  List<String> _photos = const [];
  int _page = 0;
  bool _savingPhoto = false;
  late Future<dynamic> _recent;
  Future<CarHolder?>? _holder;

  String get _id => '${widget.item['id'] ?? ''}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_holder != null) return;
    final s = SessionScope.of(context);
    _recent = s.api.get('${Svc.sales}/sales', query: {'page': '1', 'limit': '5', 'product_id': _id});
    _holder = s.isCar ? carHolder(s, _item) : Future.value(null);
    _loadFull(s);
  }

  /// Lists carry a thumbnail only; the item itself has every photo.
  Future<void> _loadFull(Session s) async {
    if (_id.isEmpty) return;
    try {
      final res = await s.api.get('${Svc.products}/products/$_id');
      final data = (res as Map)['data'];
      if (data is! Map || !mounted) return;
      final full = Map<String, dynamic>.from(data);
      final photos = <String>[];
      try {
        final list = jsonDecode('${full['images'] ?? '[]'}');
        if (list is List) photos.addAll(list.whereType<String>().where((x) => x.startsWith('data:image/')));
      } catch (_) {}
      full.remove('images');
      setState(() {
        _item = {..._item, ...full};
        _photos = photos;
      });
    } catch (_) {/* the list's data is enough to show */}
  }

  void _openViewer(int index) {
    if (_photos.isEmpty) return;
    Navigator.of(context).push(PageRouteBuilder<void>(
      opaque: false,
      pageBuilder: (_, __, ___) => _PhotoViewer(
        photos: _photos,
        initial: index,
        onSave: (photo) async => _say(await savePhotoToPhone(photo) ? 'photo.saved_to_phone' : 'photo.save_to_phone_failed'),
        onDelete: _deletePhoto,
      ),
      transitionsBuilder: (_, a, __, child) => FadeTransition(opacity: a, child: child),
    ));
  }

  Future<void> _sell() async {
    if (!await recordSale(context, product: _item) || !mounted) return;
    final s = SessionScope.of(context);
    setState(() => _recent = s.api.get('${Svc.sales}/sales', query: {'page': '1', 'limit': '5', 'product_id': _id}));
    _loadFull(s);
  }

  Future<void> _restock() async {
    final next = await restock(context, _item);
    if (next != null && mounted) setState(() => _item = {..._item, 'quantity': next});
  }

  Future<void> _edit() async {
    final saved = SessionScope.of(context).isCar ? await editVehicle(context, _item) : await editProduct(context, product: _item);
    if (saved != null && mounted) setState(() => _item = {..._item, ...saved}..remove('images'));
  }

  void _say(String key) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(T.of(context)(key))));
  }

  /// Camera, or several from the gallery → stored on the item, like adding
  /// them on the website (up to 7 photos, cars and shop products alike).
  Future<void> _addPhoto() async {
    if (_savingPhoto) return;
    final room = maxCarPhotos - _photos.length;
    if (room <= 0) return _say('photo.limit');
    final s = SessionScope.of(context);
    List<CarPhoto> picked;
    try {
      picked = await pickPhotos(context, room: room);
    } catch (_) {
      return _say('photo.unreadable');
    }
    if (picked.isEmpty || !mounted) return;
    setState(() => _savingPhoto = true);
    try {
      final next = await updateCarPhotos(s, _id, (fresh) => [...fresh, ...picked.map((p) => p.photo)],
          thumbs: {for (final p in picked) p.photo: p.thumb});
      if (!mounted) return;
      final added = picked.where((p) => next.contains(p.photo)).length;
      setState(() {
        _photos = next;
        _page = next.length - 1;
        if (next.isNotEmpty && added == next.length) _item = {..._item, 'thumbnail': picked.first.thumb};
      });
      final t = T.of(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(added == 0 ? t('photo.limit') : (added == 1 ? t('photo.added') : t('photo.added_n', {'n': added})))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(T.of(context), e))));
    } finally {
      if (mounted) setState(() => _savingPhoto = false);
    }
  }

  /// Removes a photo from the item (asked first). True when it was removed.
  Future<bool> _deletePhoto(String photo) async {
    final t = T.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(t('photo.delete_q')),
        content: Text(t('photo.delete_body')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('app.cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Hgv.of(context).danger),
            onPressed: () => Navigator.pop(c, true),
            child: Text(t('photo.delete')),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return false;
    final s = SessionScope.of(context);
    try {
      final next = await updateCarPhotos(s, _id, (fresh) => fresh.where((x) => x != photo).toList());
      if (!mounted) return true;
      setState(() {
        _photos = next;
        _page = 0;
        if (next.isEmpty) _item = {..._item, 'thumbnail': null};
      });
      _say('photo.deleted');
      return true;
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(t, e))));
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final c = Hgv.of(context);
    final item = _item;
    final a = attributesOf(item['attributes']);
    final qty = _n(item['quantity']);
    final low = qty > 0 && qty <= s.lowStock;
    final pending = a['sale_status'] == 'pending';
    final status = qty <= 0
        ? (t('dash.out_of_stock'), c.danger)
        : s.isCar
            ? (pending ? (t('stock.f_pending'), c.warning) : (t('stock.f_available'), c.success))
            : (low ? (t('detail.low'), c.warning) : (t('stock.in_stock_n', {'n': groupDigits(qty)}), c.success));
    final fines = int.tryParse(a['penalty_count'] ?? '') ?? 0;
    final specs = [a['plate_no'], a['year'], a['color']].where((x) => x != null && x.isNotEmpty).join(' · ');
    final rows = <(String, String)>[
      if (!s.isCar) (t('detail.in_stock'), groupDigits(qty)),
      if (s.isCar) ...[
        (t('detail.plate'), a['plate_no'] ?? ''),
        (t('detail.chassis'), a['chassis_no'] ?? ''),
        (t('detail.year'), a['year'] ?? ''),
        (t('detail.colour'), a['color'] ?? ''),
        (t('detail.type'), a['car_type'] ?? ''),
        if (fines > 0) (t('detail.fines'), '$fines · ${money(num.tryParse(a['penalty_amount'] ?? '') ?? 0, s.currency)}'),
      ],
      ('${item['category'] ?? ''}'.isEmpty ? '' : t('detail.category'), '${item['category'] ?? ''}'),
      if (!s.isCar) (t('detail.barcode'), '${item['barcode'] ?? ''}'),
    ].where((r) => r.$1.isNotEmpty && r.$2.isNotEmpty).toList();
    final showHolder = s.isCar && (qty <= 0 || pending);
    // A car waiting for its transfer is already sold.
    final canSell = qty > 0 && !(s.isCar && pending);
    final width = MediaQuery.sizeOf(context).width;

    return Scaffold(
      appBar: AppBar(
        title: Text('${item['name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis),
        titleTextStyle: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.text),
        actions: [
          if (_id.isNotEmpty)
            IconButton(tooltip: t(s.isCar ? 'vehicle.edit' : 'form.edit_product'), icon: const Icon(Icons.edit_outlined), onPressed: _edit),
        ],
      ),
      body: ListView(padding: EdgeInsets.zero, children: [
        // ── Photos ──
        SizedBox(
          width: width,
          height: width * 0.75,
          child: Stack(children: [
            if (_photos.isEmpty)
              GestureDetector(
                onTap: () => _openViewer(0),
                child: CoverPhoto(id: _id, thumbnail: item['thumbnail'] as String?, isCar: s.isCar, width: width, height: width * 0.75),
              )
            else
              PageView.builder(
                itemCount: _photos.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (_, i) => GestureDetector(
                  onTap: () => _openViewer(i),
                  // The whole photo, never cropped, over a soft blurred copy of itself.
                  child: Stack(fit: StackFit.expand, children: [
                    ImageFiltered(
                      imageFilter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                      child: Opacity(opacity: 0.6, child: UrlImage(url: _photos[i], fallback: ColoredBox(color: c.paper))),
                    ),
                    UrlImage(url: _photos[i], fit: BoxFit.contain, fallback: ColoredBox(color: c.paper)),
                  ]),
                ),
              ),
            if (_id.isNotEmpty)
              Positioned(
                right: 10,
                bottom: 10,
                child: Material(
                  color: Colors.black54,
                  shape: const StadiumBorder(),
                  child: InkWell(
                    customBorder: const StadiumBorder(),
                    onTap: _savingPhoto ? null : _addPhoto,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        if (_savingPhoto)
                          const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        else
                          const Icon(Icons.add_a_photo_outlined, size: 16, color: Colors.white),
                        const SizedBox(width: 6),
                        Text(T.of(context)(_savingPhoto ? 'photo.saving' : 'photo.add'),
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ),
                ),
              ),
            if (_photos.length > 1)
              Positioned(
                right: 10,
                top: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(12)),
                  child: Text('${_page + 1}/${_photos.length}',
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ),
          ]),
        ),
        if (_photos.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 0; i < _photos.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: i == _page ? c.ink : c.border),
                ),
            ]),
          ),
        // ── Name, price, status ──
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('${item['name'] ?? ''}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
            if (specs.isNotEmpty) Text(specs, style: TextStyle(fontSize: 13, color: c.faint, fontWeight: FontWeight.w500)),
            const SizedBox(height: 8),
            Row(children: [
              StatusChip(status.$1, status.$2),
              if (fines > 0) ...[
                const SizedBox(width: 6),
                StatusChip(fines == 1 ? t('stock.fine_one') : t('stock.fines_n', {'n': fines}), c.danger),
              ],
              const Spacer(),
              Text(money(_n(item['selling_price']), s.currency), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            ]),
            if (!s.isCar) ...[
              const SizedBox(height: 10),
              // Full bar at three times the low-stock level: plenty.
              Meter(
                value: s.lowStock <= 0 ? 1 : qty / (s.lowStock * 3),
                color: qty <= 0 ? c.danger : (low ? c.warning : c.success),
                height: 6,
              ),
            ],
            if ('${item['description'] ?? ''}'.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('${item['description']}'.trim(), style: TextStyle(fontSize: 13.5, color: c.muted, height: 1.35)),
            ],
            if (_id.isNotEmpty && (canSell || !s.isCar)) ...[
              const SizedBox(height: 12),
              Row(children: [
                if (canSell)
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _sell,
                      icon: const Icon(Icons.point_of_sale_outlined, size: 20),
                      label: Text(t('form.sell')),
                    ),
                  ),
                if (canSell && !s.isCar) const SizedBox(width: 10),
                if (!s.isCar)
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                      onPressed: _restock,
                      icon: const Icon(Icons.add_box_outlined, size: 20),
                      label: Text(t('form.restock')),
                    ),
                  ),
              ]),
            ],
            const SizedBox(height: 4),
            for (final r in rows) InfoRow(r.$1, r.$2),
          ]),
        ),
        // ── Who has the car ──
        if (showHolder)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: FutureBuilder<CarHolder?>(
              future: _holder,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Shimmer(child: RowSkeleton(leading: RowLead.circle, titleWidth: 140));
                }
                final phone = snap.data?.phone ?? '';
                return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  HolderBlock(holder: snap.data, currency: s.currency, finesNote: fines > 0),
                  if (phone.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(
                        child: FilledButton.icon(
                          style: FilledButton.styleFrom(backgroundColor: c.success, minimumSize: const Size.fromHeight(42)),
                          onPressed: () => launchUrl(Uri(scheme: 'tel', path: phone)),
                          icon: const Icon(Icons.call_rounded, size: 18),
                          label: Text(t('debts.call')),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(42)),
                          onPressed: () => launchUrl(Uri(scheme: 'sms', path: phone)),
                          icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
                          label: Text(t('debts.sms')),
                        ),
                      ),
                    ]),
                  ],
                ]);
              },
            ),
          ),
        // ── Latest sales ──
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 14, 12, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(t('detail.recent_sales'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            FutureBuilder<dynamic>(
              future: _recent,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Shimmer(child: Column(children: [RowSkeleton(leading: RowLead.none, titleWidth: 140)]));
                }
                final list = snap.hasData ? (((snap.data as Map)['data'] as Map?)?['items'] as List? ?? const []) : const [];
                if (list.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(snap.hasError ? errorText(t, snap.error!) : t('detail.no_sales'), style: TextStyle(color: c.faint)),
                  );
                }
                return Column(children: [
                  for (final raw in list.whereType<Map>())
                    Builder(builder: (context) {
                      final sale = Map<String, dynamic>.from(raw);
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        visualDensity: VisualDensity.compact,
                        onTap: () => showSaleSheet(context, sale),
                        title: Text('${sale['quantity'] ?? 1} × ${groupDigits(_n(sale['unit_price']))}',
                            style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${payLabel(t, sale['payment_method'] as String?)} · ${t.dateTime(sale['created_at'] as String?)}'),
                        trailing: Text(money(_n(sale['total_amount']), s.currency), style: const TextStyle(fontWeight: FontWeight.w800)),
                      );
                    }),
                ]);
              },
            ),
          ]),
        ),
      ]),
    );
  }
}

/// Photos full screen on black: swipe between them, pinch to zoom, tap ✕
/// or swipe back to close.
class _PhotoViewer extends StatefulWidget {
  const _PhotoViewer({required this.photos, required this.initial, required this.onSave, this.onDelete});
  final List<String> photos;
  final int initial;
  final Future<void> Function(String photo) onSave;

  /// Null when this person can't remove photos.
  final Future<bool> Function(String photo)? onDelete;

  @override
  State<_PhotoViewer> createState() => _PhotoViewerState();
}

class _PhotoViewerState extends State<_PhotoViewer> {
  late final _pages = PageController(initialPage: widget.initial);
  late int _page = widget.initial;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        PageView.builder(
          controller: _pages,
          itemCount: widget.photos.length,
          onPageChanged: (i) => setState(() => _page = i),
          itemBuilder: (_, i) => InteractiveViewer(
            maxScale: 5,
            child: Center(child: UrlImage(url: widget.photos[i], fit: BoxFit.contain, fallback: const SizedBox.shrink())),
          ),
        ),
        SafeArea(
          child: Row(children: [
            IconButton(
              tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close_rounded, color: Colors.white),
            ),
            const Spacer(),
            if (widget.photos.length > 1)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: Text('${_page + 1}/${widget.photos.length}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
              ),
            IconButton(
              tooltip: T.of(context)('photo.save_to_phone'),
              onPressed: () => widget.onSave(widget.photos[_page]),
              icon: const Icon(Icons.download_rounded, color: Colors.white),
            ),
            if (widget.onDelete != null)
              IconButton(
                tooltip: T.of(context)('photo.delete'),
                onPressed: () async {
                  final nav = Navigator.of(context);
                  if (await widget.onDelete!(widget.photos[_page])) nav.pop();
                },
                icon: const Icon(Icons.delete_outline_rounded, color: Colors.white),
              ),
          ]),
        ),
      ]),
    );
  }
}
