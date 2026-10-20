# Tech stack

The source uses React, TypeScript, and Vite. Capacitor provides the Android
wrapper. Configuration is stored in localStorage and uploaded media in
IndexedDB, so normal display operation needs no server or account.

No external UI library or state-management package is used. This keeps the TV
display small and makes Android builds reproducible with `npm run android:sync`
once the Android SDK is installed.
