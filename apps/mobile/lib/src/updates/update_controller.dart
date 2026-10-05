import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:in_app_update/in_app_update.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import '../config.dart';
import '../i18n.dart';
import '../loading.dart';
import '../theme.dart';
import 'update_core.dart';

/// Keeps the Android app up to date, without ever holding up the app:
///
///   app opens normally → background check (a few seconds later, at most
///   every 6 hours) → nothing, unless there is a newer version → prompt →
///   download with progress → verify → Android's installer → new version.
///
/// * The release comes from the Higoverse endpoint (config.dart's API base +
///   /settings/api/app-updates/latest); no update URL is built into the app.
/// * Optional updates can be put off ("Later": not asked again for a day);
///   required ones block the app until it is updated.
/// * The APK must match the published SHA-256, be this app (same package)
///   and carry the announced versionCode before it is installed. Android
///   itself also checks the signing key, so data and sign-in are kept.
/// * Installs from Google Play use Play's in-app update instead.
/// * No server, no network: nothing happens and the app carries on.
class AppUpdates extends ChangeNotifier {
  AppUpdates._();
  static final instance = AppUpdates._();

  static const _channel = MethodChannel('com.higoverse.app/updates');

  /// Set by main.dart: prompts are shown above whatever screen is open.
  GlobalKey<NavigatorState>? navigatorKey;
  GlobalKey<ScaffoldMessengerState>? messengerKey;

  UpdateStage stage = UpdateStage.idle;
  ReleaseInfo? release;
  UpdateKind kind = UpdateKind.none;

  /// A newer version of the app is published (Android installs that update
  /// from Higoverse).
  bool get updateAvailable => kind != UpdateKind.none && release != null;
  int received = 0;
  int? total;
  DownloadError? error;
  bool needsPermission = false;

  CancelToken? _cancel;
  File? _apk;
  bool _dialogOpen = false, _checking = false;
  PackageInfo? _info;

  final _store = _SecureUpdateStore();
  late final _checker = UpdateChecker(
    endpoint: Uri.parse('$apiBase${Svc.settings}/api/app-updates/latest'),
    store: _store,
    allowHttp: apiBase.startsWith('http://'), // local testing builds only
  );
  late final _snooze = Snooze(_store);

  BuildContext? get _ctx => navigatorKey?.currentContext;
  bool get _supported => !kIsWeb && Platform.isAndroid;

  /// Called once the app is on screen. Returns at once; the check runs later.
  void start() {
    if (!_supported) return;
    Timer(const Duration(seconds: 3), () => check());
    // Coming back from the installer or from the permission screen.
    AppLifecycleListener(onResume: _onResume);
  }

  /// Background check, or the Account screen's "Check for updates".
  Future<void> check({bool manual = false}) async {
    if (!_supported || _checking) return;
    if (stage == UpdateStage.downloading || stage == UpdateStage.verifying) {
      _showProgress();
      return;
    }
    _checking = true;
    final messenger = messengerKey?.currentState;
    ScaffoldFeatureController<SnackBar, SnackBarClosedReason>? checking;
    try {
      final info = _info ??= await PackageInfo.fromPlatform();
      if (manual && _ctx != null) {
        checking = messenger?.showSnackBar(SnackBar(
          duration: const Duration(seconds: 20),
          content: Row(children: [
            const RingsLoader(size: 20, color: Colors.white),
            const SizedBox(width: 14),
            Expanded(child: Text(T.of(_ctx!)('upd.checking'))),
          ]),
        ));
      }
      final current = int.tryParse(info.buildNumber) ?? 0;
      await _cleanOldDownloads(current);
      final r = await _checker.latest(force: manual);
      checking?.close();
      final k = decide(r, current);
      if (info.installerStore == 'com.android.vending') {
        await _viaPlay(manual, k);
        return;
      }
      if (k == UpdateKind.none) {
        if (manual) _snack(T.of(_ctx!)('upd.latest_v', {'v': info.version}));
        return;
      }
      // Known even when put off with "Later": the Menu tab keeps a red dot.
      release = r;
      kind = k;
      notifyListeners();
      if (k == UpdateKind.optional && !manual && await _snooze.isSnoozed(r!.versionCode)) return;
      if (stage == UpdateStage.ready && _apk != null) {
        _showProgress();
      } else {
        await _prompt();
      }
    } catch (_) {
      checking?.close();
      if (manual && _ctx != null) _snack(T.of(_ctx!)('upd.failed'));
    } finally {
      _checking = false;
    }
  }

