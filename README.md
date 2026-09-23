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

## Köra hemma

GitHub Actions bygger en image när testerna går igenom på `main`:
`ghcr.io/larsabrasha/kropp:latest` och `:sha-<commit>`. En tagg `v1.2.3` ger även `:1.2.3`.
Imagen finns för både amd64 och arm64. Den innehåller API:t och migreringarna, så de kommer
alltid från samma commit.

`docker-compose.yaml` startar fyra tjänster:

| Tjänst | Vad |
| --- | --- |
| `db` | Postgres 17 med en beständig volym |
| `migrations` | Kör migreringarna och avslutar. API:t startar först när den lyckats. |
| `api` | API:t, som även serverar appen, över vanlig HTTP på port 8080 |
| `backup` | En dump av databasen varje natt |

HTTPS kommer från Caddy på routern (OPNsense). På servern behövs `docker-compose.yaml` och en `.env`:

```shell
cp .env.example .env      # fyll i POSTGRES_PASSWORD och KROPP_LISTEN
docker compose up -d
```

Sätt `KROPP_LISTEN` till serverns adress i hemnätet, till exempel `192.168.1.10:8080`. Annars
lyssnar API:t på alla nätkort, även Docker-maskinens Tailscale-adress.

I Caddy läggs en domän till med serverns adress som upstream. Som Caddyfile:

```
kropp.example.se {
    reverse_proxy 192.168.1.10:8080
}
```

Uppdatera med `docker compose pull && docker compose up -d`.

Om paketet på GitHub är privat måste servern logga in först: `docker login ghcr.io` med en token
som har `read:packages`. Paketet innehåller inga data, så det går också bra att göra det publikt.

Tjänsten `backup` tar en `pg_dump` när den startar och sedan varje natt kl. 03:00. Dumparna
hamnar i `KROPP_BACKUP_DIR` (standard `./backups`) och sparas i `KROPP_BACKUP_KEEP_DAYS` dagar
(standard 30). De innehåller hälsodata. Lägg dem helst på en annan disk än databasen, till
exempel en NAS-share som är monterad på servern. Kontrollera att den senaste gick bra:

```shell
docker compose logs backup
```

Återställ en dump. Den ersätter allt som finns i databasen:

```shell
docker compose stop api
docker compose exec -T db pg_restore -U kropp -d kropp --clean --if-exists --no-owner < backups/kropp-2026-09-24-0300.dump
docker compose exec -T db psql -U kropp -d kropp -c "select setval('sync_seq', (select coalesce(max(\"ServerSeq\"), 0) from \"SyncDocuments\") + 1000000);"
docker compose start api
```

Steget med `setval` behövs. Dumpen sätter tillbaka räknaren för `ServerSeq` till dumpens nivå, och
telefonerna hämtar bara nummer över det de redan sett. Utan hoppet får nya ändringar nummer som
telefonerna redan passerat, och de hämtas aldrig. Det som synkats efter dumpen finns kvar bara i
telefonerna och skickas inte till servern igen.

Den gamla träningsloggen importeras mot servern med `--server https://kropp.example.se`.

## På telefonen

Service workers kräver HTTPS, utom på `localhost`. Använd därför Caddys adress. Öppna den i
Safari och välj **Dela → Lägg till på hemskärmen**.

Använd samma adress hemma och på gymmet. Telefonens lagring hör till adressen, så en annan
adress (till exempel serverns IP-nummer hemma) ger en tom app med egen utkorg.

Hemma når telefonen Caddy direkt, utan Tailscale: en host override i OPNsense (Unbound) pekar
namnet på routern. Borta går samma namn via Tailscale: split DNS i Tailscale skickar domänen
till OPNsense, och routern är subnet router för hemnätet. Då är det samma adress på båda vägarna.

Det finns ingen inloggning än. Lägg därför inte API:t öppet mot internet. Porten 8080 når alla
i hemnätet, utan HTTPS och utan inloggning.

## Övningsbilder

Varje övning kan ha en bild. De 302 övningarna × 3 lägen kommer från
[Workout Guide](https://github.com/bryllim/workout-guide) (Bryl Lim, byggd på Everkinetic) och
ligger i `src/Kropp.Client/wwwroot/exercises/`. De importerade övningarna får en bild efter namn
(`ExerciseIllustrations.Catalog.cs`); i appen byts den genom att trycka på bilden.

De tre lägena för en övning är ritade i olika stil, så appen visar bara ett: det som syns
tydligast i 48 px (starkast linjer). Valet mättes en gång för alla 906 lägen och står i katalogen.

Telefonen cachar inte katalogen i förväg. Service workern sparar en bild första gången den visas,
och ett pass hämtar sina övningars bilder när det öppnas, så de finns offline.

## Licens

Koden är MIT. Övningsbilderna är CC BY-SA 4.0, se [ATTRIBUTION.md](ATTRIBUTION.md).
