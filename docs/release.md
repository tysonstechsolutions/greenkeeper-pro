# Release Build — Play Store workflow

This is the ship-an-update loop for the Android app. Run-through takes
~3 minutes once set up.

---

## One-time setup

### 1. Install the Android SDK
Android Studio installs the SDK automatically. If gradle can't find it,
create `android/local.properties` pointing at your SDK:

```properties
sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

(Already done on Tyson's dev machine. Gitignored — each dev regenerates.)

### 2. Generate a signing keystore
Run once. The `.jks` file + its passwords are the ONLY way to push
updates to this app on the Play Store. **Back them up.**

```powershell
node scripts/make-keystore.mjs
```

You'll be prompted for:
- Keystore path (default: `./vmgc-release.jks` — gitignored)
- Key alias (default: `vmgc`)
- Distinguished-name fields (your name, org, city, state, country)
- Keystore password (minimum 6 chars, write it down)
- Key password (can be the same as the keystore password)

The script:
- Runs `keytool -genkey` and drops the `.jks` at the path you chose
- Writes `android/keystore.properties` (gitignored) with the credentials
  the gradle build reads at sign time

**Backup checklist** — store ALL of these somewhere you won't lose:
- [ ] The `.jks` file
- [ ] The keystore password
- [ ] The key password
- [ ] The key alias

Losing any one of them without Play App Signing enabled = you can never
update the app on this package name again.

---

## Every time you want to ship an update

### 1. Bump the version
Every Play Store upload needs a unique, higher `versionCode`.

```powershell
node scripts/bump-version.mjs patch     # 1.0.0 → 1.0.1
node scripts/bump-version.mjs minor     # 1.0.1 → 1.1.0
node scripts/bump-version.mjs major     # 1.1.0 → 2.0.0
node scripts/bump-version.mjs 1.2.3     # exact
```

Commit the change.

### 2. Run the release build
```powershell
node scripts/release-build.mjs --signed
```

This runs:
1. `npm run build` — Next.js static export → `out/`
2. `npx cap sync android` — copy `out/` into the Android project
3. `./gradlew bundleRelease` — R8 minify, resource shrink, sign, package as `.aab`

Output: `android/app/build/outputs/bundle/release/app-release.aab`
(~20 MB, R8 makes it way smaller than the debug APK's 57 MB).

### 3. Upload to Play Console

1. https://play.google.com/console/
2. Pick **VMGC GreenKeeper** → **Production** (or **Internal testing** for a TestFlight-equivalent track)
3. **Create new release** → drag in `app-release.aab`
4. Fill in **Release notes** (what changed since the last version)
5. **Review** → **Start rollout to production**

First time only:
- Pay the $25 Google Play Developer Console registration fee (one-time, per account)
- Create the app listing: icon (512×512), feature graphic (1024×500), screenshots, description, category, content rating questionnaire, privacy policy URL (hosted on Vercel from `main`), data safety form
- Review takes 24-48 hours on the very first submission; updates are usually minutes

---

## Useful variants

- **Unsigned release APK** for quick sanity check:
  ```powershell
  node scripts/release-build.mjs --apk
  ```
  Won't install on a device but verifies R8 doesn't strip anything
  Capacitor needs.

- **Debug APK** to install on a tethered phone:
  ```powershell
  cd android
  ./gradlew assembleDebug
  adb install -r app/build/outputs/apk/debug/app-debug.apk
  ```

- **Bumping only the versionCode** without changing versionName — edit
  `android/app/build.gradle` manually and increment `versionCode`. Useful
  when re-uploading a rejected release under the same user-facing version.

---

## Play Store compliance status (last verified 2026-04-18)

| Requirement | Value | Pass |
|---|---|---|
| Target SDK | 36 | ✓ (min required is 34 as of 2024-08) |
| Min SDK | 24 (Android 7.0) | ✓ (≥ 21 required) |
| 64-bit libraries | Required for all native code | ✓ (AGP 8+ default) |
| App signing | Play App Signing strongly recommended | ✓ (opt in during first upload) |
| Privacy policy URL | Required if declaring any sensitive permission | Pending — host on vmgc.mil or similar |
| Data safety declaration | Required form in Play Console | Pending — answer in console |
| Content rating | Required questionnaire | Pending |

The signing + SDK parts are in order. The three "Pending" items are
filled out in the Play Console itself at first upload — there's nothing
to change in code.

---

## What the gradle release config does

`android/app/build.gradle` release build type:
- `minifyEnabled true` — R8 removes unused code
- `shrinkResources true` — strips unused drawables/strings
- `proguardFiles …proguard-android-optimize.txt, proguard-rules.pro`
  — the rules in `proguard-rules.pro` keep everything Capacitor plugins
  + ML Kit + Firebase reach via reflection
- `signingConfig signingConfigs.release` (applied only when
  `keystore.properties` exists)
- `bundle { language/density/abi { enableSplit = true } }` — the AAB
  ships per-device slices so the effective download is much smaller
  than the .aab file itself