  // ── Prompt ────────────────────────────────────────────────────────────────
  Future<void> _prompt() async {
    final ctx = _ctx, r = release;
    if (ctx == null || r == null || _dialogOpen) return;
    final required = kind == UpdateKind.required;
    _dialogOpen = true;
    final go = await showDialog<bool>(
      context: ctx,
      barrierDismissible: !required,
      builder: (_) => PopScope(canPop: !required, child: _UpdatePrompt(release: r, required: required)),
    );
    _dialogOpen = false;
    if (go == true) {
      unawaited(download());
    } else if (!required) {
      await _snooze.snooze(r.versionCode);
    }
  }

  // ── Download → verify → install ──────────────────────────────────────────
  Future<void> download() async {
    final r = release;
    if (r == null || stage == UpdateStage.downloading) return;
    _set(UpdateStage.downloading, () {
      error = null;
      received = 0;
      total = r.size;
    });
    _showProgress();
    _cancel = CancelToken();
    try {
      final dir = Directory('${(await getApplicationCacheDirectory()).path}/updates');
      final file = await downloadRelease(
        r,
        dir,
        fileName: 'higoverse-${r.versionCode}.apk',
        cancel: _cancel,
        onProgress: (got, all) {
          received = got;
          total = all;
          if (all != null && got >= all && stage == UpdateStage.downloading) stage = UpdateStage.verifying;
          notifyListeners();
        },
      );
      // Same app, announced version: anything else is not installed.
      final apk = await _channel.invokeMapMethod<String, Object?>('apkInfo', {'path': file.path});
      final info = _info ??= await PackageInfo.fromPlatform();
      if (apk == null || apk['packageName'] != info.packageName || apk['versionCode'] != r.versionCode) {
        await file.delete().catchError((_) => file);
        throw UpdateDownloadException(DownloadError.corrupt, 'not the announced APK');
      }
      _apk = file;
      _set(UpdateStage.ready);
      _showProgress();
      await install();
    } on UpdateDownloadException catch (e) {
      if (e.kind == DownloadError.cancelled) {
        _set(UpdateStage.idle);
      } else {
        _set(UpdateStage.failed, () => error = e.kind);
        _showProgress();
      }
    } catch (_) {
      _set(UpdateStage.failed, () => error = DownloadError.storage);
      _showProgress();
    }
  }

  Future<void> install() async {
    final apk = _apk;
    if (apk == null || !await apk.exists()) {
      _set(UpdateStage.idle);
      return;
    }
    if (await _channel.invokeMethod<bool>('canInstall') != true) {
      _set(UpdateStage.ready, () => needsPermission = true);
      return;
    }
    _set(UpdateStage.installing, () => needsPermission = false);
    try {
      await _channel.invokeMethod('install', {'path': apk.path});
    } catch (_) {
      _set(UpdateStage.failed, () => error = DownloadError.storage);
    }
  }

  Future<void> openPermissionSettings() => _channel.invokeMethod('openInstallSettings');

  void _onResume() {
    // Back from "Install unknown apps": carry on if it is now allowed.
    if (stage == UpdateStage.ready && needsPermission) {
      unawaited(install());
    } else if (stage == UpdateStage.installing) {
      // The installer was closed without installing: offer it again.
      _set(UpdateStage.ready);
    }
  }

  void cancelDownload() => _cancel?.cancel();

  void later() {
    final r = release;
    if (r != null && kind != UpdateKind.required) unawaited(_snooze.snooze(r.versionCode));
  }

  // ── Progress dialog ──────────────────────────────────────────────────────
  void _showProgress() {
    final ctx = _ctx;
    if (ctx == null || _dialogOpen) return;
    _dialogOpen = true;
    final required = kind == UpdateKind.required;
    showDialog<void>(
      context: ctx,
      barrierDismissible: false,
      builder: (_) => PopScope(canPop: !required, child: _UpdateProgress(controller: this, required: required)),
    ).whenComplete(() => _dialogOpen = false);
  }

