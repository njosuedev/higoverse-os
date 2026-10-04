import 'package:flutter/material.dart';

/// Colours from the website's design tokens (apps/web/app/globals.css), in a
/// light and a dark set. Few colours on purpose: neutrals, the brand blue,
/// and success / warning / danger only for status. Read them with `Hgv.of(context)`, so screens follow
/// the current appearance (System / Light / Dark).
@immutable
class Hgv extends ThemeExtension<Hgv> {
  const Hgv({
    required this.ink,
    required this.inkDark,
    required this.paper,
    required this.surface,
    required this.border,
    required this.text,
    required this.muted,
    required this.faint,
    required this.success,
    required this.warning,
    required this.danger,
    required this.skeleton,
    required this.skeletonHi,
  });

  final Color ink, inkDark, paper, surface, border, text, muted, faint, success, warning, danger;

  /// Loading placeholders: base and the highlight that sweeps across it —
  /// the website's Reports skeleton (.rep-sh), light and dark.
  final Color skeleton, skeletonHi;

  static const light = Hgv(
    ink: Color(0xFF0A66C2),
    inkDark: Color(0xFF004182),
    paper: Color(0xFFF3F2EF),
    surface: Colors.white,
    border: Color(0xFFE0DFDC),
    text: Color(0xFF191919),
    muted: Color(0xFF333333),
    faint: Color(0xFF474747),
    success: Color(0xFF057642),
    warning: Color(0xFF915907),
    danger: Color(0xFFCC1016),
    skeleton: Color(0xFFF1F5F9),
    skeletonHi: Color(0xFFE2E8F0),
  );

  static const dark = Hgv(
    ink: Color(0xFF4A9EED),
    inkDark: Color(0xFF7CB9F2),
    paper: Color(0xFF111317),
    surface: Color(0xFF1B1E23),
    border: Color(0xFF2C3138),
    text: Color(0xFFE8EAED),
    muted: Color(0xFFC4C8CE),
    faint: Color(0xFFA3A9B1),
    success: Color(0xFF3DBF7D),
    warning: Color(0xFFE3AA48),
    danger: Color(0xFFF0646A),
    skeleton: Color(0xFF1F2329),
    skeletonHi: Color(0xFF2A2F36),
  );

  static Hgv of(BuildContext context) => Theme.of(context).extension<Hgv>() ?? light;

  @override
  Hgv copyWith() => this;

  @override
  Hgv lerp(ThemeExtension<Hgv>? other, double t) => t < 0.5 || other is! Hgv ? this : other;
}

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? Hgv.dark : Hgv.light;
  final scheme = ColorScheme.fromSeed(
    seedColor: c.ink,
    brightness: brightness,
    primary: c.ink,
    surface: c.surface,
    onSurface: c.text,
    error: c.danger,
  );
  final base = ThemeData(useMaterial3: true, brightness: brightness, colorScheme: scheme, scaffoldBackgroundColor: c.paper);
  return base.copyWith(
    extensions: [c],
    textTheme: base.textTheme.apply(bodyColor: c.text, displayColor: c.text),
    appBarTheme: AppBarTheme(
      backgroundColor: c.surface,
      foregroundColor: c.text,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: c.text),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        side: BorderSide(color: c.border.withValues(alpha: 0.7)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      hintStyle: TextStyle(color: c.faint),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: c.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: c.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: c.ink, width: 1.5)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.ink,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    chipTheme: ChipThemeData(
      shape: const StadiumBorder(),
      side: BorderSide(color: c.border),
      backgroundColor: c.surface,
      selectedColor: c.ink.withValues(alpha: 0.14),
      labelStyle: TextStyle(fontWeight: FontWeight.w600, color: c.text),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 66,
      backgroundColor: c.surface,
      indicatorColor: c.ink.withValues(alpha: 0.16),
      labelTextStyle: WidgetStateProperty.all(TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.text)),
    ),
    dividerTheme: DividerThemeData(color: c.border, space: 1),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    ),
    badgeTheme: BadgeThemeData(backgroundColor: c.danger, textColor: Colors.white),
    dialogTheme: DialogThemeData(backgroundColor: c.surface),
  );
}
