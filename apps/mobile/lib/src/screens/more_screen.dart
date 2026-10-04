import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../app_settings.dart';
import '../config.dart';
import '../session.dart';
import '../theme.dart';
import '../updates.dart';
import '../widgets.dart';

/// Account: who is signed in, for which business, and sign-out.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  Future<void> _confirmSignOut(BuildContext context) async {
    final s = SessionScope.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text("Your account's data will be removed from this phone."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: Hgv.of(context).danger),
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok == true) await s.logout();
  }

  @override
  Widget build(BuildContext context) {
    final s = SessionScope.of(context);
    final u = s.user;
    final settings = AppSettingsScope.of(context);
    const roles = {'owner': 'Owner', 'admin': 'Administrator', 'manager': 'Manager', 'cashier': 'Cashier', 'staff': 'Staff'};
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Card(
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: CircleAvatar(
              backgroundColor: Hgv.of(context).ink,
              child: Text((u?.name.isNotEmpty ?? false) ? u!.name[0].toUpperCase() : '?',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            ),
            title: Text(u?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text('${u?.email ?? ''}\n${roles[u?.role] ?? u?.role ?? ''}'),
            isThreeLine: true,
          ),
        ),
        const SectionTitle('Business'),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.storefront_outlined),
              title: Text(s.shop?.name ?? 'No business linked', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(s.isCar ? 'Car dealer' : 'Shop'),
            ),
            const Divider(indent: 16, endIndent: 16),
            ListTile(leading: const Icon(Icons.payments_outlined), title: const Text('Currency'), trailing: Text(s.currency)),
            const Divider(indent: 16, endIndent: 16),
            ListTile(
              leading: const Icon(Icons.warning_amber_rounded),
              title: const Text('Low-stock level'),
              trailing: Text('${s.lowStock}'),
            ),
          ]),
        ),
        const SectionTitle('Appearance'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: SegmentedButton<ThemeMode>(
              segments: const [
                ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto_outlined), label: Text('System')),
                ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined), label: Text('Light')),
                ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined), label: Text('Dark')),
              ],
              selected: {settings.themeMode},
              showSelectedIcon: false,
              onSelectionChanged: (v) => settings.setThemeMode(v.first),
            ),
          ),
        ),
        const SectionTitle('App'),
        Card(
          child: Column(children: [
            FutureBuilder<PackageInfo>(
              future: PackageInfo.fromPlatform(),
              builder: (context, snap) => ListTile(
                leading: const Icon(Icons.system_update_outlined),
                title: const Text('Check for updates'),
                subtitle: Text(snap.hasData ? 'Version ${snap.data!.version}' : 'Version'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => AppUpdates.check(context, manual: true),
              ),
            ),
            const Divider(indent: 16, endIndent: 16),
            ListTile(
              leading: const Icon(Icons.dns_outlined),
              title: const Text('Server'),
              subtitle: Text(Uri.parse(apiBase).host),
            ),
            const Divider(indent: 16, endIndent: 16),
            const ListTile(
              leading: Icon(Icons.info_outline),
              title: Text('Settings and full reports'),
              subtitle: Text('Use higoverse.com in a browser'),
            ),
          ]),
        ),
        const SizedBox(height: 22),
        OutlinedButton.icon(
          onPressed: () => _confirmSignOut(context),
          icon: Icon(Icons.logout, color: Hgv.of(context).danger),
          label: Text('Sign out', style: TextStyle(color: Hgv.of(context).danger, fontWeight: FontWeight.w700)),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), side: BorderSide(color: Hgv.of(context).border)),
        ),
      ]),
    );
  }
}
