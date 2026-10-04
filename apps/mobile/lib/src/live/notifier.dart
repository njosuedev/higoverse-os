import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../app_settings.dart';
import '../format.dart';
import '../i18n.dart';
import '../session.dart';
import '../theme.dart';
import '../ui.dart';
import 'activity.dart';

/// Taps on notification actions while the app is not running land here;
/// "Mark as read" only needs the notification gone, which Android does.
@pragma('vm:entry-point')
void _backgroundResponse(NotificationResponse response) {}

/// Phone notifications for live activity, the way WhatsApp does them:
///
/// * every alert pops up on the screen with the Higoverse chime and a short
///   vibration — app open or not (Sound off in Menu: pops up silently);
/// * alerts stack per topic like chats — Sales, Fines & transfers, Stock,
///   Money — each line with who did it (initials avatar) and the vehicle or
///   product photo, under one "N new updates" summary;
/// * a "Mark as read" button, and the unread count on the app icon.
///
/// They come while the app is open or was used recently: the live connection
/// is what brings them (see HomeShell). Tapping one opens Notifications.
class AppNotifier {
  AppNotifier._();
  static final instance = AppNotifier._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false, _allowed = false;

  /// Called when a notification is tapped.
  VoidCallback? onOpen;

  /// Called when "Mark as read" is pressed.
  VoidCallback? onMarkRead;

  /// Whether the phone lets the app post notifications.
  bool get allowed => _allowed;

  // A channel's sound is fixed once created: a new sound needs a new id.
  static const _channel = 'hgv_alerts_chime', _silentChannel = 'hgv_alerts_silent';
  static const _group = 'higoverse.live';
  static const _summaryId = 100;
  static final _vibration = Int64List.fromList([0, 220, 140, 220]);

