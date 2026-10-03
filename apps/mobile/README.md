# Higoverse mobile app

Flutter app for Android and iOS. It signs in to the same accounts as
[higoverse.com](https://higoverse.com) and talks to the same services.

## What it does

- **Sign in** with a Higoverse account (accounts are created by the
  administrator; there is no self-registration). Forgot password works with the
  6-digit code sent by email.
- **Home**: last 7 days of sales (and revenue for those allowed to see it),
  product/vehicle count, items needing restock, stock alerts and recent sales.
  Car dealers also see pending transfers and cars with fines.
- **Stock / Vehicles**: searchable list, loads more as you scroll. Car dealers
  see plate, status (Available / Pending / Sold) and fines, with a status filter.
- **Sales**: today, 7 days or 30 days.
- **Account**: who is signed in, the business, and sign-out.

Same rules as the website: car dealers' staff don't see money totals, and no one
sees profit.

## Run

```bash
flutter pub get
flutter run                     # uses https://higoverse.com/svc
```

### Against a local copy

Start the backend services and the web dev server (`apps/web`, port 3000, which
forwards `/svc/*` to the services), then point the app at it:

```bash
# Android emulator (10.0.2.2 is your computer)
flutter run --dart-define=API_BASE=http://10.0.2.2:3000/svc
# Real phone on the same Wi-Fi
flutter run --dart-define=API_BASE=http://<your-computer-ip>:3000/svc
```

Never point a test build at production data you don't mean to change.

## Check

```bash
flutter analyze
flutter test
```

## Release builds

```bash
flutter build apk --release        # Android APK
flutter build appbundle --release  # Google Play
flutter build ipa --release        # iOS (on a Mac)
```

App ID: `com.higoverse.app` (Android and iOS). Release signing keys are not in
the repository; set them up before publishing to a store.

## Code

```
lib/main.dart                  app start, restores a saved session
lib/src/config.dart            server address (API_BASE)
lib/src/api.dart               JSON client; renews the token once on 401
lib/src/session.dart           sign-in, token storage (Keystore/Keychain), sign-out
lib/src/screens/               login, home, stock/vehicles, sales, account
lib/src/theme.dart, widgets.dart   colours and shared pieces (match the website)
```
