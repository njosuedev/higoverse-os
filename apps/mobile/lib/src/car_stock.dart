import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'config.dart';
import 'format.dart';
import 'forms.dart';
import 'i18n.dart';
import 'live/scoped_route.dart';
import 'session.dart';
import 'sheets.dart';
import 'theme.dart';
import 'widgets.dart';

// Car dealers' stock by car name, and each car's chassis and plate numbers.
// Same calls as the website's Vehicles page (ModelGroups / AssignCarsModal):
// GET /products/models, GET /products?name=, POST /products/assign.

/// The chassis and plate fields, in the order they're shown.
const carIdFields = ['chassis_no', 'plate_no'];

/// Plate/chassis as stored: upper case, single spaces.
String normalizeCarId(String v) => v.trim().replaceAll(RegExp(r'\s+'), ' ').toUpperCase();

/// "#3" numbers per car name, counted in the order the cars came in.
Map<String, int> carNumbers(List<Map<String, dynamic>> cars) {
  final out = <String, int>{};
  final seen = <String, int>{};
  for (final c in cars) {
    final name = '${c['name'] ?? ''}';
    seen[name] = (seen[name] ?? 0) + 1;
    out['${c['id']}'] = seen[name]!;
  }
  return out;
}

/// The chassis/plate keys ("chassis_no:LGX001") typed or held by more than
/// one car of [cars], given what's typed in [typed] (car id → field → text).
Set<String> repeatedCarIds(List<Map<String, dynamic>> cars, Map<String, Map<String, String>> typed) {
  final count = <String, int>{};
  for (final c in cars) {
    final a = attributesOf(c['attributes']);
    for (final f in carIdFields) {
      final k = carKey(typed['${c['id']}']?[f] ?? a[f]);
      if (k.isNotEmpty) count['$f:$k'] = (count['$f:$k'] ?? 0) + 1;
    }
  }
  return {for (final e in count.entries) if (e.value > 1) e.key};
}

/// The body of POST /products/assign: only cars whose typed numbers differ
/// from what they have; blank fields are left as they are.
Map<String, dynamic>? assignBody(List<Map<String, dynamic>> cars, Map<String, Map<String, String>> typed) {
  final out = <Map<String, dynamic>>[];
  for (final c in cars) {
    final a = attributesOf(c['attributes']);
    final row = <String, dynamic>{'id': '${c['id']}'};
    for (final f in carIdFields) {
      final v = normalizeCarId(typed['${c['id']}']?[f] ?? '');
      if (v.isNotEmpty && v != (a[f] ?? '')) row[f] = v;
    }
    if (row.length > 1) out.add(row);
  }
  return out.isEmpty ? null : {'cars': out};
}

// ─────────────────────────── Car names (grouped stock) ───────────────────────────

/// Each car name once with its number of cars; tapping one opens its cars.
/// Reloads whenever [refreshKey] changes.
class CarModelsView extends StatefulWidget {
  const CarModelsView({super.key, required this.query, required this.status, required this.refreshKey, required this.onChanged});
  final String query;

  /// The list's filter chip: all | available | pending | sold | penalties | unassigned.
  final String status;
  final int refreshKey;

  /// After a stock in or a save, so the screen can reload.
  final VoidCallback onChanged;

  @override
  State<CarModelsView> createState() => _CarModelsViewState();
}

