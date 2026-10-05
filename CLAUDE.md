# Project Rules

Kropp is a personal health log: an offline-first PWA in Vite, React and TypeScript (`src/`) that
syncs with a Hono server on Node over Postgres (`server/`). One npm package, the same stack and
conventions as ~/Developer/bygg. See `adr/` before changing sync or the data model.

Before 2026-10-05 it was .NET and Blazor (ADR 0003). Installed phones and the database still hold
what that version wrote: never change the IndexedDB schema (`src/sync/indexedDbStore.ts`), the
service worker's name (`service-worker.js`), the sync contract (`src/sync/protocol.ts`), the JSON
of the aggregates (`src/training/model.ts`) or the table, without a way for existing data to follow.
`src/contract.test.ts` and `server/contract.test.ts` pin all of these. When one fails, change the
code back, not the test.

## Health data and secrets
- This repository is public. Never commit health data: no exports, no imports, no database files,
  no real values in tests or fixtures beyond a few illustrative ones.
- Never commit secrets. The Postgres password lives in `.env` on the server, never in the repo.
- Never commit `./data/` (the dev database, PGlite).

## Offline first
- The app always reads and writes through `LocalRepository` → `LocalStore` (IndexedDB). Pages
  never call the API directly; the network is only for sync.
- A page must render and save with no network at all. Test that path, not only the online one.
- Anything that must work offline must be in the service worker's cache. Built files and files in
  `public/` are precached automatically (`vite.config.ts`), except `public/exercises/`, which is
  cached as it is used; files served from elsewhere are not.

## Sync
- The unit of sync is an aggregate (`Workout`, `Exercise`). Children travel inside their root.
  A new aggregate type is added to `AggregateTypes` (`src/sync/protocol.ts`) and validated in
  `src/training/validate.ts`. A new type or field also goes into `src/contract.test.ts`, which
  fails until the server checks every field.
- Stamps come from `src/sync/clock.ts` (UTC, whole milliseconds). Never stamp with anything else.
- Deleting writes a tombstone through `LocalRepository.delete`; nothing is removed outright.
- `IndexedDbStore` and `MemoryStore` implement the same rules (shared in `localStore.ts`). Cover a
  rule with a test in `src/sync/engine.test.ts`, which runs against both.
- Aggregate type names are stored in the database. Never rename one.
- The server validates every pushed change. Never rely on the client for it.

## Data model
- Dates of a workout are `DateOnly` (`yyyy-MM-dd` strings, see `src/training/dates.ts`), never a timestamp.
- Keep the model close to how training is actually logged; see ADR 0002.

## UI consistency
- UI must support both light and dark mode (`dark:` variants; the app follows the system setting).
- Pages are grouped by area (`src/home`, `src/workout`…), shared controls in `src/ui`. Links use
  `Link` and `navigate` from `src/route.ts`.
- Inputs save on the DOM's change event (`src/ui/useCommit.ts`), not on every key.
- All interactive elements must always be visible. Never hide them behind hover states.
- Layouts must work on a phone first. Use Tailwind's responsive breakpoints, not fixed widths.
- Inputs keep at least 16px text, or iOS zooms in on focus.
- Respect the safe areas (`env(safe-area-inset-*)`) — the app runs full screen from the home screen.
- An icon-only button carries an `aria-label`.

## Empty states
- Every view that can be empty shows an empty state with an SVG icon and a short text.
- Use the three-state pattern: loading (`null` → `t('Common.Loading')`), empty, content.

## Async behavior
- Buttons that trigger async operations show a loading indicator and prevent double-clicks.
- Saving is local and fast; do not make the user wait for the network.

## Validation and error handling
- Validate input in the UI for fast feedback and on the server for safety.
- Show user-friendly messages when something fails. Never expose stack traces in the UI.

## Language
- All UI text is localized with `t()` from `src/i18n/i18n.ts`. Dates and numbers go through its
  `formatDate` and `formatNumber`.
- Strings live in `src/i18n/en.ts` (English) and `src/i18n/sv.ts` (Swedish). Add every new key to
  both; the type checker refuses a key missing in sv.ts.
- The app follows the browser's language, with English as the fallback.
- Code, comments and identifiers are in English. README and ADRs are in Swedish.

## Verification
- Run `npm run check` (format, types, lint, tests; about 15 s) before calling anything done. A
  Stop hook (`.claude/hooks/check.sh`) runs it when a turn changed files.
- ESLint enforces some of these rules: no network outside `src/sync` (and the illustrations'
  prefetch), no `toISOString` outside `clock.ts` and `dates.ts`, and no promise left unawaited.
- Component tests use Testing Library in happy-dom (`src/test/render.tsx`; the workout page's tests
  share `src/test/workoutPage.ts`); the server tests run on PGlite, and also on real Postgres when
  `DATABASE_URL` is set (as in CI).
- The service worker only runs in a production build (`npm run build && npx vite preview`).
  `npm run e2e` (Playwright, Chromium) builds it and proves the app starts, saves and reloads
  offline. Run it after changing the service worker, `vite.config.ts` or how the home page plans a
  workout. It is not part of `npm run check`, which stays fast.
