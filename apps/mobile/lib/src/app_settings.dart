import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Device preferences that are not tied to an account (kept on sign-out):
/// the appearance — System (default), Light or Dark.
class AppSettings extends ChangeNotifier {
  AppSettings({FlutterSecureStorage? storage}) : _store = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _store;
  static const _kTheme = 'hgv_theme';

  ThemeMode themeMode = ThemeMode.system;

  Future<void> load() async {
    try {
      final v = await _store.read(key: _kTheme);
      themeMode = switch (v) { 'light' => ThemeMode.light, 'dark' => ThemeMode.dark, _ => ThemeMode.system };
    } catch (_) {/* default: system */}
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    themeMode = mode;
    notifyListeners();
    try {
      await _store.write(key: _kTheme, value: mode.name);
    } catch (_) {}
  }
}

class AppSettingsScope extends InheritedNotifier<AppSettings> {
  const AppSettingsScope({super.key, required AppSettings settings, required super.child}) : super(notifier: settings);

  static AppSettings of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppSettingsScope>()!.notifier!;
}
