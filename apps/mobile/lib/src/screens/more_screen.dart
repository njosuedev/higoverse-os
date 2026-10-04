import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../app_settings.dart';
import '../config.dart';
import '../i18n.dart';
import '../session.dart';
import '../theme.dart';
import '../updates.dart';
import '../widgets.dart';

/// Account: who is signed in, for which business, preferences and sign-out.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  Future<void> _confirmSignOut(BuildContext context) async {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(t('acc.sign_out_q')),
        content: Text(t('acc.sign_out_body')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('app.cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: Hgv.of(context).danger),
            onPressed: () => Navigator.pop(c, true),
            child: Text(t('acc.sign_out')),
          ),
        ],
      ),
    );
    if (ok == true) await s.logout();
  }

  Future<void> _pickLanguage(BuildContext context, String current) async {
    final settings = AppSettingsScope.of(context);
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final (code, label) in languages)
            ListTile(
              title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              trailing: code == current ? Icon(Icons.check_circle, color: Hgv.of(c).ink) : null,
              onTap: () => Navigator.pop(c, code),
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (picked != null) await settings.setLanguage(picked);
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final t = T.of(context);
    final c = Hgv.of(context);
    final u = s.user;
    final settings = AppSettingsScope.of(context);
    final role = u?.role ?? '';
    final langLabel = languages.firstWhere((l) => l.$1 == t.lang, orElse: () => languages.first).$2;
    return Scaffold(
      appBar: AppBar(title: Text(t('nav.account'))),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Card(
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: RingBadge(
              color: c.ink,
              size: 48,
              solid: true,
              child: Text((u?.name.isNotEmpty ?? false) ? u!.name[0].toUpperCase() : '?'),
            ),
            title: Text(u?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text('${u?.email ?? ''}\n${const {'owner', 'admin', 'manager', 'cashier', 'staff'}.contains(role) ? t('role.$role') : role}'),
            isThreeLine: true,
          ),
        ),
        SectionTitle(t('acc.business')),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.storefront_outlined),
              title: Text(s.shop?.name ?? t('acc.no_business'), style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(s.isCar ? t('acc.car_dealer') : t('acc.shop')),
            ),
            const Divider(indent: 16, endIndent: 16),
            ListTile(leading: const Icon(Icons.payments_outlined), title: Text(t('acc.currency')), trailing: Text(s.currency)),
            const Divider(indent: 16, endIndent: 16),
            ListTile(
              leading: const Icon(Icons.warning_amber_rounded),
              title: Text(t('acc.low_stock')),
              trailing: Text('${s.lowStock}'),
            ),
          ]),
        ),
        SectionTitle(t('acc.appearance')),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: SegmentedButton<ThemeMode>(
              segments: [
                for (final (mode, icon, key) in const [
                  (ThemeMode.system, Icons.brightness_auto_outlined, 'theme.system'),
                  (ThemeMode.light, Icons.light_mode_outlined, 'theme.light'),
                  (ThemeMode.dark, Icons.dark_mode_outlined, 'theme.dark'),
                ])
                  ButtonSegment(value: mode, icon: Icon(icon), label: Text(t(key), maxLines: 1, overflow: TextOverflow.ellipsis)),
              ],
              selected: {settings.themeMode},
              showSelectedIcon: false,
              onSelectionChanged: (v) => settings.setThemeMode(v.first),
            ),
          ),
        ),
        SectionTitle(t('acc.language')),
        Card(
          child: ListTile(
            leading: const Icon(Icons.translate),
            title: Text(langLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickLanguage(context, t.lang),
          ),
        ),
        SectionTitle(t('acc.app')),
        Card(
          child: Column(children: [
            FutureBuilder<PackageInfo>(
              future: PackageInfo.fromPlatform(),
              builder: (context, snap) => ListTile(
                leading: const Icon(Icons.system_update_outlined),
                title: Text(t('acc.check_updates')),
                subtitle: Text(snap.hasData ? t('acc.version', {'v': snap.data!.version}) : t('acc.version_bare')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => AppUpdates.check(context, manual: true),
              ),
            ),
            const Divider(indent: 16, endIndent: 16),
            ListTile(
              leading: const Icon(Icons.dns_outlined),
              title: Text(t('acc.server')),
              subtitle: Text(Uri.parse(apiBase).host),
            ),
            const Divider(indent: 16, endIndent: 16),
            ListTile(
              leading: const Icon(Icons.info_outline),
              title: Text(t('acc.web_title')),
              subtitle: Text(t('acc.web_sub')),
            ),
          ]),
        ),
        const SizedBox(height: 22),
        OutlinedButton.icon(
          onPressed: () => _confirmSignOut(context),
          // Neutral here; red is kept for the confirmation that actually signs out.
          icon: Icon(Icons.logout, color: c.text),
          label: Text(t('acc.sign_out'), style: TextStyle(color: c.text, fontWeight: FontWeight.w700)),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), side: BorderSide(color: c.border)),
        ),
      ]),
    );
  }
}
