import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'i18n.dart';

/// Device preferences that are not tied to an account (kept on sign-out):
/// the appearance — System (default), Light or Dark — the language, and
/// which live events show a banner.
class AppSettings extends ChangeNotifier {
  AppSettings({FlutterSecureStorage? storage}) : _store = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _store;
  static const _kTheme = 'hgv_theme', _kLang = 'hgv_lang', _kAlertSales = 'hgv_alert_sales', _kAlertStock = 'hgv_alert_stock',
      _kAlertFines = 'hgv_alert_fines', _kSound = 'hgv_alert_sound', _kRecent = 'hgv_recent_searches';

  ThemeMode themeMode = ThemeMode.system;

  /// Picked on this phone; null until the person chooses one.
  String? language;

  /// Banner when a sale is recorded / when stock runs low or out. On by default.
  bool alertSales = true, alertStock = true;

  /// Car dealers: a traffic fine recorded / a vehicle waiting for transfer.
  bool alertFines = true;

  /// Notifications ring (and vibrate); off = silent.
  bool sound = true;

  /// The last searches, newest first (shown when the search box is empty).
  List<String> recentSearches = const [];

  Future<void> load() async {
    try {
      final v = await _store.read(key: _kTheme);
      themeMode = switch (v) { 'light' => ThemeMode.light, 'dark' => ThemeMode.dark, _ => ThemeMode.system };
      final l = await _store.read(key: _kLang);
      language = supportedLangs.contains(l) ? l : null;
      alertSales = await _store.read(key: _kAlertSales) != 'off';
      alertStock = await _store.read(key: _kAlertStock) != 'off';
      alertFines = await _store.read(key: _kAlertFines) != 'off';
      sound = await _store.read(key: _kSound) != 'off';
      final r = await _store.read(key: _kRecent);
      recentSearches = r == null ? const [] : List<String>.from(jsonDecode(r) as List);
    } catch (_) {/* defaults: system appearance, no language picked */}
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    themeMode = mode;
    notifyListeners();
    try {
      await _store.write(key: _kTheme, value: mode.name);
    } catch (_) {}
  }

  Future<void> setLanguage(String lang) async {
    language = lang;
    notifyListeners();
    try {
      await _store.write(key: _kLang, value: lang);
    } catch (_) {}
  }

  Future<void> setAlerts({bool? sales, bool? stock, bool? fines, bool? sound}) async {
    alertSales = sales ?? alertSales;
    alertStock = stock ?? alertStock;
    alertFines = fines ?? alertFines;
    this.sound = sound ?? this.sound;
    notifyListeners();
    try {
      await _store.write(key: _kAlertSales, value: alertSales ? 'on' : 'off');
      await _store.write(key: _kAlertStock, value: alertStock ? 'on' : 'off');
      await _store.write(key: _kAlertFines, value: alertFines ? 'on' : 'off');
      await _store.write(key: _kSound, value: this.sound ? 'on' : 'off');
    } catch (_) {}
  }

  /// Remembers a search (or forgets one with [remove]); keeps the last 8.
  Future<void> rememberSearch(String q, {bool remove = false}) async {
    final v = q.trim();
    if (v.isEmpty) return;
    recentSearches = [if (!remove) v, ...recentSearches.where((x) => x.toLowerCase() != v.toLowerCase())].take(8).toList();
    notifyListeners();
    try {
      await _store.write(key: _kRecent, value: jsonEncode(recentSearches));
    } catch (_) {}
  }

  /// Like the website: the language picked on this phone wins, then the one
  /// saved on the account, then the phone's own language when the app has it.
  String effectiveLanguage({String? account, required Locale device}) {
    if (language != null) return language!;
    if (supportedLangs.contains(account)) return account!;
    if (supportedLangs.contains(device.languageCode)) return device.languageCode;
    return 'en';
  }
}

class AppSettingsScope extends InheritedNotifier<AppSettings> {
  const AppSettingsScope({super.key, required AppSettings settings, required super.child}) : super(notifier: settings);

  static AppSettings of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppSettingsScope>()!.notifier!;
}
