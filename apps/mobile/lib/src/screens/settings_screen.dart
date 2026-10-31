import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config.dart';
import '../forms.dart';
import '../i18n.dart';
import '../live/scoped_route.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

void openSettings(BuildContext context) => pushScoped<void>(context, const SettingsScreen());

/// The currencies the website offers (Settings → Financial).
const currencies = ['RWF', 'USD', 'EUR', 'KES', 'UGX', 'TZS', 'BIF', 'CDF'];

/// The phone in international form (+250…), or null when it isn't valid
/// (as apps/web/lib/company.ts normalizePhone).
String? normalizePhone(String value) {
  final raw = value.trim();
  if (raw.isEmpty || !RegExp(r'^\+?[\d\s().-]+$').hasMatch(raw)) return null;
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  String intl;
  if (raw.startsWith('+')) {
    intl = digits;
  } else if (digits.startsWith('250') && digits.length == 12) {
    intl = digits;
  } else if (digits.startsWith('0')) {
    intl = '250${digits.substring(1)}';
  } else {
    intl = '250$digits';
  }
  if (intl.startsWith('250')) return RegExp(r'^2507\d{8}$').hasMatch(intl) ? '+$intl' : null;
  return intl.length >= 8 && intl.length <= 15 ? '+$intl' : null;
}

/// "TIN:…|KN 5 Ave|Lat:…|Lng:…" → what people read, and the map pin kept aside.
({String text, String pin}) _splitAddress(String address) {
  var a = address;
  var pin = '';
  final m = RegExp(r'(\|Lat:[^|]*(\|Lng:[^|]*)?)$').firstMatch(a);
  if (m != null) {
    pin = m.group(1)!;
    a = a.substring(0, m.start);
  }
  if (a.startsWith('TIN:')) {
    final parts = a.substring(4).split('|').skip(1);
    final named = <String, String>{};
    final plain = <String>[];
    for (final p in parts) {
      final i = p.indexOf(':');
      if (i == -1) {
        plain.add(p);
      } else {
        named[p.substring(0, i)] = p.substring(i + 1);
      }
    }
    a = [named['Addr'], named['Sector'], named['District'] ?? (plain.isEmpty ? null : plain.first), named['Province']]
        .where((x) => (x ?? '').isNotEmpty)
        .join(', ');
  }
  return (text: a, pin: pin);
}

/// The business's settings (the website's Settings page): its details,
/// currency, low-stock level and tax rate, bank accounts, and the
/// signed-in person's password.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Map<String, dynamic>? _shop, _settings;
  Object? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_shop == null && _error == null) _load();
  }

  Future<void> _load() async {
    final s = SessionScope.of(context);
    setState(() => _error = null);
    try {
      final r = await Future.wait([s.api.get('${Svc.auth}/api/v1/shop'), s.api.get('${Svc.settings}/settings')]);
      if (!mounted) return;
      setState(() {
        _shop = Map<String, dynamic>.from((r[0] as Map)['data'] as Map? ?? {});
        _settings = Map<String, dynamic>.from((r[1] as Map)['data'] as Map? ?? {});
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final s = SessionScope.of(context);
    final shop = _shop, settings = _settings;
    return Scaffold(
      appBar: AppBar(title: Text(t('settings.title'))),
      body: _error != null && shop == null
          ? EmptyState(icon: Icons.cloud_off_outlined, message: errorText(t, _error!), onRetry: _load)
          : shop == null || settings == null
              ? ListView(children: const [ListSkeleton(count: 8)])
              : ListView(padding: const EdgeInsets.fromLTRB(8, 4, 8, 32), children: [
                  SectionTitle(t('settings.shop_info')),
                  _ShopCard(shop: shop, settings: settings, canEdit: const {'owner', 'admin', 'manager'}.contains(s.user?.role), onSaved: _load),
                  SectionTitle(t('settings.financial')),
                  _MoneyCard(settings: settings, canEdit: const {'owner', 'admin', 'manager'}.contains(s.user?.role), onSaved: _load),
                  SectionTitle(t('bank.section')),
                  _BankCard(settings: settings, onSaved: _load),
                  SectionTitle(t('m.security')),
                  const _PasswordCard(),
                ]),
    );
  }
}

/// A card of fields with its own Save button and saving state.
class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.children, this.onSave, this.saving = false, this.note});
  final List<Widget> children;
  final VoidCallback? onSave;
  final bool saving;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 2, 14, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ...children,
          if (note != null) ...[
            const SizedBox(height: 12),
            Text(note!, style: TextStyle(fontSize: 12, color: c.warning)),
          ],
          if (onSave != null || saving) ...[
            const SizedBox(height: 14),
            FilledButton(
              onPressed: saving ? null : onSave,
              child: saving
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                  : Text(t('form.save')),
            ),
          ],
        ]),
      ),
    );
  }
}