  /// Hide the progress dialog; an optional download carries on behind.
  void hideDialog(BuildContext dialogContext) {
    Navigator.of(dialogContext).pop();
    if (stage == UpdateStage.downloading || stage == UpdateStage.verifying) {
      _snack(T.of(dialogContext)('upd.downloading_bg'));
    }
  }

  // ── Google Play installs ─────────────────────────────────────────────────
  Future<void> _viaPlay(bool manual, UpdateKind serverKind) async {
    // Read the navigator's context fresh each time: never one held across awaits.
    String text(String key) => _ctx == null ? key : T.of(_ctx!)(key);
    try {
      final u = await InAppUpdate.checkForUpdate();
      if (u.updateAvailability != UpdateAvailability.updateAvailable) {
        if (manual) _snack(text('upd.latest'));
        return;
      }
      if ((serverKind == UpdateKind.required || !u.flexibleUpdateAllowed) && u.immediateUpdateAllowed) {
        await InAppUpdate.performImmediateUpdate();
      } else if (u.flexibleUpdateAllowed) {
        final r = await InAppUpdate.startFlexibleUpdate();
        if (r == AppUpdateResult.success && _ctx != null) {
          final t = T.of(_ctx!);
          messengerKey?.currentState?.showSnackBar(SnackBar(
            duration: const Duration(days: 1),
            content: Text(t('upd.downloaded')),
            action: SnackBarAction(label: t('upd.restart'), onPressed: () => InAppUpdate.completeFlexibleUpdate()),
          ));
        }
      }
    } catch (_) {
      if (manual) _snack(text('upd.failed'));
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  void _set(UpdateStage s, [void Function()? also]) {
    stage = s;
    also?.call();
    notifyListeners();
  }

  void _snack(String msg) => messengerKey?.currentState?.showSnackBar(SnackBar(content: Text(msg)));

  /// Installed versions leave their APK behind: removed once it is older.
  Future<void> _cleanOldDownloads(int current) async {
    try {
      final dir = Directory('${(await getApplicationCacheDirectory()).path}/updates');
      if (!await dir.exists()) return;
      await for (final f in dir.list()) {
        final m = RegExp(r'higoverse-(\d+)\.apk').firstMatch(f.path);
        if (m != null && (int.tryParse(m.group(1)!) ?? 0) <= current) await f.delete();
      }
    } catch (_) {}
  }
}

enum UpdateStage { idle, downloading, verifying, ready, installing, failed }

class _SecureUpdateStore implements UpdateStore {
  static const _s = FlutterSecureStorage();
  @override
  Future<String?> read(String key) async {
    try {
      return await _s.read(key: key);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String key, String? value) async {
    try {
      await _s.write(key: key, value: value);
    } catch (_) {}
  }
}

// ── Screens ──────────────────────────────────────────────────────────────────

/// "New update available" / "Update required": logo, version, what's new.
class _UpdatePrompt extends StatelessWidget {
  const _UpdatePrompt({required this.release, required this.required});
  final ReleaseInfo release;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 22, 22, 14),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.asset('assets/higoverse-logo.png', width: 44, height: 44),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t(required ? 'upd.required_title' : 'upd.available_title'),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text('Higoverse ${release.version}', style: TextStyle(color: c.ink, fontWeight: FontWeight.w700)),
              ]),
            ),
          ]),
          const SizedBox(height: 16),
          Text(
            required ? t('upd.required_body') : t('upd.available_body', {'v': release.version}),
            style: TextStyle(color: c.muted, height: 1.4),
          ),
          if (release.releaseNotes.isNotEmpty) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              constraints: const BoxConstraints(maxHeight: 180),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.paper, borderRadius: BorderRadius.circular(8), border: Border.all(color: c.border)),
              child: SingleChildScrollView(
                child: Text(release.releaseNotes, style: TextStyle(color: c.text, height: 1.4)),
              ),
            ),
          ],
          if (release.size != null) ...[
            const SizedBox(height: 10),
            Text('${(release.size! / 1048576).toStringAsFixed(1)} MB', style: TextStyle(color: c.faint, fontSize: 12)),
          ],
          const SizedBox(height: 18),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            if (!required) TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t('upd.later'))),
            const SizedBox(width: 8),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(0, 44), padding: const EdgeInsets.symmetric(horizontal: 20)),
              onPressed: () => Navigator.pop(context, true),
              child: Text(t('upd.update_now')),
            ),
          ]),
        ]),
      ),
    );
  }
}

