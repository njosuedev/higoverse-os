/// Where the app reaches the Higoverse services.
///
/// Production goes through the same nginx paths as the website
/// (`https://higoverse.com/svc/<service>/...`). For local testing, build with
/// `--dart-define=API_BASE=http://10.0.2.2:3000/svc` (Android emulator →
/// your computer's web dev server, which forwards /svc to the services).
const String apiBase = String.fromEnvironment(
  'API_BASE',
  defaultValue: 'https://higoverse.com/svc',
);

/// Service roots under [apiBase] — mirror apps/web/lib/api-config.ts.
class Svc {
  static const auth = '/auth';
  static const products = '/products';
  static const sales = '/sales';
  static const settings = '/settings';
  static const suppliers = '/suppliers';
  static const expenses = '/expenses';
}