class _ShopCard extends StatefulWidget {
  const _ShopCard({required this.shop, required this.settings, required this.canEdit, required this.onSaved});
  final Map<String, dynamic> shop, settings;
  final bool canEdit;
  final VoidCallback onSaved;

  @override
  State<_ShopCard> createState() => _ShopCardState();
}

class _ShopCardState extends State<_ShopCard> {
  final _form = GlobalKey<FormState>();
  late final String _rawDescription = '${widget.shop['description'] ?? ''}';
  late final _address = _splitAddress('${widget.shop['address'] ?? widget.settings['address'] ?? ''}');
  late final _name = TextEditingController(text: '${widget.shop['name'] ?? widget.settings['shop_name'] ?? ''}');
  late final _phone = TextEditingController(text: '${widget.shop['phone'] ?? widget.settings['phone'] ?? ''}');
  late final _tin = TextEditingController(text: Shop.fromJson(widget.shop).tin);
  late final _addr = TextEditingController(text: _address.text);
  late final _about = TextEditingController(text: _describe(_rawDescription));
  bool _saving = false;

  /// The human text of a shop description ({"_d": "…", …} or "type|text").
  static String _describe(String raw) {
    if (raw.isEmpty) return '';
    try {
      final v = jsonDecode(raw);
      if (v is Map) return '${v['_d'] ?? ''}';
    } catch (_) {}
    final i = raw.indexOf('|');
    return i == -1 ? raw : raw.substring(i + 1);
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _tin, _addr, _about]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final t = T.of(context);
    final s = SessionScope.of(context);
    final phone = normalizePhone(_phone.text) ?? _phone.text.trim();
    final address = '${_addr.text.trim()}${_address.pin}';
    String description;
    try {
      final existing = _rawDescription.isEmpty ? <String, dynamic>{} : Map<String, dynamic>.from(jsonDecode(_rawDescription) as Map);
      existing['_d'] = _about.text.trim();
      description = jsonEncode(existing);
    } catch (_) {
      description = _about.text.trim();
    }
    setState(() => _saving = true);
    try {
      await s.api.put('${Svc.auth}/api/v1/shop', {
        'name': _name.text.trim(),
        'phone': phone,
        'tin': _tin.text.replaceAll(RegExp(r'[\s-]'), ''),
        'address': address,
        'description': description,
      });
      // The settings service keeps a copy (best effort, as on the website).
      await s.api.put('${Svc.settings}/settings', {'shop_name': _name.text.trim(), 'phone': phone, 'address': address}).catchError((_) => null);
      await s.loadAccount();
      if (mounted) say(context, t('settings.saved'));
      widget.onSaved();
    } catch (e) {
      if (mounted) say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final edit = widget.canEdit;
    return Form(
      key: _form,
      child: _SectionCard(
        saving: _saving,
        onSave: edit ? _save : null,
        note: edit ? null : t('m.owner_only'),
        children: [
          LabeledField(
            t('settings.shop_name'),
            TextFormField(
              controller: _name,
              enabled: edit,
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v ?? '').trim().isEmpty ? t('form.need_name') : null,
            ),
          ),
          LabeledField(
            t('form.phone'),
            TextFormField(
              controller: _phone,
              enabled: edit,
              keyboardType: TextInputType.phone,
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? t('company.err_phone_required') : (normalizePhone(v!) == null ? t('company.err_phone') : null),
            ),
            hint: t('company.phone_hint'),
          ),
          LabeledField(
            t('company.tin'),
            TextFormField(
              controller: _tin,
              enabled: edit,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d\s-]'))],
              validator: (v) {
                final x = (v ?? '').replaceAll(RegExp(r'[\s-]'), '');
                if (x.isEmpty) return t('company.err_tin_required');
                return RegExp(r'^\d{9}$').hasMatch(x) ? null : t('company.err_tin');
              },
            ),
            hint: t('company.tin_hint'),
          ),
          LabeledField(
            t('m.address'),
            TextFormField(
              controller: _addr,
              enabled: edit,
              decoration: InputDecoration(hintText: t('company.address_ph')),
              validator: (v) => (v ?? '').trim().isEmpty ? t('settings.address_required') : null,
            ),
            hint: _address.pin.isEmpty ? null : t('company.pin_kept'),
          ),
          LabeledField(
            t('settings.about_shop'),
            TextFormField(
              controller: _about,
              enabled: edit,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(hintText: t('settings.about_shop_placeholder')),
            ),
          ),
        ],
      ),
    );
  }
}

