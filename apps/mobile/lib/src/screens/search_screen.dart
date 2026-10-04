import 'dart:async';

import 'package:flutter/material.dart';

import '../config.dart';
import '../format.dart';
import '../i18n.dart';
import '../session.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';

/// Search the business's stock (shops) or vehicles (car dealers) from
/// anywhere: name, barcode, plate or chassis. Results open their details.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _q = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>>? _results;
  int _total = 0;
  bool _loading = false;
  Object? _error;
  int _gen = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  void _changed(String _) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _run);
  }

  Future<void> _run() async {
    final q = _q.text.trim();
    final gen = ++_gen;
    if (q.isEmpty) {
      setState(() {
        _results = null;
        _loading = false;
        _error = null;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await SessionScope.of(context).api.get('${Svc.products}/products', query: {'q': q, 'limit': '30', 'page': '1'});
      final data = (res as Map)['data'] as Map? ?? {};
      if (!mounted || gen != _gen) return;
      setState(() {
        _results = (data['items'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _total = (data['total'] as num? ?? 0).toInt();
        _loading = false;
      });
    } catch (e) {
      if (mounted && gen == _gen) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final results = _results;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsets.only(right: 12),
          child: SizedBox(
            height: 40,
            child: TextField(
              controller: _q,
              autofocus: true,
              onChanged: _changed,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _run(),
              style: const TextStyle(fontSize: 15),
              decoration: InputDecoration(
                hintText: s.isCar ? t('stock.search_car') : t('stock.search'),
                filled: true,
                fillColor: c.paper,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                suffixIcon: _q.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: t('app.clear'),
                        icon: const Icon(Icons.close_rounded, size: 20),
                        onPressed: () {
                          _q.clear();
                          _changed('');
                        }),
              ),
            ),
          ),
        ),
        bottom: _loading
            ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
            : null,
      ),
      body: _error != null
          ? EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _run)
          : results == null
              ? EmptyState(
                  icon: Icons.search_rounded,
                  message: s.isCar ? t('search.prompt_car') : t('search.prompt'),
                )
              : results.isEmpty
                  ? EmptyState(icon: Icons.search_off_rounded, message: t('stock.no_match', {'q': _q.text.trim()}))
                  : ListView(
                      padding: const EdgeInsets.only(bottom: 24),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                          child: Text(t('search.results', {'n': groupDigits(_total)}),
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.muted)),
                        ),
                        for (final item in results) _Result(item: item),
                      ],
                    ),
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final c = Hgv.of(context);
    final a = attributesOf(item['attributes']);
    final qty = item['quantity'] as num? ?? 0;
    final sub = s.isCar
        ? [a['plate_no'], a['year'], a['color']].where((x) => x != null && x.isNotEmpty).join(' · ')
        : (qty <= 0 ? t('dash.out_of_stock') : t('stock.in_stock_n', {'n': groupDigits(qty)}));
    return ListTile(
      dense: true,
      visualDensity: const VisualDensity(vertical: -1),
      onTap: () => showProductSheet(context, item),
      leading: ProductThumb(item['thumbnail'] as String?, isCar: s.isCar, width: 48, height: 40),
      title: Text('${item['name'] ?? ''}',
          maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
      subtitle: Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: qty <= 0 ? c.danger : c.faint)),
      trailing: Text(money(item['selling_price'] as num? ?? 0, s.currency),
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
    );
  }
}
