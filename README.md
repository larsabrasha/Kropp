# Kropp

En personlig hälsologg. Först träningspass, senare vikt, blodtryck och annat.

Appen är en webbapp som fungerar utan nät och kan läggas på hemskärmen på iPhone.
Den sparar allt i telefonen först och synkar med servern när det finns nät.

> **Inga hälsodata i det här repot.** Repot är publikt. Data ligger bara i databasen och i
> webbläsarens lagring. Exportfiler, Numbers-dokument och databasfiler gitignoreras.

## Hur det hänger ihop

```
iPhone (Safari, hemskärmen)                          Server
┌──────────────────────────────┐                    ┌──────────────────────────┐
│ Kropp.Client (Blazor WASM)   │  POST /api/sync/push│ Kropp.Api                │
│  ├─ IndexedDB  ← läs/skriv   │ ──────────────────▶ │  ├─ SyncService          │
│  ├─ utkorg (pending-poster)  │  GET  /api/sync/pull│  └─ Postgres (jsonb)     │
│  └─ service worker (cache)   │ ◀────────────────── │  serverar även klienten  │
└──────────────────────────────┘                    └──────────────────────────┘
```

- Appen läser och skriver alltid lokalt, i IndexedDB. Nätet används bara för sync.
- Service workern cachar alla filer, så appen startar även helt utan nät.
- Sync körs vid start, när nätet kommer tillbaka, när appen blir synlig, tre sekunder efter en
  sparning och varje minut medan appen är öppen. Se [ADR 0001](adr/0001-offline-forst-pwa.md).
- Datamodellen kommer från den gamla träningsloggen i Numbers. Se [ADR 0002](adr/0002-datamodell-gympass.md).

## Teknik

Samma grund som [GospelPresenter](https://github.com/larsabrasha/GospelPresenter):
.NET 10, Blazor, Tailwind CSS, PostgreSQL och .NET Aspire. Skillnaden är att klienten är en
fristående Blazor WebAssembly-PWA i stället för Blazor Server, eftersom den måste fungera offline.

| Projekt | Vad |
| --- | --- |
| `Kropp.Client` | Blazor WebAssembly-PWA: sidor, IndexedDB-lager, sync-schemaläggare |
| `Kropp.Shared` | Datamodell, sync-kontrakt och sync-motorn. Ingen webbläsare, ingen databas. |
| `Kropp.Api` | Minimal API för sync, serverar klienten |
| `Kropp.Data` | EF Core-kontext och migreringar |
| `Kropp.MigrationService` | Kör migreringarna och avslutar |
| `Kropp.AppHost` | Aspire: Postgres, pgweb, migreringar, API |
| `Kropp.Import` | Engångsimport av den gamla träningsloggen från Numbers (CSV) |
| `Kropp.UnitTests` | Sync-motorn, validering, sidor (bUnit) |
| `Kropp.IntegrationTests` | API:t mot riktig Postgres (Testcontainers) |

## Kom igång

Krav: .NET 10 SDK och Docker.

```shell
cd src
dotnet run --project Kropp.AppHost
```

Aspire startar Postgres med en beständig volym, kör migreringarna och startar API:t på
<http://localhost:5260>. Aspire-dashboarden öppnas av sig själv. pgweb ligger på
<http://localhost:5051>. Postgres-lösenordet genereras av Aspire första gången och sparas i
AppHost-projektets user secrets, aldrig i repot.

Tailwind byggs vid varje `dotnet build`. För snabb omladdning av CSS:

```shell
./src/Kropp.Client/tailwind-watch.sh
```

### Tester

```shell
cd src
dotnet test
```

Integrationstesterna startar en Postgres-container, så Docker måste vara igång.

### Testa offline

Service workern är bara aktiv i en publicerad build (`service-worker.published.js`). I utvecklingsläget
cachar den ingenting, så där testar man offline genom att stänga av nätet i DevTools efter att sidan
laddats. För att testa att appen *startar* utan nät:

```shell
cd src
dotnet publish Kropp.Api -c Release -o ../publish
cd ../publish
ConnectionStrings__kroppdb="Host=localhost;Database=kropp;Username=postgres;Password=..." ./Kropp.Api
```

Öppna sidan en gång, slå av nätet och ladda om.

## Importera den gamla träningsloggen

`Kropp.Import` läser en CSV-export av Numbers-dokumentet och skickar passen via samma sync-API
som appen. Exportera till en mapp utanför repot (Numbers → Arkiv → Exportera till → CSV) och kör:

```shell
cd src
dotnet run --project Kropp.Import -- ~/Downloads/kropp/csv            # torrkörning, skickar inget
dotnet run --project Kropp.Import -- ~/Downloads/kropp/csv --push     # skickar till localhost:5260
```

Torrkörningen visar vad som importeras, vilka datum som slås ihop och vilka kommentarer som inte
kunde tolkas. Id:n räknas fram ur övningsnamn och datum, och allt stämplas 2020-01-01. En andra
körning ändrar därför ingenting, och den skriver aldrig över det du ändrat i appen. `--overwrite`
stämplar med nuvarande tid, för när själva importen var fel. `--server URL` pekar ut en annan server.

Reglerna för hur kolumner och kommentarer tolkas finns i `ExerciseCatalog` och `CommentParser`,
och testerna i `NumbersImportTests` visar dem med påhittade rader.

## På telefonen

Service workers kräver HTTPS, utom på `localhost`. För att köra på iPhone behövs alltså en
HTTPS-adress, till exempel `tailscale serve` på en dator hemma. Öppna adressen i Safari och välj
**Dela → Lägg till på hemskärmen**.

Det finns ingen inloggning än. Lägg därför inte API:t öppet mot internet.

## Licens

MIT
