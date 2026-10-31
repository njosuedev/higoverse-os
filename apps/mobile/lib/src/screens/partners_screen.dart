import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../forms.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Suppliers and customers (the website's Partners page). A supplier is
/// saved with its TIN at the start of the address ("TIN:123456789|Kigali");
/// everyone else is a customer. Car companies only keep customers.
class Partner {
  Partner(this.raw)
      : id = '${raw['id'] ?? ''}',
        name = '${raw['name'] ?? ''}'.trim(),
        phone = '${raw['phone'] ?? ''}'.trim(),
        email = '${raw['email'] ?? ''}'.trim() {
    final addr = '${raw['address'] ?? ''}';
    if (addr.startsWith('TIN:')) {
      final pipe = addr.indexOf('|');
      tin = pipe == -1 ? addr.substring(4) : addr.substring(4, pipe);
      address = pipe == -1 ? '' : addr.substring(pipe + 1);
    } else {
      tin = '';
      address = addr;
    }
  }

  final Map<String, dynamic> raw;
  final String id, name, phone, email;

  /// A supplier's TIN (kept in the address); empty for customers.
  late final String tin;

  /// The address as people wrote it (without the TIN).
  late final String address;

  bool get isSupplier => tin.isNotEmpty;

  String field(String k) => '${raw[k] ?? ''}'.trim();
}

/// "TIN:123456789|KN 5 Ave" — how the supplier service keeps a supplier's TIN.
String encodePartnerAddress(String tin, String address) {
  final t = tin.trim(), a = address.trim();
  if (t.isNotEmpty && a.isNotEmpty) return 'TIN:$t|$a';
  if (t.isNotEmpty) return 'TIN:$t';
  return a;
}

/// Every supplier and customer of the business.
Future<List<Partner>> loadPartners(Session s) async {
  final res = await s.api.get('${Svc.suppliers}/suppliers');
  final data = (res as Map?)?['data'];
  final list = data is Map ? data['items'] : data;
  return (list is List ? list : const []).whereType<Map>().map((e) => Partner(Map<String, dynamic>.from(e))).toList();
}

/// Only the suppliers (for purchases and products).
Future<List<Partner>> loadSuppliers(Session s) async => (await loadPartners(s)).where((p) => p.isSupplier).toList();

void openPartners(BuildContext context) => pushScoped<void>(context, const PartnersScreen());

class PartnersScreen extends StatefulWidget {
  const PartnersScreen({super.key});

  @override
  State<PartnersScreen> createState() => _PartnersScreenState();
}

class _PartnersScreenState extends State<PartnersScreen> with LiveListener {
  List<Partner>? _all;

  /// How many products each supplier supplies.
  Map<String, int> _supplied = const {};
  Object? _error;
  String _type = 'all';
  final _q = TextEditingController();
  final _debounce = Debouncer(const Duration(milliseconds: 600));
  int _gen = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_gen == 0) _load();
  }

  @override
  void dispose() {
    _q.dispose();
    _debounce.dispose();
    super.dispose();
  }

  @override
  void onLive(LiveEvent e) {
    if (e.topic == 'supplier' || e.topic == 'customer' || e.isResync) _debounce(() => _load(quiet: true));
  }

  Future<void> _load({bool quiet = false}) async {
    final gen = ++_gen;
    final s = SessionScope.of(context);
    if (!quiet) setState(() => _error = null);
    try {
      final r = await Future.wait([
        loadPartners(s),
        if (!s.isCar) s.api.get('${Svc.products}/products', query: {'page': '1', 'limit': '1000'}).catchError((_) => null),
      ]);
      if (!mounted || gen != _gen) return;
      final counts = <String, int>{};
      if (r.length > 1 && r[1] is Map) {
        final items = ((r[1] as Map)['data'] as Map?)?['items'] as List? ?? const [];
        for (final p in items.whereType<Map>()) {
          final sid = '${p['supplier_id'] ?? ''}';
          if (sid.isNotEmpty) counts[sid] = (counts[sid] ?? 0) + 1;
        }
      }
      setState(() {
        final all = r[0] as List<Partner>;
        _all = s.isCar ? all.where((p) => !p.isSupplier).toList() : all;
        _supplied = counts;
        _error = null;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    }
  }

  Future<void> _add() async {
    final all = _all;
    if (all == null) return;
    if (await editPartner(context, others: all, asSupplier: _type == 'supplier') != null) _load(quiet: true);
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final all = _all;
    final q = _q.text.trim().toLowerCase();
    final shown = all
        ?.where((p) => _type == 'all' || (_type == 'supplier') == p.isSupplier)
        .where((p) =>
            q.isEmpty ||
            p.name.toLowerCase().contains(q) ||
            p.phone.contains(q) ||
            p.tin.contains(q) ||
            p.email.toLowerCase().contains(q) ||
            p.field('id_number').toLowerCase().contains(q))
        .toList();
    final suppliers = all?.where((p) => p.isSupplier).length ?? 0;
    return Scaffold(
      appBar: AppBar(title: Text(s.isCar ? t('partners.customers') : t('nav.partners'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.person_add_alt_1_outlined),
        label: Text(s.isCar ? t('m.add_customer') : t('partners.add')),
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(quiet: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 96),
          children: [
            SearchField(controller: _q, hint: t('partners.search'), onChanged: (_) => setState(() {})),
            if (!s.isCar) ...[
              const SizedBox(height: 10),
              Wrap(spacing: 6, children: [
                for (final (k, label) in [
                  ('all', t('m.all')),
                  ('supplier', t('partners.suppliers')),
                  ('customer', t('partners.customers')),
                ])
                  ChoiceChip(label: Text(label), selected: _type == k, showCheckmark: false, onSelected: (_) => setState(() => _type = k)),
              ]),
            ],
            const SizedBox(height: 10),
            if (_error != null && all == null)
              EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)
            else if (all == null)
              const Shimmer(child: Column(children: [ListSkeleton(count: 8, leading: RowLead.circle)]))
            else ...[
              Row(children: [
                Expanded(
                    child: FigureTile(
                        label: s.isCar ? t('partners.customers') : t('partners.total'), value: '${all.length}', icon: Icons.groups_outlined)),
                if (!s.isCar) ...[
                  const SizedBox(width: 8),
                  Expanded(child: FigureTile(label: t('partners.suppliers'), value: '$suppliers', icon: Icons.local_shipping_outlined)),
                  const SizedBox(width: 8),
                  Expanded(child: FigureTile(label: t('partners.customers'), value: '${all.length - suppliers}', icon: Icons.person_outline)),
                ],
              ]),
              const SizedBox(height: 8),
              if (shown!.isEmpty)
                EmptyState(icon: Icons.person_search_outlined, message: all.isEmpty ? t('partners.add_first') : t('partners.no_partners'))
              else
                Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(children: [
                    for (var i = 0; i < shown.length; i++) ...[
                      if (i > 0) const Divider(indent: 16, endIndent: 16),
                      ListTile(
                        onTap: () async {
                          if (await showPartnerSheet(context, shown[i], others: all)) _load(quiet: true);
                        },
                        leading: Avatar(
                          name: shown[i].name,
                          badge: shown[i].isSupplier ? Icons.local_shipping : null,
                        ),
                        title: Text(shown[i].name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text(
                          [
                            if (!s.isCar) shown[i].isSupplier ? t('partners.supplier_singular') : t('partners.customer_singular'),
                            if (shown[i].isSupplier) 'TIN ${shown[i].tin}' else if (shown[i].phone.isNotEmpty) shown[i].phone,
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: shown[i].isSupplier && (_supplied[shown[i].id] ?? 0) > 0
                            ? Text('${_supplied[shown[i].id]} ${t('partners.item_word')}', style: TextStyle(color: c.muted, fontSize: 12))
                            : null,
                      ),
                    ],
                  ]),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// One partner: how to reach them, Edit and Delete. True when it changed.
Future<bool> showPartnerSheet(BuildContext context, Partner p, {required List<Partner> others}) async {
  var changed = false;
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Hgv.of(context).elevated,
    builder: (sheet) {
      final t = T.of(sheet);
      final c = Hgv.of(sheet);
      final s = SessionScope.of(sheet);
      final phone = p.phone.replaceAll(RegExp(r'[^\d+]'), '');
      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Avatar(name: p.name, size: 52, badge: p.isSupplier ? Icons.local_shipping : null),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                if (!s.isCar)
                  Text(p.isSupplier ? t('partners.supplier_singular') : t('partners.customer_singular'),
                      style: TextStyle(color: c.faint, fontWeight: FontWeight.w500)),
              ]),
            ),
          ]),
          const SizedBox(height: 14),
          if (phone.isNotEmpty || p.email.isNotEmpty)
            Row(children: [
              if (phone.isNotEmpty) ...[
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => launchUrl(Uri(scheme: 'tel', path: phone)),
                    icon: const Icon(Icons.call_rounded),
                    label: Text(t('m.call')),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => launchUrl(Uri(scheme: 'sms', path: phone)),
                    icon: const Icon(Icons.chat_bubble_outline_rounded),
                    label: Text(t('m.message')),
                  ),
                ),
              ],
              if (p.email.isNotEmpty) ...[
                if (phone.isNotEmpty) const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => launchUrl(Uri(scheme: 'mailto', path: p.email)),
                    icon: const Icon(Icons.mail_outline),
                    label: Text(t('m.email')),
                  ),
                ),
              ],
            ]),
          const SizedBox(height: 8),
          if (p.phone.isNotEmpty) InfoRow(t('form.phone'), p.phone),
          if (p.isSupplier) InfoRow(t('company.tin'), p.tin),
          if (p.email.isNotEmpty) InfoRow(t('m.email'), p.email),
          if (p.address.isNotEmpty) InfoRow(t('m.address'), p.address),
          if (p.field('id_number').isNotEmpty) InfoRow(t('partners.id_number'), p.field('id_number')),
          if (p.field('tin').isNotEmpty) InfoRow(t('company.tin'), p.field('tin')),
          if (p.field('company').isNotEmpty) InfoRow(t('m.company'), p.field('company')),
          if (p.field('country').isNotEmpty) InfoRow(t('m.country'), p.field('country')),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () async {
                  if (await editPartner(sheet, partner: p, others: others) != null && sheet.mounted) {
                    changed = true;
                    Navigator.pop(sheet);
                  }
                },
                icon: const Icon(Icons.edit_outlined),
                label: Text(t('app.edit')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50), foregroundColor: c.danger, side: BorderSide(color: c.danger)),
                onPressed: () async {
                  if (await _deletePartner(sheet, p) && sheet.mounted) {
                    changed = true;
                    Navigator.pop(sheet);
                  }
                },
                icon: const Icon(Icons.delete_outline),
                label: Text(t('app.delete')),
              ),
            ),
          ]),
        ]),
      );
    },
  );
  return changed;
}