class _CarModelsViewState extends State<CarModelsView> {
  List<Map<String, dynamic>>? _models;
  Object? _error;
  int _gen = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_models == null && _error == null && _gen == 0) _load();
  }

  @override
  void didUpdateWidget(CarModelsView old) {
    super.didUpdateWidget(old);
    if (old.query != widget.query || old.status != widget.status || old.refreshKey != widget.refreshKey) _load();
  }

  Future<void> _load() async {
    final gen = ++_gen;
    final s = SessionScope.of(context);
    setState(() => _error = null);
    try {
      final q = <String, String>{if (widget.status != 'all') 'status': widget.status};
      if (widget.query.trim().isNotEmpty) q['q'] = widget.query.trim();
      final res = await s.api.get('${Svc.products}/products/models', query: q);
      if (!mounted || gen != _gen) return;
      setState(() => _models = ((res as Map)['data'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  Future<void> _open(Map<String, dynamic> m) async {
    await openCarIds(context, name: '${m['name']}', status: widget.status == 'all' ? null : widget.status);
    if (mounted) widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final models = _models;
    final Widget content;
    if (_error != null && models == null) {
      content = ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
        EmptyState(
          icon: Icons.cloud_off_outlined,
          message: _error is ApiException && ((_error as ApiException).status == 404 || (_error as ApiException).status == 405)
              ? t('models.unavailable')
              : errorText(t, _error!),
          onRetry: _load,
        ),
      ]);
    } else if (models == null) {
      content = const SizedBox.shrink();
    } else if (models.isEmpty) {
      content = ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
        EmptyState(icon: Icons.directions_car_outlined, message: widget.query.isEmpty ? t('stock.empty') : t('stock.no_match', {'q': widget.query})),
      ]);
    } else {
      final unassigned = models.fold<int>(0, (s, m) => s + ((m['unassigned'] as num?) ?? 0).toInt());
      content = ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(0, 4, 0, 88),
        children: [
          if (unassigned > 0 && widget.status != 'unassigned')
            _AssignBanner(
              count: unassigned,
              onTap: () async {
                await openCarIds(context, status: 'unassigned');
                if (mounted) widget.onChanged();
              },
            ),
          for (var i = 0; i < models.length; i++) ...[
            if (i > 0) const Divider(indent: 16, endIndent: 16),
            _ModelTile(model: models[i], status: widget.status, onTap: () => _open(models[i])),
          ],
        ],
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: SkeletonGate(
        loading: models == null && _error == null,
        skeleton: const _ModelsSkeleton(),
        child: content,
      ),
    );
  }
}

class _AssignBanner extends StatelessWidget {
  const _AssignBanner({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Hgv.of(context);
    final t = T.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      child: Material(
        color: c.warning.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
            child: Row(children: [
              Icon(Icons.tag_rounded, color: c.warning, size: 20),
              const SizedBox(width: 10),
              Expanded(child: Text(t('assign.banner', {'n': count}), style: const TextStyle(fontWeight: FontWeight.w600))),
              Text(t('assign.open'), style: TextStyle(fontWeight: FontWeight.w800, color: c.warning)),
              Icon(Icons.chevron_right_rounded, color: c.warning),
            ]),
          ),
        ),
      ),
    );
  }
}

class _ModelTile extends StatelessWidget {
  const _ModelTile({required this.model, required this.status, required this.onTap});
  final Map<String, dynamic> model;
  final String status;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    int n(String k) => ((model[k] as num?) ?? 0).toInt();
    // "All" counts the cars still owned; sold ones are mentioned beside.
    final count = status == 'all' ? n('in_stock') : n('count');
    final sold = status == 'all' ? n('count') - n('in_stock') : 0;
    final lo = model['min_price'] as num?, hi = model['max_price'] as num?;
    final price = lo == null ? '' : (hi == null || hi == lo ? money(lo, s.currency) : '${groupDigits(lo)} – ${money(hi, s.currency)}');
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.fromLTRB(16, 4, 4, 4),
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(color: c.ink.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
        alignment: Alignment.center,
        child: Text('$count', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: c.ink)),
      ),
      title: Text('${model['name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 3),
        child: Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          if (n('pending') > 0) StatusChip(t('models.pending', {'n': n('pending')}), c.warning),
          if (n('unassigned') > 0) StatusChip(t('models.no_ids', {'n': n('unassigned')}), c.danger),
          if (sold > 0) StatusChip(t('models.sold', {'n': sold}), c.faint),
          if (price.isNotEmpty) Text(price, style: TextStyle(color: c.muted)),
        ]),
      ),
    );
  }
}

/// Car names loading: the count tile, the name, its chips, the add button.
class _ModelsSkeleton extends StatelessWidget {
  const _ModelsSkeleton();

  static const _widths = [140.0, 110.0, 170.0, 125.0, 150.0, 100.0, 160.0];

  @override
  Widget build(BuildContext context) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 4),
        children: [
          Shimmer(
            child: Column(children: [
              for (var i = 0; i < 7; i++) ...[
                if (i > 0) const Divider(indent: 16, endIndent: 16),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: Row(children: [
                    const Bone(width: 44, height: 44, radius: 12),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Bone(width: _widths[i], height: 13),
                        const SizedBox(height: 8),
                        Row(children: [
                          if (i.isEven) ...const [Bone(width: 70, height: 18, radius: 10), SizedBox(width: 6)],
                          const Bone(width: 96, height: 9),
                        ]),
                      ]),
                    ),
                    const Bone(height: 24, circle: true),
                  ]),
                ),
              ],
            ]),
          ),
        ],
      );
}

// ─────────────────────────── Chassis and plate, car by car ───────────────────────────