/// "Updating Higoverse": progress, then "Update ready — Installing…", or what
/// went wrong with a way to try again.
class _UpdateProgress extends StatelessWidget {
  const _UpdateProgress({required this.controller, required this.required});
  final AppUpdates controller;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final u = controller;
        final v = u.release?.version ?? '';
        String title, status;
        final actions = <Widget>[];
        Widget? body;
        switch (u.stage) {
          case UpdateStage.downloading:
          case UpdateStage.verifying:
            title = t('upd.updating');
            status = t(u.stage == UpdateStage.verifying ? 'upd.verifying' : 'upd.downloading');
            final fraction = u.total == null || u.total == 0 ? null : (u.received / u.total!).clamp(0.0, 1.0);
            body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                    value: u.stage == UpdateStage.verifying ? null : fraction, minHeight: 8, backgroundColor: c.skeleton),
              ),
              const SizedBox(height: 10),
              Text(
                fraction == null
                    ? '${_mb(u.received)} MB'
                    : t('upd.progress', {'p': (fraction * 100).floor(), 'done': _mb(u.received), 'total': _mb(u.total!)}),
                style: TextStyle(color: c.muted, fontWeight: FontWeight.w600, fontFeatures: const [FontFeature.tabularFigures()]),
              ),
            ]);
            if (!required) {
              actions
                ..add(TextButton(
                    onPressed: () {
                      u.cancelDownload();
                      Navigator.of(context).pop();
                    },
                    child: Text(t('app.cancel'))))
                ..add(TextButton(onPressed: () => u.hideDialog(context), child: Text(t('upd.hide'))));
            }
          case UpdateStage.ready:
          case UpdateStage.installing:
            title = t('upd.ready_title');
            if (u.needsPermission) {
              status = t('upd.permission_body');
              actions.add(FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: u.openPermissionSettings,
                  child: Text(t('upd.open_settings'))));
            } else {
              status = '${t('upd.installing', {'v': v})}\n${t('upd.please_wait')}';
              body = const Center(child: Padding(padding: EdgeInsets.symmetric(vertical: 6), child: RingsLoader(size: 34)));
              if (u.stage == UpdateStage.ready) {
                actions.add(FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                    onPressed: u.install,
                    child: Text(t('upd.install'))));
              }
            }
            if (!required) actions.insert(0, TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(t('upd.later'))));
          case UpdateStage.failed:
            title = t('upd.updating');
            status = t(switch (u.error) {
              DownloadError.corrupt => 'upd.failed_corrupt',
              DownloadError.storage => 'upd.failed_storage',
              _ => 'upd.failed_network',
            });
            if (!required) {
              actions.add(TextButton(
                  onPressed: () {
                    u.later();
                    Navigator.of(context).pop();
                  },
                  child: Text(t('upd.later'))));
            }
            actions.add(FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: u.download,
                child: Text(t('upd.try_again'))));
          case UpdateStage.idle:
            // Cancelled: nothing to show.
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (context.mounted && ModalRoute.of(context)?.isCurrent == true) Navigator.of(context).pop();
            });
            return const SizedBox.shrink();
        }
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          title: Row(children: [
            ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.asset('assets/higoverse-logo.png', width: 32, height: 32)),
            const SizedBox(width: 12),
            Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          ]),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(status, style: TextStyle(color: u.stage == UpdateStage.failed ? c.danger : c.text, height: 1.4)),
            if (body != null) ...[const SizedBox(height: 16), body],
          ]),
          actions: actions,
        );
      },
    );
  }

  static String _mb(int bytes) => (bytes / 1048576).toStringAsFixed(1);
}