Future<bool> _deletePartner(BuildContext context, Partner p) async {
  final t = T.of(context);
  final s = SessionScope.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(t('m.delete_q', {'name': p.name})),
      content: Text(t('m.cannot_undo')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('app.cancel'))),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: Hgv.of(context).danger),
          onPressed: () => Navigator.pop(c, true),
          child: Text(t('app.delete')),
        ),
      ],
    ),
  );
  if (ok != true || !context.mounted) return false;
  try {
    await s.api.delete('${Svc.suppliers}/suppliers/${p.id}');
    return true;
  } catch (e) {
    if (context.mounted) say(context, errorText(t, e));
    return false;
  }
}

/// Adds a partner, or edits [partner]. [others] is everyone already saved
/// (no two share a phone or a TIN). Returns the saved partner.
Future<Partner?> editPartner(BuildContext context, {Partner? partner, required List<Partner> others, bool asSupplier = false}) =>
    pushScoped<Partner>(context, PartnerFormScreen(partner: partner, others: others, asSupplier: asSupplier));

class PartnerFormScreen extends StatefulWidget {
  const PartnerFormScreen({super.key, this.partner, required this.others, this.asSupplier = false});
  final Partner? partner;
  final List<Partner> others;

  /// A new supplier (from a purchase): the TIN comes first.
  final bool asSupplier;

