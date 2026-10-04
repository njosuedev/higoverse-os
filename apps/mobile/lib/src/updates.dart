import 'dart:async';
import 'dart:convert';
import 'dart:io' show File, Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:in_app_update/in_app_update.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import 'i18n.dart';
import 'loading.dart';
import 'theme.dart';

/// Keeps the app up to date without reinstalling by hand.
///
/// * Installed from Google Play: Play's in-app update (downloads in the
///   background, then "Restart" to finish).
/// * Installed from the APK: compares with
///   https://higoverse.com/downloads/android/version.json, downloads the new
///   APK inside the app with a progress bar, then opens Android's installer.
///   It installs over the current app (same signing key, data kept).
///
/// A check asked for from Account shows a loader while it runs.
class AppUpdates {
  static const feed = String.fromEnvironment(
    'UPDATE_FEED',
    defaultValue: 'https://higoverse.com/downloads/android/version.json',
  );

  static bool _checking = false;

  static Future<void> check(BuildContext context, {bool manual = false}) async {
    if (kIsWeb || !Platform.isAndroid || _checking) return;
    _checking = true;
    final closeLoader = manual ? _showChecking(context) : null;
    try {
      final info = await PackageInfo.fromPlatform();
      final fromPlay = info.installerStore == 'com.android.vending';
      if (!context.mounted) return;
      if (fromPlay) {
        await _viaPlay(context, manual, closeLoader);
      } else {
        await _viaFeed(context, info, manual, closeLoader);
      }
    } finally {
      closeLoader?.call();
      _checking = false;
    }
  }

