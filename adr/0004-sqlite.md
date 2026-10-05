# 0004 SQLite i stället för Postgres

Status: föreslagen, 2026-10-05. Ändrar serverns lagring i 0001 och 0003. Reglerna för sync i 0001
gäller, även löpnumren.

## Bakgrund

Servern lagrar bara en tabell: ett dokument per aggregat, med löpnummer för pull. Det finns en
användare, en serverprocess och några tusen rader. Ändå kör Docker Compose tre tjänster: Postgres,
API:t och en backup med `pg_dump`. Det kräver ett lösenord i `.env`, och återställningen kräver ett
handgrepp med `setval` (README). I dev och tester körs PGlite, i CI dessutom en riktig Postgres.
Alltså två motorer att hålla lika.

## Beslut

**SQLite via `node:sqlite`, som finns i Node 24.** Ingen ny dependency. Docker-imagen byggs utan
emulering för arm64 (Dockerfile), och det fungerar bara så länge servern är ren JavaScript. Ett
nativt paket som `better-sqlite3` skulle bryta det. `node:sqlite` skriver en ExperimentalWarning i
Node 24. Gränssnittet mot databasen är litet (`server/db.ts`), och servertesterna körs mot samma
motor som produktionen, så en ändring i API:t syns direkt.

**En fil på en lokal volym.** `KROPP_DB`, till exempel `/data/kropp.db`, på en Docker-volym på
serverns egen disk. Aldrig på en NAS-share: SQLites låsning fungerar inte säkert över SMB eller
NFS. WAL-läge, och `synchronous=FULL`, eftersom skrivningarna är få och det är hälsodata.

**Tabellen** (STRICT):

| Kolumn | Typ | Från Postgres |
| --- | --- | --- |
| `type` | TEXT | `Type` |
| `id` | TEXT, gemener | `Id` (uuid) |
| `modified_at` | INTEGER, ms sedan epoch, UTC | `ModifiedAt`, avrundat nedåt till hela ms |
| `is_deleted` | INTEGER 0/1 | `IsDeleted` |
| `data` | TEXT, JSON | `Data` (jsonb som text) |
| `server_seq` | INTEGER, unik | `ServerSeq`, oförändrat |

Primärnyckeln är (`type`, `id`). Nästa löpnummer ligger i en egen tabell med en rad, inte i
`max(server_seq) + 1`. Då går det att hoppa framåt efter en återställning, som `setval` gör i
dag (se Följder).

**Löpnumren följer med exakt.** Telefonerna har sparat det senaste löpnummer de har hämtat. Om
numren började om lägre skulle de inte hämta något nytt förrän numren hann ikapp.

**Push utan await inuti transaktionen.** `node:sqlite` är synkron, och en process har en
anslutning. Hela push-batchen körs mellan `BEGIN IMMEDIATE` och `COMMIT` utan att lämna ifrån sig
kontrollen. Då kan ingen annan begäran hamna mitt i den. Det ersätter advisory-låsen. Löpnummer
blir synliga i den ordning de delas ut, som 0001 kräver.

**Backup i serverprocessen.** Servern skriver en kopia med `backup()` från `node:sqlite` när den
startar och varje natt kl. 03:00. Kopian hamnar i `KROPP_BACKUP_DIR` och sparas i
`KROPP_BACKUP_KEEP_DAYS` dagar, som i dag. Kopian är en vanlig SQLite-fil. Att återställa är att
stoppa API:t, lägga filen på plats, hoppa framåt i löpnumren och starta igen.

**Bortvalt:**

- Behålla Postgres. Det fungerar, men driften blir mer komplicerad än appen behöver.
- `better-sqlite3`, eftersom det är nativt (se ovan).
- Litestream för backup hela tiden. Det blir en process till, och en nattlig kopia räcker för
  en användare vars telefon också har all data.

## Övergång

Data som redan finns i Postgres flyttas en gång, med ett kommando som bara finns i en version.

**Version A: SQLite och flytten.**

1. Servern kör på SQLite. `server/db.ts`, `sync.ts` och `migrate.ts` skrivs om. Servertesterna
   körs mot SQLite i minnet. PGlite och Postgres-steget i CI behövs bara för testet av flytten.
2. Kommandot `node dist-server/fromPostgres.mjs` läser `SyncDocuments` från Postgres (PGHOST
   med flera) och skriver till `KROPP_DB` i en transaktion:
   - Det vägrar om SQLite-filen redan har rader.
   - Nästa löpnummer blir det högsta av `sync_seq` och `max(ServerSeq)`, plus ett.
   - Efter skrivningen kontrollerar det varje rad: samma typ, id, tid i ms, borttagen och
     löpnummer, och samma JSON när båda sidor tolkats. Det skriver ut antal och högsta löpnummer.
   - Vid minsta avvikelse tas filen bort, och kommandot avslutas med en felkod.
3. Ett test bygger en Postgres-databas i PGlite, som .NET och version 0003 lämnade den. Det kör
   flytten och jämför `pull?since=0` från båda servrarna. De ska vara identiska.
4. `docker-compose.yaml` får volymen för SQLite. Tjänsterna `db` och `backup` och API:ts
   PG-variabler är kvar, men bara för flytten.

**På servern, en gång:**

1. Ta en extra `pg_dump`: `docker compose exec backup sh -c 'pg_dump --format=custom > /backups/fore-sqlite.dump'`.
2. `docker compose stop api`, så att inget skrivs under flytten.
3. Hämta nya `docker-compose.yaml` och `docker compose pull`.
4. `docker compose run --rm api node dist-server/fromPostgres.mjs`. Läs utskriften: antal rader
   och högsta löpnummer ska stämma med Postgres.
5. `docker compose up -d api`. Öppna appen på telefonen. Synkstatusen ska vara OK, och passen ska
   finnas kvar.
6. Låt Postgres-volymen ligga kvar i minst 30 dagar, med tjänsterna stoppade.

**Om det går fel:** Före steg 5 räcker det att starta den gamla imagen igen, eftersom Postgres
inte har ändrats. Efter steg 5 hamnar nya pass bara i SQLite. Den gamla imagen skulle då sakna
dem. Därför ska kontrollen i steg 5 göras direkt. Någon väg tillbaka från SQLite till Postgres
byggs inte.

**Version B, när flytten är gjord:** Ta bort `fromPostgres`, paketen `postgres` och PGlite,
Postgres-steget i CI och tjänsterna `db` och `backup`. Ta bort `POSTGRES_PASSWORD` ur
`.env.example`. Skriv om "Köra hemma" i README.

## Följder

- En container i stället för tre. Inget databaslösenord.
- Samma motor i dev, tester, CI och produktion.
- Tabellen byter namn och form. CLAUDE.md kräver en väg för befintlig data, och det är flytten
  ovan. Kontraktstesterna (`server/contract.test.ts`) får ett nytt första migrationssteg och
  testet av flytten i stället för testet av databasen som .NET skapade.
- Servern kan bara köras i en process mot samma fil. Det gör den redan.
- Öppen fråga, att avgöra i version A: hur löpnumren hoppar framåt efter en återställning. Utan
  hoppet får nya ändringar nummer som telefonerna redan har passerat, och då hämtas de aldrig.
  Ett sätt är ett kommando som ökar räknaren, och som README:s återställning anropar, som
  `setval` i dag. Ett annat är att servern sparar sitt högsta utdelade nummer i en fil bredvid
  databasen och hoppar förbi det vid start, om databasen är äldre. Det andra kan inte glömmas
  bort, men det är en rörlig del till.
