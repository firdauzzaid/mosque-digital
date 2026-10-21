# Mosque Display

Offline-first display information for a mosque TV or Android STB.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

## Continue on another device

Clone the repository, then restore dependencies from the committed lockfile:

```powershell
git clone <repository-url>
Set-Location mosque-display
npm.cmd ci
npm.cmd run dev
```

For Android work, install JDK 21 and Android Studio on that device, accept the
Android SDK licences yourself, then run `npm.cmd run android:sync`. The
`android/` folder is source code and is committed; SDK paths, Gradle output,
APK files, and signing keys stay local and are recreated per device.

Display settings and uploaded media are deliberately stored on the display
device (browser storage and IndexedDB), not in Git. Export a backup from the
admin panel before moving to another device; upload its media again after
restoring the settings.

## Validate and build web assets

```powershell
npm.cmd run test
npm.cmd run build
```

## Build Android APK

Install JDK 21 and set `JAVA_HOME`, then install Android Studio with its SDK.
The native project is already in `android/`.

```powershell
npm.cmd run android:sync
Set-Location android
.\gradlew.bat assembleDebug
```

The unsigned development APK will be at
`android\app\build\outputs\apk\debug\app-debug.apk`. Updating an already
installed app requires its original Android signing key; otherwise Android
treats this build as a different app.

The Android wrapper requests launch after boot, but Android TV/STB vendors can
block background launches. Enable the device's auto-start permission for this
app, or use the device's kiosk/launcher mode, before relying on it after a
power outage.

## Offline behaviour

Configuration is saved in browser storage and uploaded media in IndexedDB.
Backup text includes configuration and schedules but deliberately excludes
large uploaded media. The display uses the device's local time zone.
