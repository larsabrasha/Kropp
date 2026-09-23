# 0001 Offline först: Blazor WebAssembly-PWA med IndexedDB och sync

Status: beslutad, 2026-09-23

## Bakgrund

Täckningen i gymmet är dålig. Loggningen måste fungera helt utan nät, och appen ska kunna läggas
på hemskärmen på iPhone. GospelPresenter bygger på Blazor Server, som kräver en uppkoppling hela
tiden. Den går inte att använda här.

## Beslut

**Fristående Blazor WebAssembly med PWA-stöd.** All kod körs i telefonen. En service worker
cachar alla filer vid första besöket, så appen startar utan nät. Den nya "Blazor Web App"-mallen
valdes bort: den förrenderar på servern och klarar inte en start utan nät.

**IndexedDB som lokal lagring.** Appen läser och skriver alltid lokalt. SQLite i WebAssembly via
EF Core valdes bort: tyngre att ladda och mindre moget. JS-lagret (`kropp-db.js`) är tunt, och
reglerna för vad som får skriva över vad finns också i `MemoryLocalStore`, som testerna kör mot.

**Sync per aggregat.** Ett pass med alla övningar och set är en enhet. Det blir aldrig halvt
sparat på servern.

- Varje aggregat har ett `Id` (GUID från klienten), `ModifiedAt` (klientens klocka, hela
  millisekunder) och `IsDeleted`. En borttagning blir en tombstone, alltså en markering, så att
  den når alla enheter.
- **Utkorgen** är alla lokala poster med `Pending = true`. En post blir inte `Pending = false`
  förrän servern svarat OK, och bara om den inte ändrats sedan den skickades.
- **Push** (`POST /api/sync/push`): servern sparar hela batchen i en transaktion. Högst
  `ModifiedAt` vinner. Lika eller äldre avvisas, och servern skickar tillbaka sin kopia. Därför
  är en upprepad push ofarlig.
- **Pull** (`GET /api/sync/pull?since=n`): allt med högre löpnummer än `n`. Löpnumret kommer från
  en Postgres-sekvens. Pushar körs en i taget (advisory lock), så löpnummer blir synliga i den
  ordning de delas ut. Annars kunde en pull hoppa över ett nummer som ännu inte var sparat.
- **När:** vid start, vid `online`, vid `visibilitychange`, tre sekunder efter en sparning, och
  var 60:e sekund medan appen är öppen. Bara en runda åt gången. En begäran mitt i en runda ger en
  runda till direkt efteråt.

Servern lagrar varje aggregat som jsonb i en gemensam tabell (`SyncDocuments`). En ny datatyp,
till exempel blodtryck, behöver då ingen migrering. När det behövs frågor över data (grafer,
statistik) kan man bygga en läsmodell från tabellen.

## Följder

- iOS stöder inte Background Sync. En stängd app synkar inte. Nästa gång den öppnas synkar den.
- Safari kan rensa webbdata för sajter som inte används. Hemskärms-appar skyddas bättre, och
  appen ber om beständig lagring (`navigator.storage.persist()`). Servern är backupen.
- Konflikter löses med "senaste vinner" per aggregat. Det räcker för en användare. Om två
  enheter ändrar samma pass offline vinner den senaste ändringen helt.
- Service workers kräver HTTPS, utom på `localhost`.
- När `Kropp.Api` publicerar klienten fylls inte `index.html`-platshållarna i (fingeravtryck,
  import map). Därför är `OverrideHtmlAssetPlaceholders` avstängd, och `index.html` pekar på de
  ofingeravtryckta filerna. Uppdateringar når ändå telefonen, eftersom service workerns
  asset-manifest innehåller hasharna.