class _MoneyCard extends StatefulWidget {
  const _MoneyCard({required this.settings, required this.canEdit, required this.onSaved});
  final Map<String, dynamic> settings;
  final bool canEdit;
  final VoidCallback onSaved;

  @override
  State<_MoneyCard> createState() => _MoneyCardState();
}

class _MoneyCardState extends State<_MoneyCard> {
  final _form = GlobalKey<FormState>();
  late String _currency = currencies.contains(widget.settings['currency']) ? widget.settings['currency'] as String : 'RWF';
  late final _low = TextEditingController(text: '${widget.settings['low_stock_threshold'] ?? 10}');
  late final _tax = TextEditingController(text: '${widget.settings['tax_rate'] ?? 0}');
  bool _saving = false;

  @override
  void dispose() {
    _low.dispose();
    _tax.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final t = T.of(context);
    final s = SessionScope.of(context);
    setState(() => _saving = true);
    try {
      await s.api.put('${Svc.settings}/settings', {
        'currency': _currency,
        'low_stock_threshold': int.parse(_low.text.trim()),
        'tax_rate': num.parse(_tax.text.trim()),
      });
      await s.loadAccount();
      if (mounted) say(context, t('settings.saved'));
      widget.onSaved();
    } catch (e) {
      if (mounted) say(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final edit = widget.canEdit;
    return Form(
      key: _form,
      child: _SectionCard(
        saving: _saving,
        onSave: edit ? _save : null,
        note: edit ? null : t('m.owner_only'),
        children: [
          LabeledField(
            t('settings.currency'),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _currency,
              items: [
                for (final cur in currencies)
                  DropdownMenuItem(value: cur, child: Text('$cur (${t('settings.currency_${cur.toLowerCase()}')})', overflow: TextOverflow.ellipsis)),
              ],
              onChanged: edit ? (v) => setState(() => _currency = v ?? _currency) : null,
            ),
          ),
          LabeledField(
            t('settings.low_threshold'),
            TextFormField(
              controller: _low,
              enabled: edit,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) => int.tryParse((v ?? '').trim()) == null ? t('settings.err_threshold') : null,
            ),
            hint: t('settings.low_threshold_hint'),
          ),
          LabeledField(
            t('settings.tax_rate'),
            TextFormField(
              controller: _tax,
              enabled: edit,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (v) {
                final x = num.tryParse((v ?? '').trim());
                return x == null || x < 0 || x > 100 ? t('settings.err_tax_rate') : null;
              },
            ),
            hint: t('settings.tax_rate_hint'),
          ),
        ],
      ),
    );
  }
}

