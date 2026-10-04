import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../app_settings.dart';
import '../format.dart';
import '../i18n.dart';
import '../session.dart';
import '../theme.dart';
import 'activity.dart';

/// Phone notifications for live activity: a sale, a traffic fine, a vehicle
/// waiting for transfer, stock running out. They ring (unless Sound is off
/// in Account), show in the status bar, and carry the unread count — the
/// number on the app icon on most Android phones and on iOS.
///
/// They come while the app is open or was used recently: the live connection
/// is what brings them (see HomeShell). Tapping one opens Notifications.
class AppNotifier {
  AppNotifier._();
  static final instance = AppNotifier._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false, _allowed = false;
  int _nextId = 1;

  /// Called when a notification is tapped.
  VoidCallback? onOpen;

  /// Whether the phone lets the app post notifications.
  bool get allowed => _allowed;

  // Android fixes a channel's sound and pop-up once created: one channel per behaviour.
  static const _popChannel = 'live_sound', _ringChannel = 'live_ring', _quietChannel = 'live_quiet';

  Future<void> init() async {
    if (_ready || !(Platform.isAndroid || Platform.isIOS)) return;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('ic_stat_higoverse'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (_) => onOpen?.call(),
      );
      final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (android != null) {
        await android.createNotificationChannel(const AndroidNotificationChannel(
          _popChannel,
          'Live activity',
          description: 'Sales, traffic fines, transfers and stock alerts as they happen.',
          importance: Importance.high,
          playSound: true,
          enableVibration: true,
          showBadge: true,
        ));
        // While the app is open: rings, but doesn't pop over the screen (the
        // app shows its own banner).
        await android.createNotificationChannel(const AndroidNotificationChannel(
          _ringChannel,
          'Live activity (app open)',
          description: 'Sound for alerts while Higoverse is on screen.',
          importance: Importance.defaultImportance,
          playSound: true,
          enableVibration: true,
          showBadge: true,
        ));
        await android.createNotificationChannel(const AndroidNotificationChannel(
          _quietChannel,
          'Live activity (silent)',
          description: 'The same alerts without sound.',
          importance: Importance.defaultImportance,
          playSound: false,
          enableVibration: false,
          showBadge: true,
        ));
        _allowed = await android.requestNotificationsPermission() ?? await android.areNotificationsEnabled() ?? false;
      }
      final ios = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
      if (ios != null) _allowed = await ios.requestPermissions(alert: true, badge: true, sound: true) ?? false;
      _ready = true;
    } catch (_) {
      _allowed = false; // no notifications; the in-app banner still works
    }
  }

  /// Whether this entry should alert, given the person's settings.
  static bool wanted(ActivityItem item, AppSettings settings) =>
      (item.kind == ActivityKind.sale && settings.alertSales) ||
      (item.kind.isStockAlert && settings.alertStock) ||
      (item.kind.isVehicleAlert && settings.alertFines);

  Future<void> show(ActivityItem item,
      {required T t, required Session session, required bool sound, required bool foreground, required int unread}) async {
    if (!_ready || !_allowed) return;
    final title = switch (item.kind) {
      ActivityKind.sale => t('notif.sale'),
      ActivityKind.fineRecorded => t('story.fines'),
      ActivityKind.transferPending => t('story.pending'),
      _ => t('dash.stock_alerts'),
    };
    final amount = item.args['amount'];
    final body = [
      activityLine(t, item),
      if (amount is num && amount > 0) money(amount, session.currency),
    ].join(' · ');
    try {
      await _plugin.show(
        id: _nextId++,
        title: title,
        body: body,
        payload: 'activity',
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            !sound ? _quietChannel : (foreground ? _ringChannel : _popChannel),
            !sound ? 'Live activity (silent)' : (foreground ? 'Live activity (app open)' : 'Live activity'),
            importance: sound && !foreground ? Importance.high : Importance.defaultImportance,
            priority: sound && !foreground ? Priority.high : Priority.defaultPriority,
            playSound: sound,
            enableVibration: sound,
            number: unread,
            color: Hgv.light.ink,
            category: AndroidNotificationCategory.status,
            groupKey: 'higoverse.live',
            styleInformation: BigTextStyleInformation(body),
          ),
          iOS: DarwinNotificationDetails(presentSound: sound, presentBadge: true, presentBanner: !foreground, presentList: true, badgeNumber: unread),
        ),
      );
    } catch (_) {}
  }

  /// Everything was seen: clear the tray and the app icon's number.
  Future<void> clear() async {
    if (!_ready) return;
    try {
      await _plugin.cancelAll();
    } catch (_) {}
  }
}

/// The entry's sentence (same as the Activity list), for notifications.
String activityLine(T t, ActivityItem item) {
  final args = <String, Object?>{
    ...item.args,
    'by': item.by ?? t('act.someone'),
    if (item.args['qty'] is num) 'qty': groupDigits(item.args['qty'] as num),
    if (item.args['n'] is num) 'n': groupDigits(item.args['n'] as num),
  };
  if (item.kind == ActivityKind.sale && item.by == null) return t('act.sale_anon', args);
  return t(item.kind.key, args);
}
