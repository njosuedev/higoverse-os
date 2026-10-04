import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../app_settings.dart';
import '../config.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../session.dart';
import '../theme.dart';
import '../updates/update_controller.dart';
import '../widgets.dart';
import 'activity_screen.dart';
import 'expenses_screen.dart';

/// Account: who is signed in, for which business, live updates and
/// notifications, preferences and sign-out.
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
    final live = LiveScope.of(context);
    final (liveText, liveColor) = switch (live?.status) {
      LiveStatus.live => (t('live.status_live'), c.success),
      LiveStatus.connecting => (t('live.status_connecting'), c.warning),
      _ => (t('live.status_offline'), c.faint),
    };
    return Scaffold(
      body: ListView(padding: const EdgeInsets.fromLTRB(8, 8, 8, 20), children: [
        Card(
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            leading: Avatar(name: u?.name ?? '?', size: 52, online: live?.status == LiveStatus.live),
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
            const Divider(indent: 16, endIndent: 16),
            ListTile(
              leading: const Icon(Icons.account_balance_wallet_outlined),
              title: Text(t('debts.title')),
              subtitle: Text(t('acc.debts_sub')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => openDebts(context),
            ),
            if (s.canSeeFinancials) ...[
              const Divider(indent: 16, endIndent: 16),
              ListTile(
                leading: const Icon(Icons.request_quote_outlined),
                title: Text(t('exp.title')),
                subtitle: Text(t('exp.menu_sub')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => openExpenses(context),
              ),
            ],
          ]),
        ),
        SectionTitle(t('acc.notifications')),
        Card(
          child: Column(children: [
            ListTile(
              leading: PulseDot(color: liveColor, active: live?.status == LiveStatus.live, size: 9),
              title: Text(t('acc.live')),
              subtitle: Text(liveText),
              trailing: (live?.online.length ?? 0) > 0
                  ? Text(t('live.online_n', {'n': live!.online.length}), style: TextStyle(color: c.faint, fontSize: 12))
                  : null,
            ),
            const Divider(indent: 16, endIndent: 16),
            SwitchListTile(
              secondary: const Icon(Icons.point_of_sale_outlined),
              title: Text(t('acc.notify_sales')),
              subtitle: Text(t('acc.notify_sales_sub')),
              value: settings.alertSales,
              onChanged: (v) => settings.setAlerts(sales: v),
            ),
            const Divider(indent: 16, endIndent: 16),
            SwitchListTile(
              secondary: const Icon(Icons.inventory_2_outlined),
              title: Text(t('acc.notify_stock')),
              subtitle: Text(t('acc.notify_stock_sub')),
              value: settings.alertStock,
              onChanged: (v) => settings.setAlerts(stock: v),
            ),
            if (s.isCar) ...[
              const Divider(indent: 16, endIndent: 16),
              SwitchListTile(
                secondary: const Icon(Icons.local_police_outlined),
                title: Text(t('acc.notify_fines')),
                subtitle: Text(t('acc.notify_fines_sub')),
                value: settings.alertFines,
                onChanged: (v) => settings.setAlerts(fines: v),
              ),
            ],
            const Divider(indent: 16, endIndent: 16),
            SwitchListTile(
              secondary: Icon(settings.sound ? Icons.volume_up_outlined : Icons.volume_off_outlined),
              title: Text(t('acc.sound')),
              subtitle: Text(t('acc.sound_sub')),
              value: settings.sound,
              onChanged: (v) => settings.setAlerts(sound: v),
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
              builder: (context, snap) {
                final version = snap.hasData ? t('acc.version', {'v': snap.data!.version}) : t('acc.version_bare');
                // The APK updates itself; an iPhone gets updates from the App Store.
                if (!Platform.isAndroid) {
                  return ListTile(leading: const Icon(Icons.info_outline), title: Text(version));
                }
                return ListTile(
                  leading: const Icon(Icons.system_update_outlined),
                  title: Text(t('acc.check_updates')),
                  subtitle: Text(version),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => AppUpdates.instance.check(manual: true),
                );
              },
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
        const SizedBox(height: 16),
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
