# Architecture

`src/timeline.ts` is the single source of truth for prayer phases. It accepts a
local date, a schedule, and timing settings, then returns the current phase.
The display derives its overlays and audio from that result rather than
starting independent timers.

`src/storage.ts` owns local persistence and performs a non-destructive import
from the legacy `mosqueData` record when the new configuration is absent.

`src/App.tsx` owns the display/admin switch. Components are kept in the same
file until a second consumer makes a separate module useful.
