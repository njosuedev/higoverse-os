# Publishing Higoverse on Google Play

Everything here is ready to paste into the Play Console. Steps marked **You**
need your Google account (creating the developer account, paying, accepting
Google's terms, publishing).

## Files

| What | File |
|---|---|
| App bundle to upload | `apps/mobile/build/app/outputs/bundle/release/app-release.aab` (rebuild with `flutter build appbundle --release`) |
| App icon (512×512) | `store/app-icon-512.png` |
| Feature graphic (1024×500) | `store/feature-graphic-1024x500.png` |
| Phone screenshots (1080×1920) | `store/screenshots/1-sign-in.png` … `4-sales.png` |
| Privacy policy | https://higoverse.com/privacy |

The upload key is **not** in the repository: `D:\Higoverse\Keys\higoverse-upload.jks`
with its passwords in `D:\Higoverse\Keys\key.properties`. Back both up somewhere
safe (e.g. a password manager). Every update must be signed with this key. With
Play App Signing (the default) Google can reset a lost upload key, but only
after a support request.

## 1. Developer account (You)

1. Go to https://play.google.com/console and sign up (one-time USD 25 fee,
   identity verification).
2. Choose **Organization** if Higoverse is a registered company (needs a
   D-U-N-S number), otherwise **Personal**.
   - New *personal* accounts must run a **closed test with at least 12 testers
     for 14 days** before the app can go to production.

## 2. Create the app (You)

- App name: **Higoverse**
- Default language: English (United States)
- App or game: **App** · Free or paid: **Free**

## 3. Store listing

**App name** (30): `Higoverse`

**Short description** (80):
`Stock, sales and vehicles for your Higoverse business account, on your phone.`

**Full description**:

```
Higoverse is the mobile companion to higoverse.com, the business software for
shops and car dealers. Sign in with your Higoverse account to see your business
at a glance, wherever you are.

HOME
• Sales for the last 7 days, and revenue for owners
• How many products or vehicles you have, and what needs restocking
• Stock alerts and your most recent sales

STOCK AND VEHICLES
• Search your whole catalogue by name or barcode
• Car dealers see each vehicle's plate, status (available, pending transfer or
  sold) and traffic fines, with filters

SALES
• Today, the last 7 days or the last 30 days, with totals

YOUR ACCOUNT, YOUR RULES
• Owners decide what their staff can see
• Your sign-in is kept in the phone's secure storage; signing out removes your
  account from the phone

Higoverse accounts are created for each business by the Higoverse
administrator. If your business doesn't have one yet, contact us.
```

**Category**: Business · **Tags**: Inventory, Point of sale, Business management
**Contact email**: higoverse@gmail.com
**Website**: https://higoverse.com · **Privacy policy**: https://higoverse.com/privacy

## 4. App content (Policy → App content)

**Privacy policy**: https://higoverse.com/privacy

**App access**: *All or some functionality is restricted* → give Google a
**demo account** (email + password) that can sign in. Use a separate demo
business with sample data, never a real customer's account.

**Ads**: No, the app does not contain ads.

**Content rating** (IARC questionnaire): category *Utility, Productivity,
Communication or Other*; answer **No** to violence, sexual content, profanity,
drugs, gambling; **No** to user-to-user communication/sharing; **No** location
sharing. Expected rating: Everyone.

**Target audience**: 18 and over (business tool, not for children).

**News app**: No · **Government app**: No · **Financial features**: none of the
listed (it records a business's own sales; no payments, loans or trading).

**Data safety**:

| Question | Answer |
|---|---|
| Collects or shares user data? | Collects: **Yes** · Shares: **No** |
| Encrypted in transit? | **Yes** (HTTPS) |
| Users can request deletion? | **Yes** (by email, see privacy policy) |
| Personal info → Name | Collected · App functionality, Account management · Not optional |
| Personal info → Email address | Collected · App functionality, Account management · Not optional |
| Personal info → Phone number, Address, Other info (customer ID numbers) | Collected · App functionality · entered by the business about its customers |
| Financial info → Purchase history | Collected · App functionality (the business's sales records) |
| Photos | Collected · App functionality (vehicle/product photos, shown in the app) |
| Location, contacts, messages, health, audio, files, calendar, web history | **Not collected** |
| App activity, device IDs, diagnostics | **Not collected** |

## 5. Release

1. **Testing → Closed testing** (personal accounts: required first): create a
   track, add at least 12 testers' Google accounts, upload the `.aab`, roll out,
   and keep it running 14 days.
2. **Production → Create new release** → upload the `.aab` → release notes:
   `First release: sign in, home summary, stock/vehicles and sales.`
3. Countries: Rwanda (and any others you serve) → **Review and roll out**.

Google's review usually takes from a few hours to a few days.

## Updating the app later

1. Raise the version in `apps/mobile/pubspec.yaml` (e.g. `1.0.1+2`; the number
   after `+` must go up every upload).
2. `flutter build appbundle --release`
3. Upload the new `.aab` as a new release.