  /// Each topic's latest lines, newest last (like a chat), until read.
  final Map<String, List<Message>> _threads = {};
  final Map<String, Uint8List> _avatars = {};

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
        onDidReceiveNotificationResponse: (r) {
          if (r.actionId == 'read') {
            onMarkRead?.call();
            clear();
          } else {
            onOpen?.call();
          }
        },
        onDidReceiveBackgroundNotificationResponse: _backgroundResponse,
      );
      final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (android != null) {
        // Older channels (sound fixed at creation) give way to these.
        for (final old in const ['live_sound', 'live_ring', 'live_quiet', 'hgv_alerts']) {
          await android.deleteNotificationChannel(channelId: old);
        }
        await android.createNotificationChannel(AndroidNotificationChannel(
          _channel,
          'Live activity',
          description: 'Sales, traffic fines, transfers and stock alerts as they happen.',
          importance: Importance.max,
          playSound: true,
          sound: const RawResourceAndroidNotificationSound('hgv_chime'),
          enableVibration: true,
          vibrationPattern: _vibration,
          enableLights: true,
          ledColor: Hgv.light.ink,
          showBadge: true,
        ));
        await android.createNotificationChannel(const AndroidNotificationChannel(
          _silentChannel,
          'Live activity (silent)',
          description: 'The same alerts on screen, without sound.',
          importance: Importance.high,
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

  /// Asks the phone again whether notifications are allowed (they may have
  /// been turned on in Settings since).
  Future<void> recheck() async {
    if (!_ready) return init();
    try {
      final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (android != null) _allowed = await android.areNotificationsEnabled() ?? _allowed;
    } catch (_) {}
  }

  static const _live = MethodChannel('com.higoverse.app/live');

  /// Android freezes an app seconds after it is left, which would cut the
  /// live connection and every alert with it. A foreground service (a quiet
  /// "Higoverse" line in the tray) keeps it going. Must start while the app
  /// is on screen.
  static Future<void> keepAlive(String title, String text) async {
    if (!Platform.isAndroid) return;
    try {
      await _live.invokeMethod<void>('start', {'title': title, 'text': text});
    } catch (_) {}
  }

  static Future<void> letGo() async {
    if (!Platform.isAndroid) return;
    try {
      await _live.invokeMethod<void>('stop');
    } catch (_) {}
  }

  /// Whether this entry should alert, given the person's settings.
  static bool wanted(ActivityItem item, AppSettings settings) =>
      ((item.kind == ActivityKind.sale || item.kind == ActivityKind.debtNew) && settings.alertSales) ||
      (item.kind.isStockAlert && settings.alertStock) ||
      (item.kind.isVehicleAlert && settings.alertFines);

  /// Which "chat" an entry belongs to: its id, title and notification id.
  static (String, String, int) _thread(T t, ActivityKind k) => switch (k) {
        ActivityKind.sale || ActivityKind.saleDeleted => ('sales', t('nav.sales'), 101),
        ActivityKind.fineRecorded || ActivityKind.transferPending => ('vehicles', t('story.section'), 102),
        ActivityKind.expense || ActivityKind.debtNew || ActivityKind.debtPayment || ActivityKind.debtPaid => ('money', t('debts.title'), 104),
        _ => ('stock', t('dash.stock_alerts'), 103),
      };

  Future<void> show(
    ActivityItem item, {
    required T t,
    required Session session,
    required bool sound,
    required int unread,
    Uint8List? photo,
  }) async {
    if (!_ready || !_allowed) return;
    try {
      final (key, title, id) = _thread(t, item.kind);
      final who = (item.by ?? '').trim().isNotEmpty ? item.by!.trim() : title;
      final amount = item.args['amount'];
      final text = [activityLine(t, item), if (amount is num && amount > 0) money(amount, session.currency)].join(' · ');
      final person = Person(name: who, key: who, icon: ByteArrayAndroidIcon(await _avatar(who)));
      final lines = (_threads[key] ??= [])..add(Message(text, item.at, person));
      if (lines.length > 7) lines.removeAt(0);
      final me = Person(name: session.shop?.name ?? 'Higoverse', key: 'me');
      final channel = sound ? _channel : _silentChannel;

      await _plugin.show(
        id: id,
        title: title,
        body: text,
        payload: 'activity',
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            channel,
            sound ? 'Live activity' : 'Live activity (silent)',
            importance: sound ? Importance.max : Importance.high,
            priority: Priority.max,
            playSound: sound,
            sound: sound ? const RawResourceAndroidNotificationSound('hgv_chime') : null,
            enableVibration: sound,
            vibrationPattern: sound ? _vibration : null,
            number: unread,
            color: Hgv.light.ink,
            category: AndroidNotificationCategory.message,
            visibility: NotificationVisibility.public,
            groupKey: _group,
            largeIcon: photo == null ? null : ByteArrayAndroidBitmap(photo),
            when: item.at.millisecondsSinceEpoch,
            showWhen: true,
            styleInformation: MessagingStyleInformation(
              me,
              conversationTitle: lines.length > 1 ? '$title · ${t('notif.n_new', {'n': lines.length})}' : title,
              groupConversation: true,
              messages: List.of(lines),
            ),
            actions: [AndroidNotificationAction('read', t('notif.mark_read'), cancelNotification: true)],
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBanner: true,
            presentList: true,
            presentSound: sound,
            presentBadge: true,
            badgeNumber: unread,
            threadIdentifier: key,
            subtitle: who == title ? null : who,
          ),
        ),
      );

      // Android: one summary over the topics, like WhatsApp's "N messages from M chats".
      if (Platform.isAndroid && _threads.length > 1) {
        final total = _threads.values.fold<int>(0, (n, l) => n + l.length);
        await _plugin.show(
          id: _summaryId,
          title: 'Higoverse',
          body: t('notif.n_new', {'n': total}),
          payload: 'activity',
          notificationDetails: NotificationDetails(
            android: AndroidNotificationDetails(
              channel,
              sound ? 'Live activity' : 'Live activity (silent)',
              groupKey: _group,
              setAsGroupSummary: true,
              groupAlertBehavior: GroupAlertBehavior.children,
              number: unread,
              color: Hgv.light.ink,
              styleInformation: InboxStyleInformation(
                [for (final l in _threads.values) if (l.isNotEmpty) '${l.last.person?.name ?? ''}: ${l.last.text}'],
                summaryText: t('notif.n_new', {'n': total}),
              ),
            ),
          ),
        );
      }
    } catch (_) {}
  }

  /// Everything was seen: clear the tray, the topics and the icon's number.
  Future<void> clear() async {
    _threads.clear();
    if (!_ready) return;
    try {
      await _plugin.cancelAll();
    } catch (_) {}
  }

  /// A round initials picture for [name] (WhatsApp shows the sender's photo).
  Future<Uint8List> _avatar(String name) async {
    final cached = _avatars[name];
    if (cached != null) return cached;
    const size = 128.0;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawCircle(const Offset(size / 2, size / 2), size / 2, Paint()..color = Avatar.colorFor(name));
    final tp = TextPainter(
      text: TextSpan(
        text: Avatar.initials(name),
        style: const TextStyle(color: Colors.white, fontSize: 50, fontWeight: FontWeight.w700),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset((size - tp.width) / 2, (size - tp.height) / 2));
    final image = await recorder.endRecording().toImage(size.toInt(), size.toInt());
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    return _avatars[name] = png!.buffer.asUint8List();
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
