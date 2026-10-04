import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:in_app_update/in_app_update.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'theme.dart';

/// Keeps the app up to date without reinstalling by hand.
///
/// * Installed from Google Play: Play's in-app update (downloads in the
///   background, then "Restart" to finish).
/// * Installed from the APK: compares with
///   https://higoverse.com/downloads/android/version.json and offers the new
///   APK, which installs over the current app (same signing key, data kept).
class AppUpdates {
  static const feed = String.fromEnvironment(
    'UPDATE_FEED',
    defaultValue: 'https://higoverse.com/downloads/android/version.json',
  );

  static bool _checking = false;

  static Future<void> check(BuildContext context, {bool manual = false}) async {
    if (kIsWeb || !Platform.isAndroid || _checking) return;
    _checking = true;
    try {
      final info = await PackageInfo.fromPlatform();
      final fromPlay = info.installerStore == 'com.android.vending';
      if (!context.mounted) return;
      if (fromPlay) {
        await _viaPlay(context, manual);
      } else if (context.mounted) {
        await _viaFeed(context, info, manual);
      }
    } finally {
      _checking = false;
    }
  }

  static Future<void> _viaPlay(BuildContext context, bool manual) async {
    try {
      final u = await InAppUpdate.checkForUpdate();
      if (u.updateAvailability != UpdateAvailability.updateAvailable) {
        if (manual && context.mounted) _snack(context, 'You have the latest version.');
        return;
      }
      if (u.flexibleUpdateAllowed) {
        final r = await InAppUpdate.startFlexibleUpdate();
        if (r == AppUpdateResult.success && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            duration: const Duration(days: 1),
            content: const Text('Update downloaded.'),
            action: SnackBarAction(label: 'Restart', onPressed: () => InAppUpdate.completeFlexibleUpdate()),
          ));
        }
      } else if (u.immediateUpdateAllowed) {
        await InAppUpdate.performImmediateUpdate();
      }
    } catch (_) {
      if (manual && context.mounted) _snack(context, "Couldn't check for updates. Try again later.");
    }
  }

  static Future<void> _viaFeed(BuildContext context, PackageInfo info, bool manual) async {
    Map<String, dynamic>? v;
    try {
      final res = await http.get(Uri.parse(feed)).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) v = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {}
    if (!context.mounted) return;
    if (v == null) {
      if (manual) _snack(context, "Couldn't check for updates. Try again later.");
      return;
    }
    final latest = int.tryParse('${v['versionCode']}') ?? 0;
    final current = int.tryParse(info.buildNumber) ?? 0;
    if (latest <= current) {
      if (manual) _snack(context, 'You have the latest version (${info.version}).');
      return;
    }
    final c = Hgv.of(context);
    final go = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('Update available: ${v!['versionName'] ?? ''}'),
        content: Text('${v['notes'] ?? 'A new version of Higoverse is ready.'}\n\n'
            'Tap Download, then open the file to install. Your sign-in and settings are kept.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Later')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: c.ink),
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Download'),
          ),
        ],
      ),
    );
    if (go == true) {
      final url = Uri.tryParse('${v['apk'] ?? ''}');
      if (url != null) await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  static void _snack(BuildContext context, String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}