  @override
  State<PartnerFormScreen> createState() => _PartnerFormScreenState();
}

class _PartnerFormScreenState extends State<PartnerFormScreen> {
  final _form = GlobalKey<FormState>();
  late final p = widget.partner;
  late final _name = TextEditingController(text: p?.name ?? '');
  late final _phone = TextEditingController(text: p?.phone ?? '');
  late final _tin = TextEditingController(text: p?.tin ?? '');
  late final _email = TextEditingController(text: p?.email ?? '');
  late final _address = TextEditingController(text: p?.address ?? '');
  late final _idNo = TextEditingController(text: p?.field('id_number') ?? '');
  late final _customerTin = TextEditingController(text: p?.field('tin') ?? '');
  late final _company = TextEditingController(text: p?.field('company') ?? '');
  late final _country = TextEditingController(text: p?.field('country') ?? '');
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _tin.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _tin, _email, _address, _idNo, _customerTin, _company, _country]) {
      c.dispose();
    }
    super.dispose();
  }

  Iterable<Partner> get _rest => widget.others.where((o) => o.id != p?.id);

  String? _checkPhone(String? v, T t, bool isCar) {
    final phone = (v ?? '').replaceAll(RegExp(r'\s'), '');
    if (phone.isEmpty) {
      if (isCar) return t('m.need_phone');
      return _tin.text.trim().isEmpty ? t('partners.err_contact_required') : null;
    }
    if (!RegExp(r'^\d{10}$').hasMatch(phone)) return t('partners.err_phone_digits');
    final dup = _rest.where((o) => o.phone.replaceAll(RegExp(r'\s'), '') == phone).firstOrNull;
    return dup == null ? null : '${t('partners.err_phone_dup_prefix')} "${dup.name}"';
  }

  String? _checkTin(String? v, T t) {
    final tin = (v ?? '').trim();
    if (tin.isEmpty) return null;
    if (!RegExp(r'^\d{9}$').hasMatch(tin)) return t('partners.err_tin_digits');
    final dup = _rest.where((o) => o.tin == tin).firstOrNull;
    return dup == null ? null : '${t('partners.err_tin_dup_prefix')} "${dup.name}"';
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final t = T.of(context);
    final s = SessionScope.of(context);
    String? opt(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'phone': opt(_phone),
      'email': opt(_email),
      'address':
          s.isCar ? opt(_address) : (encodePartnerAddress(_tin.text, _address.text).isEmpty ? null : encodePartnerAddress(_tin.text, _address.text)),
      // Car companies record what is printed on proformas.
      if (s.isCar) ...{
        'id_number': opt(_idNo),
        'tin': _customerTin.text.replaceAll(RegExp(r'\s'), '').isEmpty ? null : _customerTin.text.replaceAll(RegExp(r'\s'), ''),
        'company': opt(_company),
        'country': opt(_country),
      },
    };
    setState(() => _saving = true);
    try {
      final res = p == null ? await s.api.post('${Svc.suppliers}/suppliers', body) : await s.api.put('${Svc.suppliers}/suppliers/${p!.id}', body);
      final data = (res as Map?)?['data'];
      if (!mounted) return;
      HapticFeedback.lightImpact();
      say(context, t('m.saved'));
      Navigator.pop(context, Partner(data is Map ? Map<String, dynamic>.from(data) : {...?p?.raw, ...body}));
    } catch (e) {
      if (mounted) say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    final s = SessionScope.of(context);
    final supplier = _tin.text.trim().isNotEmpty;
    final title = s.isCar ? t(p == null ? 'm.add_customer' : 'm.edit_customer') : t(p == null ? 'partners.add_title' : 'partners.edit_title');
    final tinField = LabeledField(
      t('partners.tin'),
      TextFormField(
        controller: _tin,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
        decoration: InputDecoration(hintText: t('partners.tin_placeholder')),
        validator: (v) => _checkTin(v, t),
      ),
      hint: t('partners.tin_supplier'),
    );
    return FormPage(
      title: title,
      formKey: _form,
      saving: _saving,
      saveLabel: t('form.save'),
      onSave: _save,
      children: [
        LabeledField(
          t('m.name'),
          textField(_name,
              hint: s.isCar ? t('m.customer_name_ph') : t('partners.name_placeholder'),
              validator: (v) => (v ?? '').trim().isEmpty ? t('partners.err_name_required') : null),
        ),
        if (!s.isCar && widget.asSupplier) tinField,
        LabeledField(
          t('form.phone'),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(hintText: '0781234567'),
            validator: (v) => _checkPhone(v, t, s.isCar),
          ),
          hint: s.isCar ? null : t('partners.phone_customer'),
        ),
        if (!s.isCar && !widget.asSupplier) tinField,
        LabeledField(
          t('m.email'),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(hintText: t('form.optional')),
            validator: (v) {
              final e = (v ?? '').trim();
              return e.isEmpty || RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(e) ? null : t('m.bad_email');
            },
          ),
        ),
        LabeledField(t('m.address'), textField(_address, hint: t('partners.address_placeholder'))),
        if (s.isCar) ...[
          LabeledField(t('partners.id_number'), textField(_idNo, hint: t('form.optional'), caps: false)),
          LabeledField(
            t('company.tin'),
            TextFormField(
              controller: _customerTin,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(hintText: t('form.optional')),
              validator: (v) {
                final x = (v ?? '').replaceAll(RegExp(r'\s'), '');
                return x.isEmpty || RegExp(r'^\d{9}$').hasMatch(x) ? null : t('company.err_tin');
              },
            ),
          ),
          LabeledField(t('m.company'), textField(_company, hint: t('form.optional'))),
          LabeledField(t('m.country'), textField(_country, hint: t('form.optional'))),
        ],
        if (!s.isCar) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              Icon(supplier ? Icons.local_shipping_outlined : Icons.person_outline, color: c.ink),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${t('partners.save_as_prefix')} ${supplier ? t('partners.supplier_singular') : t('partners.customer_singular')}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ]),
          ),
        ],
      ],
    );
  }
}
