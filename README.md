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
│ Appen (React, src/)          │  POST /api/sync/push│ Servern (Hono, server/)  │
│  ├─ IndexedDB  ← läs/skriv   │ ──────────────────▶ │  ├─ push och pull        │
│  ├─ utkorg (pending-poster)  │  GET  /api/sync/pull│  └─ Postgres (jsonb)     │
│  └─ service worker (cache)   │ ◀────────────────── │  serverar även appen     │
└──────────────────────────────┘                    └──────────────────────────┘
```

- Appen läser och skriver alltid lokalt, i IndexedDB. Nätet används bara för sync.
- Service workern cachar alla filer, så appen startar även helt utan nät.
- Sync körs vid start, när nätet kommer tillbaka, när appen blir synlig, tre sekunder efter en
  sparning och varje minut medan appen är öppen. Se [ADR 0001](adr/0001-offline-forst-pwa.md).
- Datamodellen kommer från den gamla träningsloggen i Numbers. Se [ADR 0002](adr/0002-datamodell-gympass.md).

## Teknik

Samma grund som Bygg: Vite, React och TypeScript i webbläsaren, Tailwind CSS, och en server i
Hono på Node. Allt är ett npm-paket. Data ligger i PostgreSQL. Bytet från .NET och Blazor beskrivs
i [ADR 0003](adr/0003-vite-react-typescript.md).

| Mapp | Vad |
| --- | --- |
| `src/training` | Datamodellen och reglerna: status, planering, papperskorg, validering |
| `src/sync` | Lokala lagret (IndexedDB), utkorgen och sync-motorn |
| `src/i18n` | Texterna på svenska och engelska |
| `src/home`, `src/workout` … | Sidorna, en mapp per område |
| `src/ui` | Gemensamma kontroller: layout, stegare, fält |
| `server` | API:t för sync, migreringen och produktionsservern |
| `public/exercises` | Övningsbilderna |

Servern delar kod med appen: den validerar med `src/training/validate.ts` och använder samma
kontrakt (`src/sync/protocol.ts`).

## Kom igång

Krav: Node 24.

```shell
npm install
npm run dev
```

Appen och API:t startar på <http://localhost:5173>. API:t körs inne i Vite. Databasen är PGlite
(Postgres i WebAssembly) i `./data/pglite`, så Docker behövs inte. Mappen gitignoreras; checka
aldrig in den. Sätt `DATABASE_URL` för att använda en riktig Postgres i stället.

`npm run dev:lan` gör appen nåbar från telefonen i samma nät.

### Tester

```shell
npm run check
```

Det kör formatkontroll, typkontroll, lint och tester. `src/contract.test.ts` och
`server/contract.test.ts` låser det som redan ligger lagrat på telefoner och i databasen.

Servertesterna kör mot PGlite. Med `DATABASE_URL` kör de dessutom mot en riktig Postgres. Den
databasen töms, så peka den aldrig mot en som har data:

```shell
docker run -d --rm --name kropp-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=kropp_test -p 55432:5432 postgres:17
DATABASE_URL=postgres://postgres:test@localhost:55432/kropp_test npm test
```

### Testa offline

Service workern finns bara i produktionsbygget, inte i `npm run dev`. För att testa att appen
*startar* utan nät:

```shell
npm run build
npx vite preview
```

Öppna <http://localhost:4173> en gång, slå av nätet i DevTools och ladda om.

`npm run e2e` gör samma sak automatiskt i Chromium med Playwright. Testet bygger appen och startar
`vite preview` med en tom databas i minnet, så `./data/pglite` rörs inte. Det öppnar appen en gång,
slår av nätet och laddar om, planerar ett pass, laddar om igen och ser att passet finns kvar. Första
gången kan du behöva köra `npx playwright install chromium`.

## Den gamla träningsloggen

Loggen från Numbers importerades en gång med `Kropp.Import`, ett .NET-verktyg. Det finns kvar i
git-historiken, före bytet till TypeScript.

## Köra hemma

GitHub Actions bygger en image när testerna går igenom på `main`:
`ghcr.io/larsabrasha/kropp:latest` och `:sha-<commit>`. En tagg `v1.2.3` ger även `:1.2.3`.
Imagen finns för både amd64 och arm64.

`docker-compose.yaml` startar tre tjänster:

| Tjänst | Vad |
| --- | --- |
| `db` | Postgres 17 med en beständig volym |
| `api` | API:t, som även serverar appen, över vanlig HTTP på port 8080. Uppdaterar databasens schema när den startar. |
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

**Första gången efter bytet från .NET:** hämta den nya `docker-compose.yaml` innan `pull`. Den
gamla har tjänsten `migrations`, som kör .NET. Den nya imagen har ingen .NET, så den tjänsten
misslyckas, och då startar inte API:t. Kör sedan `docker compose up -d --remove-orphans`, så tas
den gamla tjänsten bort. Databasen är densamma; servern använder samma tabell som förut.

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
ligger i `public/exercises/`. De importerade övningarna får en bild efter namn
(`src/illustrations/catalog.ts`); i appen byts den genom att trycka på bilden.

De tre lägena för en övning är ritade i olika stil, så appen visar bara ett: det som syns
tydligast i 48 px (starkast linjer). Valet mättes en gång för alla 906 lägen och står i katalogen.

Telefonen cachar inte katalogen i förväg. Service workern sparar en bild första gången den visas,
och ett pass hämtar sina övningars bilder när det öppnas, så de finns offline.

## Licens

Koden är MIT. Övningsbilderna är CC BY-SA 4.0, se [ATTRIBUTION.md](ATTRIBUTION.md).
