# Technician mobile SDK 57 migration

Status: development implementation; device acceptance pending. Production NO-GO;
external gateway G1 remains OPEN.

## Changes

- Expo 57, React 19.2.3 and React Native 0.86.3, with SDK-matched camera,
  foreground location, SQLite and file-system dependencies. A committed lockfile
  supports `npm ci`; dependency conflicts were resolved without force/legacy-peer flags.
- `index.ts` registers the application root. CameraView replaces the old Camera
  component; permissions are requested before showing the camera. File metadata
  currently uses the supported `expo-file-system/legacy` compatibility API.
- Removed unused axios, MMKV, media-library and WebView dependencies.
- Camera plugin disables audio recording permission; location configuration permits
  foreground use and blocks Android background location. No gallery capture path added.
- Replaced the unused destructive offline stub with initialized SQLite v2 storage,
  owner-scoped records, parameterized SQL, serialized replay and explicit confirmation
  before deletion. Failures/unknown acknowledgments retain records and stop replay.
  This foundation is not wired to automatic App.tsx replay. Any future sender must
  reconcile current work-order state and use a current authenticated session; a
  response-loss retry requires server idempotency. Legacy unowned queue rows are
  not automatically migrated or replayed.
- Signature placeholder requests now require authenticated API calls, reject HTTP
  errors and demand server confirmation. The screen still lacks a drawing pad and
  is not integrated into the main app. It does not replace signed hard-copy beta
  work orders and does not complete a work order.

## Verified local checks

Node 24: TypeScript, authenticated signature API rejection/verification, account-isolated offline queue behavior, Expo SDK dependency
compatibility and Android Hermes JavaScript export. Backend security regression
suite passed after the mobile changes. Export is not an APK, native build, emulator
run or physical-device camera/GPS test.

Production dependency audit after upgrade: **22 findings: 7 moderate, 15 high,
0 critical**. The previous reviewed CI inventory had 57 findings, including one
critical. Current residual root findings include braces, node-forge and uuid in
build/tooling dependency chains. Their runtime/exposure disposition needs review;
they are not accepted merely because CI passes. Do not use `npm audit fix --force`
to downgrade Expo or hide findings.

CI now runs clean lockfile installation, TypeScript, offline queue behavior,
SDK dependency compatibility, Android bundle export and a blocking critical audit.
High/moderate findings remain reported; beta approval remains blocked pending
remediation or an explicit reviewed disposition.

## Reproduce

```bash
cd mobile
npm ci --no-fund
npm run typecheck
npm run test:offline-queue
npm run test:api
EXPO_OFFLINE=1 npx expo install --check
CI=1 EXPO_OFFLINE=1 npm run export:android
npm audit --omit=dev --audit-level=critical
```

Offline mode uses Expo's installed SDK compatibility map and permits npm fetching;
it avoids unavailable Expo API calls in this development environment. It does not
suppress dependency auditing or validation.

## Required acceptance

- Build fresh native development clients for SDK 57. Old SDK 50 clients are incompatible.
- On physical supported Android/iOS devices: login/logout, camera permission denial
  and grant, camera-only capture, private evidence upload, location permission,
  foreground GPS, work-order synchronization and interrupted operations.
- Confirm generated native permissions, TLS behavior and production API URLs.
- Wire offline replay only after idempotency and session-change races are validated.
- Remediate or explicitly review residual high findings before beta approval.

References: https://expo.dev/changelog/sdk-57 and
https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/.
