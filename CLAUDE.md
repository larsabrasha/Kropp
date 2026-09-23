# Project Rules

Kropp is a personal health log: an offline-first Blazor WebAssembly PWA (`src/Kropp.Client`)
that syncs with an ASP.NET Core API over Postgres (`src/Kropp.Api`). See `adr/` before changing
sync or the data model.

## Health data and secrets
- This repository is public. Never commit health data: no exports, no imports, no database files,
  no real values in tests or fixtures beyond a few illustrative ones.
- Never commit secrets. The Postgres password comes from Aspire's user secrets.

## Offline first
- The client always reads and writes through `LocalRepository` → `ILocalStore` (IndexedDB). Pages
  never call the API directly; the network is only for sync.
- A page must render and save with no network at all. Test that path, not only the online one.
- Anything that must work offline must be in the service worker's cache. New static files under
  `wwwroot` are included automatically; files served from elsewhere are not.

## Sync
- The unit of sync is an aggregate (`Workout`, `Exercise`). Children travel inside their root.
  A new aggregate type is added to `AggregateTypes` and validated in `AggregateValidator`.
- Stamps come from `SyncClock` (UTC, whole milliseconds). Never stamp with `DateTimeOffset.Now`.
- Deleting writes a tombstone through `LocalRepository.DeleteAsync`; nothing is removed outright.
- `kropp-db.js` and `MemoryLocalStore` implement the same rules. Change both, and cover the rule
  with a test in `SyncEngineTests`.
- Aggregate type names are stored in the database. Never rename one.
- The server validates every pushed change. Never rely on the client for it.

## Data model
- Dates of a workout are `DateOnly`, never a timestamp.
- Keep the model close to how training is actually logged; see ADR 0002.

## UI consistency
- UI must support both light and dark mode (`dark:` variants; the app follows the system setting).
- All interactive elements must always be visible. Never hide them behind hover states.
- Layouts must work on a phone first. Use Tailwind's responsive breakpoints, not fixed widths.
- Inputs keep at least 16px text, or iOS zooms in on focus.
- Respect the safe areas (`env(safe-area-inset-*)`) — the app runs full screen from the home screen.
- An icon-only button carries an `aria-label`.

## Empty states
- Every view that can be empty shows an empty state with an SVG icon and a short text.
- Use the three-state pattern: loading (`null` → `L["Common.Loading"]`), empty, content.

## Async behavior
- Buttons that trigger async operations show a loading indicator and prevent double-clicks.
- Saving is local and fast; do not make the user wait for the network.

## Validation and error handling
- Validate input in the UI for fast feedback and on the server for safety.
- Show user-friendly messages when something fails. Never expose stack traces in the UI.

## Language
- All UI text is localized with `IStringLocalizer<SharedResource> L` (injected in `_Imports.razor`).
- Strings live in `src/Kropp.Client/Resources/SharedResource.resx` (English) and
  `SharedResource.sv.resx` (Swedish). Add every new key to both.
- The app follows the browser's language, with English as the fallback.
- Code, comments and identifiers are in English. README and ADRs are in Swedish.

## Verification
- Run `dotnet build src/Kropp.sln` and `dotnet test src/Kropp.sln` before calling anything done.
  The integration tests need Docker.
- The service worker only runs in a published build; see the README for how to test offline start.