  /// "Checking for updates…" with the rings loader; returns how to close it.
  static VoidCallback _showChecking(BuildContext context) {
    final nav = Navigator.of(context, rootNavigator: true);
    var open = true;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (d) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(children: [
            const RingsLoader(size: 32),
            const SizedBox(width: 18),
            Expanded(child: Text(T.of(d)('upd.checking'), style: const TextStyle(fontWeight: FontWeight.w600))),
          ]),
        ),
      ),
    ).whenComplete(() => open = false);
    return () {
      if (open) {
        open = false;
        nav.pop();
      }
    };
  }

  static Future<void> _viaPlay(BuildContext context, bool manual, VoidCallback? closeLoader) async {
    try {
      final u = await InAppUpdate.checkForUpdate();
      closeLoader?.call();
      if (u.updateAvailability != UpdateAvailability.updateAvailable) {
        if (manual && context.mounted) _snack(context, T.of(context)('upd.latest'));
        return;
      }
      if (u.flexibleUpdateAllowed) {
        if (!context.mounted) return;
        final t = T.of(context);
        final messenger = ScaffoldMessenger.of(context);
        // Play asks first; while it downloads, a bar with the loader says so.
        final downloading = messenger.showSnackBar(SnackBar(
          duration: const Duration(days: 1),
          content: Row(children: [
            const RingsLoader(size: 22, color: Colors.white),
            const SizedBox(width: 14),
            Expanded(child: Text(t('upd.downloading_bg'))),
          ]),
        ));
        final AppUpdateResult r;
        try {
          r = await InAppUpdate.startFlexibleUpdate();
        } finally {
          downloading.close();
        }
        if (r == AppUpdateResult.success && context.mounted) {
          messenger.showSnackBar(SnackBar(
            duration: const Duration(days: 1),
            content: Text(t('upd.downloaded')),
            action: SnackBarAction(label: t('upd.restart'), onPressed: () => InAppUpdate.completeFlexibleUpdate()),
          ));
        }
      } else if (u.immediateUpdateAllowed) {
        await InAppUpdate.performImmediateUpdate();
      }
    } catch (_) {
      closeLoader?.call();
      if (manual && context.mounted) _snack(context, T.of(context)('upd.failed'));
    }
  }

  static Future<void> _viaFeed(BuildContext context, PackageInfo info, bool manual, VoidCallback? closeLoader) async {
    Map<String, dynamic>? v;
    try {
      final res = await http.get(Uri.parse(feed)).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) v = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {}
    closeLoader?.call();
    if (!context.mounted) return;
    final t = T.of(context);
    if (v == null) {
      if (manual) _snack(context, t('upd.failed'));
      return;
    }
    final latest = int.tryParse('${v['versionCode']}') ?? 0;
    final current = int.tryParse(info.buildNumber) ?? 0;
    if (latest <= current) {
      if (manual) _snack(context, t('upd.latest_v', {'v': info.version}));
      return;
    }
    final c = Hgv.of(context);
    final go = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(t('upd.available', {'v': v!['versionName'] ?? ''})),
        content: Text('${v['notes'] ?? t('upd.default_notes')}\n\n${t('upd.how')}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: Text(t('upd.later'))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: c.ink),
            onPressed: () => Navigator.pop(d, true),
            child: Text(t('upd.download')),
          ),
        ],
      ),
    );
    final url = Uri.tryParse('${v['apk'] ?? ''}');
    if (go != true || url == null || !context.mounted) return;
    await _downloadAndInstall(context, url, '${v['versionName'] ?? latest}');
  }

  /// Downloads the APK with a progress dialog, then opens the installer.
  /// If anything goes wrong, offers the download in the browser instead.
  static Future<void> _downloadAndInstall(BuildContext context, Uri url, String version) async {
    final t = T.of(context);
    final progress = ValueNotifier<(int, int?)>((0, null));
    final client = http.Client();
    var cancelled = false, dialogOpen = true;
    final nav = Navigator.of(context, rootNavigator: true);
    final dialog = showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (d) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: Text(t('upd.downloading_v', {'v': version})),
          content: ValueListenableBuilder<(int, int?)>(
            valueListenable: progress,
            builder: (_, p, __) {
              final (done, total) = p;
              final fraction = total == null || total == 0 ? null : (done / total).clamp(0.0, 1.0);
              return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const RingsLoader(size: 30),
                  const SizedBox(width: 14),
                  Text(fraction == null ? t('app.loading') : '${(fraction * 100).round()}%',
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 14),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(value: fraction, minHeight: 6, backgroundColor: Hgv.of(d).skeleton),
                ),
                const SizedBox(height: 8),
                Text(
                  total == null ? '${_mb(done)} MB' : t('upd.mb_of', {'done': _mb(done), 'total': _mb(total)}),
                  style: TextStyle(color: Hgv.of(d).muted, fontSize: 13),
                ),
              ]);
            },
          ),
          actions: [
            TextButton(
              onPressed: () {
                cancelled = true;
                client.close();
              },
              child: Text(t('app.cancel')),
            ),
          ],
        ),
      ),
    );
    final dialogClosed = dialog.whenComplete(() => dialogOpen = false);
    Future<void> closeDialog() async {
      if (dialogOpen) nav.pop();
      await dialogClosed;
    }

    File? file;
    try {
      final res = await client.send(http.Request('GET', url)).timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
      final dir = await getApplicationCacheDirectory();
      file = File('${dir.path}/higoverse-update.apk');
      final sink = file.openWrite();
      var done = 0;
      try {
        await for (final chunk in res.stream.timeout(const Duration(seconds: 30))) {
          sink.add(chunk);
          done += chunk.length;
          progress.value = (done, res.contentLength);
        }
      } finally {
        await sink.close();
      }
      if (res.contentLength != null && done < res.contentLength!) throw Exception('incomplete');
      await closeDialog();
      final opened = await OpenFilex.open(file.path, type: 'application/vnd.android.package-archive');
      if (opened.type != ResultType.done) throw Exception(opened.message);
    } catch (_) {
      await closeDialog();
      try {
        if (file != null && file.existsSync()) file.deleteSync();
      } catch (_) {}
      if (cancelled || !context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        duration: const Duration(seconds: 10),
        content: Text(t('upd.download_failed')),
        action: SnackBarAction(
          label: t('upd.open_browser'),
          onPressed: () => launchUrl(url, mode: LaunchMode.externalApplication),
        ),
      ));
    } finally {
      client.close();
      progress.dispose();
    }
  }

  static String _mb(int bytes) => (bytes / 1048576).toStringAsFixed(1);

  static void _snack(BuildContext context, String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}
