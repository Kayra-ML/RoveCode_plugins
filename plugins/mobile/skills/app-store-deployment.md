# App Store Deployment

## EAS Build Setup

Expo Application Services (EAS) Build is the standard way to build React Native apps in CI
without managing Xcode or Android Studio locally:

```bash
npm install -g eas-cli
eas login
eas build:configure  # generates eas.json
```

A typical `eas.json` with three build profiles:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "autoIncrement": true,
      "channel": "production",
      "ios": { "resourceClass": "m-medium" },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "you@example.com", "ascAppId": "1234567890" },
      "android": { "serviceAccountKeyPath": "./google-service-account.json", "track": "internal" }
    }
  }
}
```

Run builds: `eas build --platform all --profile production`

## iOS Certificates and Provisioning Profiles

iOS requires two code signing artifacts:

**Distribution Certificate** — a cryptographic identity that proves the build came from your
Apple Developer account. One certificate per team, shared across apps.

**Provisioning Profile** — ties the app bundle ID, certificate, and distribution method
together. A profile for App Store distribution is different from one for TestFlight.

EAS Build manages these automatically with `"credentialsSource": "remote"`:
- EAS generates and stores certificates in its vault
- Provisioning profiles are created and renewed automatically
- No local Keychain management required

For manual management (larger teams with existing certificates):
```bash
eas credentials  # interactive credential management
```

## Android Keystore Management

The Android keystore signs your APK/AAB. **Losing the keystore means you can never update
your app on the Play Store** — you would have to publish a new app with a new package name.

```bash
# EAS manages the keystore automatically (recommended)
eas build --platform android --profile production
# EAS stores an encrypted backup in its vault

# Generate manually (if self-managing)
keytool -genkey -v -keystore my-upload-key.jks \
  -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000

# Store securely — at minimum: encrypted cloud backup + password manager
```

Back up the keystore to multiple secure locations immediately after generation. Encrypt it
before storing anywhere. Never commit it to source control.

## App Signing for Play Store

Google Play supports two signing models:

**Play App Signing (recommended):** Google manages the final signing key. You upload a release
signed with your upload key; Google re-signs it with the app signing key before delivery.
If you lose your upload key, Google can reset it. Enable this for all new apps.

**Self-managed:** you control the final signing key. Losing it means the app cannot be updated.

Enable Play App Signing in Play Console → Setup → App integrity → App signing.

## Version Code vs Version Name

Both fields must be set correctly for every release:

```json
// app.json
{
  "expo": {
    "version": "2.4.1",          // version name — shown to users (semver)
    "ios": {
      "buildNumber": "42"        // build number — must increment each TestFlight/App Store upload
    },
    "android": {
      "versionCode": 42          // version code — integer, must increment each Play Store upload
    }
  }
}
```

EAS `"autoIncrement": true` in `eas.json` handles automatic version code/build number
increments. Never reuse a build number for the same version — Apple rejects it.

## OTA Updates with EAS Update

EAS Update deploys JavaScript and asset changes without a new app store submission:

```bash
# Deploy to production channel
eas update --channel production --message "Fix checkout bug"

# Deploy to staging for QA
eas update --channel preview --message "New feature test"
```

Limitations of OTA updates (cannot OTA):
- Native module changes (new npm packages that include native code)
- Changes to `app.json` configuration
- New app permissions
- Xcode / Android Studio project changes

OTA updates are suitable for bug fixes, UI text changes, and pure JS logic changes.

## App Store Review Guidelines Pitfalls

Common reasons for rejection:

- **Guideline 4.2 (Minimum Functionality):** apps that are "too simple" — must provide
  meaningful functionality beyond a website wrapper
- **Guideline 2.1 (App Completeness):** demo content, placeholder text, or broken features
- **Guideline 5.1.1 (Privacy):** collecting data without declaring it in the privacy manifest
- **Guideline 3.1.1 (In-App Purchase):** selling digital goods outside IAP (Apple takes 15-30%)
- **Guideline 4.0 (Design):** non-standard navigation patterns, covering UI with modals

Submit a complete Privacy Nutrition Label in App Store Connect. Starting with iOS 17, apps
must include a PrivacyInfo.xcprivacy manifest declaring API usage.

## Screenshot Requirements

App Store Connect requires screenshots for all supported device sizes:

- iPhone 6.9" (iPhone 16 Pro Max) — required
- iPhone 6.7" (iPhone 14 Plus) — required
- iPad Pro 13" — required if supporting iPad

Use Fastlane's `snapshot` tool to automate screenshot generation across all required sizes.
Screenshots should show real app content, not marketing graphics. Feature screenshots with
actual UI perform better in search.

## TestFlight vs Internal Testing

**Internal Testing:** up to 100 Apple Developer team members. No review required. Available
within minutes of upload.

**External Testing (TestFlight):** up to 10,000 external testers. Requires Apple review
(usually 24–48 hours for first build, faster for subsequent builds). Testers receive an
email invitation.

Use internal testing for development team QA. Use external testing for beta users and
stakeholder acceptance testing before App Store release.

## Staged Rollout on Play Store

Play Store supports gradual rollouts that limit who receives an update:

```
Play Console → Release → Production → Create new release
→ Set rollout percentage: 10%
→ Monitor crash rate and ANRs
→ Increase to 50%, then 100%
→ Or halt rollout if metrics degrade
```

Start new releases at 10–20% rollout. Monitor Crashlytics and Play Console's Android Vitals
for 24–48 hours before increasing. A staged rollout lets you catch crashes before all users
are affected.

## Release Notes Best Practices

Effective release notes:
- Written for users, not engineers: "Fixed a crash when opening photos" not "Null pointer exception resolved in ImageLoader"
- Highlight new features users asked for: "You requested it — dark mode is here"
- Keep it brief: 2–4 bullet points maximum
- Localize if your app is translated

App Store Connect allows different release notes per language. Use the same copy in both
the App Store and Google Play for consistency.