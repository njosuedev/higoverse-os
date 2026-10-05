import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Colours from the website's design tokens (apps/web/app/globals.css), in a
/// light and a dark set. Few colours on purpose: neutrals, the brand blue,
/// and success / warning / danger only for status. Read them with `Hgv.of(context)`, so screens follow
/// the current appearance (System / Light / Dark).
/// Facebook's notification red (its `--notification-badge`, the same in
/// light and dark): every unread count and "something new" dot, and nothing
/// else — errors keep [Hgv.danger].
const notifyRed = Color(0xFFE41E3F);

@immutable
class Hgv extends ThemeExtension<Hgv> {
  const Hgv({
    required this.ink,
    required this.inkDark,
    required this.paper,
    required this.surface,
    required this.chrome,
    required this.elevated,
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

  /// Every page background, the top bar and the phone's safe areas (status
  /// bar, gesture bar): white in light, black in dark.
  final Color chrome;

  /// Sheets, dialogs, menus and toasts: white in light; in dark a step
  /// lighter than the page, as Instagram raises them (no outline needed).
  final Color elevated;

  /// Loading placeholders: base and the highlight that sweeps across it —
  /// the website's Reports skeleton (.rep-sh), light and dark.
  final Color skeleton, skeletonHi;

  static const light = Hgv(
    ink: Color(0xFF0A66C2),
    inkDark: Color(0xFF004182),
    paper: Color(0xFFF3F2EF),
    surface: Colors.white,
    chrome: Colors.white,
    elevated: Colors.white,
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

  /// Dark is Instagram's current one (its web theme tokens, the "/ig" dark
  /// scope): a blue-black page (primary background 12,16,20) instead of
  /// pure black, raised layers a step lighter (elevated 33,35,40; fields,
  /// chips and round buttons 37,41,46), #262626 lines, #F5F5F5 / #C7C7C7 /
  /// #A8A8A8 text, its blue #0095F6, green #58C322 and red #ED4956.
  /// Photo and story viewers stay true black, as on Instagram.
  static const dark = Hgv(
    ink: Color(0xFF0095F6),
    inkDark: Color(0xFF4CB5F9),
    paper: Color(0xFF25292E),
    surface: Color(0xFF0C1014),
    chrome: Color(0xFF0C1014),
    elevated: Color(0xFF212328),
    border: Color(0xFF262626),
    text: Color(0xFFF5F5F5),
    muted: Color(0xFFC7C7C7),
    faint: Color(0xFFA8A8A8),
    success: Color(0xFF58C322),
    warning: Color(0xFFE3AA48),
    danger: Color(0xFFED4956),
    skeleton: Color(0xFF25292E),
    skeletonHi: Color(0xFF2B3036),
  );

  static Hgv of(BuildContext context) => Theme.of(context).extension<Hgv>() ?? light;

  @override
  Hgv copyWith() => this;

  @override
  Hgv lerp(ThemeExtension<Hgv>? other, double t) => t < 0.5 || other is! Hgv ? this : other;
}

/// Status bar and navigation bar in the chrome colour, with icons that
/// read on it.
SystemUiOverlayStyle systemBars(Hgv c, Brightness brightness) {
  final icons = brightness == Brightness.dark ? Brightness.light : Brightness.dark;
  return SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: icons,
    statusBarBrightness: brightness, // iOS
    systemNavigationBarColor: c.chrome,
    systemNavigationBarDividerColor: c.chrome,
    systemNavigationBarIconBrightness: icons,
    systemNavigationBarContrastEnforced: false,
  );
}

/// Every digit the same width, so amounts and counts line up in columns and
/// don't jiggle when they change live. Texts inherit it from the theme.
TextTheme _tabular(TextTheme t) {
  TextStyle? f(TextStyle? s) => s?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
  return t.copyWith(
    displayLarge: f(t.displayLarge), displayMedium: f(t.displayMedium), displaySmall: f(t.displaySmall),
    headlineLarge: f(t.headlineLarge), headlineMedium: f(t.headlineMedium), headlineSmall: f(t.headlineSmall),
    titleLarge: f(t.titleLarge), titleMedium: f(t.titleMedium), titleSmall: f(t.titleSmall),
    bodyLarge: f(t.bodyLarge), bodyMedium: f(t.bodyMedium), bodySmall: f(t.bodySmall),
    labelLarge: f(t.labelLarge), labelMedium: f(t.labelMedium), labelSmall: f(t.labelSmall),
  );
}

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final c = dark ? Hgv.dark : Hgv.light;
  // Instagram's grey button (secondary-button 250 on 54; pressed 38) and
  // its field focus line (focus-stroke 85).
  const igButton = Color(0xFF363636), igButtonPressed = Color(0xFF262626), igFocus = Color(0xFF555555);
  final scheme = ColorScheme.fromSeed(
    seedColor: c.ink,
    brightness: brightness,
    primary: c.ink,
    surface: c.surface,
    onSurface: c.text,
    error: c.danger,
  );
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    // White (light) or Instagram's blue-black (dark) behind everything,
    // safe areas included.
    scaffoldBackgroundColor: c.chrome,
    // Denser, like the big social apps: more on screen, smaller touch padding.
    visualDensity: const VisualDensity(horizontal: -1, vertical: -1),
  );
  return base.copyWith(
    extensions: [c],
    textTheme: _tabular(base.textTheme.apply(bodyColor: c.text, displayColor: c.text)),
    appBarTheme: AppBarTheme(
      backgroundColor: c.chrome,
      surfaceTintColor: Colors.transparent,
      foregroundColor: c.text,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: c.text),
      toolbarHeight: 54,
      systemOverlayStyle: systemBars(c, brightness),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        side: BorderSide(color: dark ? c.border : c.border.withValues(alpha: 0.7)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      // Dark: Instagram's filled grey fields with no outline until focused,
      // in its lighter grey (secondary-elevated 43,48,54) so they also show
      // on sheets and dialogs.
      fillColor: dark ? const Color(0xFF2B3036) : c.surface,
      hintStyle: TextStyle(color: c.faint),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: dark ? BorderSide.none : BorderSide(color: c.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: dark ? BorderSide.none : BorderSide(color: c.border)),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8), borderSide: dark ? const BorderSide(color: igFocus) : BorderSide(color: c.ink, width: 1.5)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.ink,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    // Second-choice buttons: Instagram's grey fill in dark (no outline).
    outlinedButtonTheme: dark
        ? OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
              backgroundColor: igButton,
              foregroundColor: const Color(0xFFFAFAFA),
              side: BorderSide.none,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              textStyle: const TextStyle(fontWeight: FontWeight.w700),
            ).copyWith(overlayColor: const WidgetStatePropertyAll(igButtonPressed)),
          )
        : null,
    chipTheme: ChipThemeData(
      shape: const StadiumBorder(),
      side: dark ? BorderSide.none : BorderSide(color: c.border),
      backgroundColor: dark ? c.paper : c.surface,
      selectedColor: c.ink.withValues(alpha: 0.14),
      labelStyle: TextStyle(fontWeight: FontWeight.w600, color: c.text),
    ),
    listTileTheme: ListTileThemeData(
      titleTextStyle: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.text),
      subtitleTextStyle: TextStyle(fontSize: 12.5, color: c.faint),
      minVerticalPadding: 4,
      horizontalTitleGap: 10,
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 60,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(size: 24, color: s.contains(WidgetState.selected) ? c.ink : c.muted)),
      backgroundColor: c.chrome,
      surfaceTintColor: Colors.transparent,
      indicatorColor: c.ink.withValues(alpha: 0.16),
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
          fontSize: 11,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
          color: s.contains(WidgetState.selected) ? c.ink : c.muted)),
    ),
    dividerTheme: DividerThemeData(color: c.border, space: 1),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.elevated,
      surfaceTintColor: Colors.transparent,
      dragHandleColor: dark ? const Color(0xFF555555) : null,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    ),
    badgeTheme: const BadgeThemeData(backgroundColor: notifyRed, textColor: Colors.white),
    dialogTheme: DialogThemeData(
      backgroundColor: c.elevated,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: c.elevated,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    datePickerTheme: DatePickerThemeData(backgroundColor: c.elevated, surfaceTintColor: Colors.transparent),
    // Toasts: a raised dark grey card in dark, as Instagram shows them.
    snackBarTheme: dark
        ? SnackBarThemeData(
            backgroundColor: c.elevated,
            contentTextStyle: TextStyle(color: c.text, fontSize: 14, fontWeight: FontWeight.w500),
            actionTextColor: c.ink,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          )
        : null,
    // Presses and hovers: white at 10% in dark (Instagram's hover overlay).
    splashColor: dark ? Colors.white.withValues(alpha: 0.10) : null,
    highlightColor: dark ? Colors.white.withValues(alpha: 0.06) : null,
  );
}
