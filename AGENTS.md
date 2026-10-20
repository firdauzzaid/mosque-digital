# Mosque Display

## Purpose

This repository is the source for an offline-first Android TV/STB display for
a mosque. It shows prayer times and announcements, plays configured audio,
and provides an on-device admin panel.

## Chosen stack

- **React + TypeScript + Vite** for the display and admin panel.
- **Capacitor Android** for the APK wrapper.
- Browser storage only: `localStorage` for small settings and IndexedDB for
  media files. Do not add a server, database, authentication provider, or
  state-management dependency without a concrete requirement.
- Use the browser and platform APIs before adding a dependency.

## Working order

1. Read this file before changing the project.
2. Select and read the one Matt Pocock skill that fits the task.
3. Use Ponytail full for any behaviour, timing, storage, permission, shared
   code, bug fix, or refactor.
4. Run `graphify update .` before a non-trivial source or architecture change
   and again after each completed logical change. If Graphify has no source to
   index, record that fact and continue from the source tree.
5. Read only the documentation relevant to the change: `PRODUCT.md` for
   product rules, `docs/TECH-STACK.md` and `docs/ARCHITECTURE.md` for structure
   and Android integration, `DESIGN.md` for UI work.
6. Keep each change within the accepted requirement. Finish required callers,
   persistence, migrations, tests, and documentation before handing off.

## Product rules

- The display must work without internet after configuration. Internet is only
  for explicit downloads such as prayer schedules or remote media.
- Treat the device's configured local time zone as the prayer-time clock. Never
  derive a schedule key with UTC-only date formatting.
- Keep prayer phases in one shared timeline: 15-minute pre-adhan audio,
  adhan, iqamah countdown, then the configured post-iqamah blackout. A phase
  may start once per prayer occurrence and must recover correctly after a page
  reload or delayed timer.
- Pre-adhan audio order is tarhim then murottal, repeating until adhan. Audio
  files or URLs are administrator-configured; no copyrighted audio is bundled.
- "Display off" means an application-level black screen. Physical TV power is
  a separate native/device capability and must not be implied by the display.
- Schedule data must show an explicit unavailable state when it is missing.
  Do not silently use a generic city schedule as production data.
- Preserve existing user configuration when data structures change. Use
  forward-only, non-destructive local-data migrations with safe defaults.
- Store uploaded media in IndexedDB. Backup and restore must state whether
  media is included, and validation must occur before replacing configuration.
- The admin PIN is local access control, not an account system. Do not expose a
  default production PIN in the UI or source once configurable PIN support is
  introduced.

## Scope and data safety

- Do not reset browser storage, recreate local data, remove media, or overwrite
  existing user settings without explicit user instruction.
- A release that updates an installed APK requires the original Android signing
  key. Without it, Android treats this build as a separate application; state
  that before producing a release artifact.
- Keep the source project readable. Feature code belongs in `src/` and media
  assets in `public/`; do not commit generated build output or large media.

## Validation

- Add focused tests for prayer timeline boundaries, one-trigger-per-prayer
  behaviour, local-date schedule lookup, and data migration whenever those
  behaviours change.
- Run the affected test file, the full test suite, TypeScript checking, and a
  production Vite build for source changes.
- For UI changes, run `impeccable context` once per session and its detector
  after editing the surface. Test the admin panel at desktop and TV display
  sizes where the local tooling permits.
- Build and install-check Android only when the Android SDK and signing setup
  are available; report the exact missing requirement otherwise.