/// The bank accounts printed on proformas. Only the owner (and admin) can
/// change them (settings-service's BANK_EDITORS).
class _BankCard extends StatefulWidget {
  const _BankCard({required this.settings, required this.onSaved});
  final Map<String, dynamic> settings;
  final VoidCallback onSaved;

  @override
  State<_BankCard> createState() => _BankCardState();
}

class _BankRow {
  _BankRow(Map<String, dynamic> b)
      : id = b['id'],
        name = TextEditingController(text: '${b['bank_name'] ?? ''}'),
        account = TextEditingController(text: '${b['bank_account'] ?? ''}'),
        holder = TextEditingController(text: '${b['bank_holder'] ?? ''}'),
        isDefault = b['is_default'] == true;
  final Object? id;
  final TextEditingController name, account, holder;
  bool isDefault;

  void dispose() {
    name.dispose();
    account.dispose();
    holder.dispose();
  }
}

class _BankCardState extends State<_BankCard> {
  final _form = GlobalKey<FormState>();
  late final List<_BankRow> _rows = [
    for (final b in (widget.settings['bank_accounts'] as List? ?? const []).whereType<Map>()) _BankRow(Map<String, dynamic>.from(b)),
  ];
  bool _saving = false;
  bool _dirty = false;

  @override
  void dispose() {
    for (final r in _rows) {
      r.dispose();
    }
    super.dispose();
  }

  void _add() => setState(() {
        _rows.add(_BankRow({'bank_holder': _rows.isEmpty ? '' : _rows.first.holder.text, 'is_default': _rows.isEmpty}));
        _dirty = true;
      });

  void _remove(int i) => setState(() {
        _rows.removeAt(i).dispose();
        if (_rows.isNotEmpty && !_rows.any((r) => r.isDefault)) _rows.first.isDefault = true;
        _dirty = true;
      });

  Future<void> _save() async {
    final t = T.of(context);
    final s = SessionScope.of(context);
    if (s.isCar && _rows.isEmpty) return say(context, t('bank.need_one'));
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await s.api.put('${Svc.settings}/settings', {
        'bank_accounts': [
          for (final r in _rows)
            {
              if (r.id != null) 'id': r.id,
              'bank_name': r.name.text.trim(),
              'bank_account': r.account.text.trim(),
              'bank_holder': r.holder.text.trim(),
              'is_default': r.isDefault,
            },
        ],
      });
      await s.loadAccount();
      if (mounted) {
        say(context, t('settings.saved'));
        setState(() => _dirty = false);
      }
      widget.onSaved();
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
    final edit = s.canEditBank;
    return Form(
      key: _form,
      onChanged: () => _dirty = true,
      child: _SectionCard(
        saving: _saving,
        onSave: edit && (_dirty || _saving) ? _save : null,
        note: edit ? null : t('bank.owner_only'),
        children: [
          const SizedBox(height: 8),
          Text(t(s.isCar ? 'bank.hint_required' : 'bank.hint'), style: TextStyle(color: c.muted, fontSize: 13)),
          if (_rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(t('bank.none_yet'), style: TextStyle(color: c.faint)),
            ),
          for (var i = 0; i < _rows.length; i++)
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.fromLTRB(12, 0, 6, 12),
              decoration: BoxDecoration(border: Border.all(color: c.border), borderRadius: BorderRadius.circular(12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  if (_rows[i].isDefault)
                    StatusChip(t('bank.default'), c.ink)
                  else if (edit)
                    TextButton(
                      onPressed: () => setState(() {
                        for (final r in _rows) {
                          r.isDefault = false;
                        }
                        _rows[i].isDefault = true;
                        _dirty = true;
                      }),
                      child: Text(t('bank.make_default')),
                    ),
                  const Spacer(),
                  if (edit) IconButton(tooltip: t('app.delete'), onPressed: () => _remove(i), icon: Icon(Icons.delete_outline, color: c.danger)),
                ]),
                TextFormField(
                  controller: _rows[i].name,
                  enabled: edit,
                  decoration: InputDecoration(labelText: t('bank.bank_name')),
                  validator: (v) => (v ?? '').trim().length < 2 ? t('bank.err_name') : null,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _rows[i].account,
                  enabled: edit,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: t('bank.account_no')),
                  validator: (v) {
                    final a = (v ?? '').trim();
                    final digits = a.replaceAll(RegExp(r'\D'), '');
                    if (a.isEmpty) return t('bank.err_account_required');
                    if (!RegExp(r'^[0-9][0-9 -]*[0-9]$').hasMatch(a) || digits.length < 6 || digits.length > 30) return t('bank.err_account');
                    return null;
                  },
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _rows[i].holder,
                  enabled: edit,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(labelText: t('bank.holder'), helperText: t('bank.holder_hint')),
                  validator: (v) => (v ?? '').trim().length < 2 ? t('bank.err_holder') : null,
                ),
              ]),
            ),
          if (edit) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(onPressed: _add, icon: const Icon(Icons.add), label: Text(t('bank.add'))),
          ],
        ],
      ),
    );
  }
}