/// One car name's cars ([name]), the cars just stocked in ([ids]), or every
/// car still missing its chassis or plate (status "unassigned"). Missing
/// numbers are typed straight in and saved together.
Future<void> openCarIds(BuildContext context, {String? name, String? status, List<String>? ids}) =>
    pushScoped<void>(context, CarIdsScreen(name: name, status: status, ids: ids));

class CarIdsScreen extends StatefulWidget {
  const CarIdsScreen({super.key, this.name, this.status, this.ids});
  final String? name, status;
  final List<String>? ids;

  @override
  State<CarIdsScreen> createState() => _CarIdsScreenState();
}

class _CarIdsScreenState extends State<CarIdsScreen> {
  List<Map<String, dynamic>>? _cars;
  Object? _error;
  bool _saving = false;
  final Map<String, TextEditingController> _fields = {};

  /// A number the server refused: car id → field → whose it is.
  final Map<String, Map<String, String>> _refused = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_cars == null && _error == null) _load();
  }

  @override
  void dispose() {
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final s = SessionScope.of(context);
    setState(() => _error = null);
    try {
      final q = <String, String>{'limit': '1000'};
      if (widget.name != null) q['name'] = widget.name!;
      final status = widget.status ?? (widget.name == null ? 'unassigned' : null);
      if (status != null) q['status'] = status;
      final res = await s.api.get('${Svc.products}/products', query: q);
      final only = widget.ids?.toSet();
      final cars = (((res as Map)['data'] as Map?)?['items'] as List? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .where((c) => only == null || only.contains('${c['id']}'))
          .toList()
        // Grouped by name, oldest first: #1 is the first one stocked in.
        ..sort((a, b) {
          final byName = '${a['name']}'.compareTo('${b['name']}');
          if (byName != 0) return byName;
          final byDate = '${a['created_at']}'.compareTo('${b['created_at']}');
          return byDate != 0 ? byDate : '${a['id']}'.compareTo('${b['id']}');
        });
      if (mounted) setState(() => _cars = cars);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  TextEditingController _field(String id, String f) => _fields.putIfAbsent('$id:$f', TextEditingController.new);

  Map<String, Map<String, String>> get _typed {
    final out = <String, Map<String, String>>{};
    _fields.forEach((k, c) {
      if (c.text.trim().isEmpty) return;
      final i = k.lastIndexOf(':');
      (out[k.substring(0, i)] ??= {})[k.substring(i + 1)] = c.text;
    });
    return out;
  }

  Future<void> _save() async {
    final t = T.of(context);
    final cars = _cars ?? const [];
    final typed = _typed;
    if (repeatedCarIds(cars, typed).isNotEmpty) return _say(t('assign.repeated'));
    final body = assignBody(cars, typed);
    if (body == null) return;
    final s = SessionScope.of(context);
    setState(() => _saving = true);
    try {
      final res = await s.api.post('${Svc.products}/products/assign', body);
      final n = (((res as Map?)?['data'] as Map?)?['updated'] as num?)?.toInt() ?? (body['cars'] as List).length;
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      _say(t('assign.saved', {'n': n}));
      for (final c in _fields.values) {
        c.dispose();
      }
      _fields.clear();
      _refused.clear();
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      final car = '${e.detail?['car_id'] ?? ''}', field = '${e.detail?['field'] ?? ''}';
      if (e.status == 409 && car.isNotEmpty && carIdFields.contains(field)) {
        setState(() => (_refused[car] ??= {})[field] = '${e.detail?['product_name'] ?? ''}');
        _say(t(field == 'plate_no' ? 'vehicle.plate_taken' : 'vehicle.chassis_taken', {'name': '${e.detail?['product_name'] ?? ''}'}));
      } else {
        _say(e.status == 404 || e.status == 405 ? t('stockin.unavailable') : errorText(t, e));
      }
    } catch (e) {
      if (mounted) _say(errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _say(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final cars = _cars;
    final typed = _typed;
    final repeated = cars == null ? const <String>{} : repeatedCarIds(cars, typed);
    final pending = cars == null ? 0 : ((assignBody(cars, typed)?['cars'] as List?)?.length ?? 0);
    final grouped = widget.name == null;

    final Widget content;
    if (_error != null && cars == null) {
      content = ListView(children: [EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)]);
    } else if (cars == null) {
      content = const SizedBox.shrink();
    } else if (cars.isEmpty) {
      content = ListView(children: [EmptyState(icon: Icons.verified_outlined, message: t('assign.none'))]);
    } else {
      final numbers = carNumbers(cars);
      content = ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
        itemCount: cars.length,
        itemBuilder: (context, i) {
          final car = cars[i];
          final id = '${car['id']}';
          final first = i == 0 || cars[i - 1]['name'] != car['name'];
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (grouped && first)
              Padding(
                padding: EdgeInsets.fromLTRB(4, i == 0 ? 4 : 16, 4, 6),
                child: Text('${car['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            _CarIdCard(
              car: car,
              number: numbers[id] ?? i + 1,
              field: (f) => _field(id, f),
              error: (f) {
                final a = attributesOf(car['attributes']);
                final v = _field(id, f).text;
                if (_refused[id]?[f] != null) {
                  return t(f == 'plate_no' ? 'vehicle.plate_taken' : 'vehicle.chassis_taken', {'name': _refused[id]![f]!});
                }
                return repeated.contains('$f:${carKey(v.isEmpty ? a[f] : v)}') && v.isNotEmpty ? t('assign.repeated_one') : null;
              },
              onChanged: (f) => setState(() => _refused[id]?.remove(f)),
            ),
          ]);
        },
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(widget.name ?? t('assign.title'))),
      body: SkeletonGate(loading: cars == null && _error == null, skeleton: const _CarIdsSkeleton(), child: content),
      bottomNavigationBar: pending == 0
          ? null
          : SafeArea(
              child: Container(
                decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: FilledButton(
                  onPressed: _saving || repeated.isNotEmpty ? null : _save,
                  child: _saving
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                      : Text(repeated.isNotEmpty ? t('assign.repeated') : t('assign.save', {'n': pending})),
                ),
              ),
            ),
    );
  }
}

class _CarIdCard extends StatelessWidget {
  const _CarIdCard({required this.car, required this.number, required this.field, required this.error, required this.onChanged});
  final Map<String, dynamic> car;
  final int number;
  final TextEditingController Function(String field) field;
  final String? Function(String field) error;
  final void Function(String field) onChanged;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final a = attributesOf(car['attributes']);
    final qty = ((car['quantity'] as num?) ?? 0).toInt();
    final status = qty <= 0
        ? (t('stock.f_sold'), c.faint)
        : (a['sale_status'] == 'pending' ? (t('stock.f_pending'), c.warning) : (t('stock.f_available'), c.success));
    final complete = carIdFields.every((f) => (a[f] ?? '').isNotEmpty);
    final meta = [a['color'], a['year']].where((x) => (x ?? '').isNotEmpty).join(' · ');
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        // A car with both numbers opens like any other vehicle.
        onTap: complete ? () => openItem(context, car) : null,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Text('#$number', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(width: 8),
              StatusChip(status.$1, status.$2),
              if (meta.isNotEmpty) ...[
                const SizedBox(width: 8),
                Flexible(child: Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.muted))),
              ],
              const Spacer(),
              Text(money(car['selling_price'] as num? ?? 0, s.currency), style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
            for (final f in carIdFields) ...[
              const SizedBox(height: 8),
              if ((a[f] ?? '').isNotEmpty)
                Row(children: [
                  SizedBox(width: 74, child: Text(t(f == 'chassis_no' ? 'detail.chassis' : 'detail.plate'), style: TextStyle(color: c.muted, fontSize: 13))),
                  Expanded(child: Text(a[f]!, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, letterSpacing: 0.5))),
                ])
              else
                TextField(
                  controller: field(f),
                  textCapitalization: TextCapitalization.characters,
                  autocorrect: false,
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9 ]')), LengthLimitingTextInputFormatter(24)],
                  style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, letterSpacing: 0.5),
                  decoration: InputDecoration(
                    isDense: true,
                    labelText: t(f == 'chassis_no' ? 'detail.chassis' : 'detail.plate'),
                    hintText: f == 'chassis_no' ? 'LL31233343' : 'RAC 123 A',
                    errorText: error(f),
                  ),
                  onChanged: (_) => onChanged(f),
                ),
            ],
          ]),
        ),
      ),
    );
  }
}

/// Cars loading: number, status, price, then the two number fields.
class _CarIdsSkeleton extends StatelessWidget {
  const _CarIdsSkeleton();

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
        children: [
          Shimmer(
            child: Column(children: [
              for (var i = 0; i < 5; i++)
                const Card(
                  margin: EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(12, 12, 12, 14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(children: [
                        Bone(width: 26, height: 14),
                        SizedBox(width: 8),
                        Bone(width: 64, height: 18, radius: 10),
                        Spacer(),
                        Bone(width: 90, height: 13),
                      ]),
                      SizedBox(height: 12),
                      Bone(height: 40, radius: 10),
                      SizedBox(height: 8),
                      Bone(height: 40, radius: 10),
                    ]),
                  ),
                ),
            ]),
          ),
        ],
      );
}
