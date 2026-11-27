# Nova — Android app

Nova is an offline personal assistant (tasks, reminders, habits, notes, focus
timer, voice dictation) with a little animated helper avatar. This repo wraps
the web app with **Capacitor** so it builds into a native Android **APK**.

- **App ID:** `com.raisa.nova`
- **App name:** Nova
- Web app lives in [`www/`](www/); the native Android project is in [`android/`](android/).

---

## 🟢 Easiest way to get the APK: let GitHub build it

This repo ships a GitHub Actions workflow
([`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml)) that
compiles the APK on GitHub's servers — you don't need Android Studio or the SDK
on your own machine.

1. Create a new GitHub repo and push this folder to it (see **Push to GitHub** below).
2. Go to the repo's **Actions** tab. The **Build Android APK** workflow runs
   automatically on every push. (You can also run it manually: Actions →
   Build Android APK → **Run workflow**.)
3. When it finishes (green tick, ~5 min), open the run and download the
   **`nova-debug-apk`** artifact. Inside is **`app-debug.apk`**.
4. Copy the `.apk` to your phone, tap it, allow "install unknown apps", done.

### Push to GitHub
```bash
cd nova-mobile-android
git init
git add .
git commit -m "Nova Android app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```
The build starts on its own. Watch it under the **Actions** tab.

---

## 🛠️ Build it locally instead (Android Studio)

1. Install Android Studio: https://developer.android.com/studio
2. In this folder:
   ```bash
   npm install
   npx cap sync android
   ```
3. Android Studio → **File → Open** → pick the `android` folder → let Gradle sync.
4. **Build → Build Bundle(s) / APK(s) → Build APK(s)** →
   output at `android/app/build/outputs/apk/debug/app-debug.apk`.

Command line only (needs JDK 17 + Android SDK with `ANDROID_HOME` set):
```bash
npm install && npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## 🎙 Voice dictation

Voice now uses the phone's **native speech recogniser** inside the app
(reliable and on-device), via `@capacitor-community/speech-recognition`, and
falls back to the browser's Web Speech API when Nova runs as a PWA in Chrome.

A live dictation sheet shows your words **as you speak**, and lets you **edit
the text before saving** — so a mis-heard word is a quick fix, not a wrong entry.
Languages: English (India/US/UK) and Hindi, switchable in the sheet.

The app requests the microphone permission the first time you use voice. The
required `RECORD_AUDIO` permission and the Android 11+ recogniser query are
already declared in `android/app/src/main/AndroidManifest.xml`.

> If a device has no speech recogniser installed, dictation falls back to the
> normal ＋ quick-add. Most Samsung/Pixel phones have Google's recogniser built in.

---

## After changing the web app

Edit files in `www/`, then re-sync and rebuild:
```bash
npx cap sync android
```

## Notes
- `node_modules/` and build outputs are git-ignored; `npm install` recreates them.
- This builds a **debug** APK (installable directly). For a Play Store upload,
  use Android Studio → **Build → Generate Signed Bundle / APK**.