class _PasswordCard extends StatefulWidget {
  const _PasswordCard();

  @override
  State<_PasswordCard> createState() => _PasswordCardState();
}

class _PasswordCardState extends State<_PasswordCard> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController(), _next = TextEditingController(), _confirm = TextEditingController();
  bool _open = false, _saving = false, _show = false;

  @override
  void dispose() {
    for (final c in [_current, _next, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final t = T.of(context);
    final s = SessionScope.of(context);
    setState(() => _saving = true);
    try {
      final res = await s.api.put('${Svc.auth}/api/v1/auth/change-password', {'current_password': _current.text, 'new_password': _next.text});
      // Every other device is signed out; this phone gets a new session.
      if (res is Map) await s.adopt(Map<String, dynamic>.from(res));
      if (!mounted) return;
      say(context, t('settings.password_changed'));
      setState(() {
        _open = false;
        for (final c in [_current, _next, _confirm]) {
          c.clear();
        }
      });
    } catch (e) {
      if (!mounted) return;
      final text = errorText(t, e);
      say(context, text.toLowerCase().contains('incorrect') ? t('settings.err_current_password_incorrect') : text);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    if (!_open) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.lock_outline),
          title: Text(t('settings.change_password')),
          subtitle: Text(t('settings.security_subtitle')),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => setState(() => _open = true),
        ),
      );
    }
    InputDecoration deco(String label) => InputDecoration(
          labelText: label,
          suffixIcon: IconButton(
            icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
            onPressed: () => setState(() => _show = !_show),
          ),
        );
    return Form(
      key: _form,
      child: _SectionCard(
        saving: _saving,
        onSave: _save,
        children: [
          const SizedBox(height: 10),
          TextFormField(
            controller: _current,
            obscureText: !_show,
            decoration: deco(t('settings.current_password')),
            validator: (v) => (v ?? '').isEmpty ? t('settings.err_current_password_required') : null,
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _next,
            obscureText: !_show,
            decoration: deco(t('settings.new_password')),
            validator: (v) => (v ?? '').length < 6 ? t('settings.err_password_too_short') : null,
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _confirm,
            obscureText: !_show,
            decoration: deco(t('settings.confirm_password')),
            validator: (v) => v != _next.text ? t('settings.err_passwords_mismatch') : null,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: () => setState(() => _open = false), child: Text(t('app.cancel'))),
          ),
        ],
      ),
    );
  }
}
