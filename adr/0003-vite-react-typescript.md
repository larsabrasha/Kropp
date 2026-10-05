# 0003 Vite, React och TypeScript i stället för .NET och Blazor

Status: beslutad, 2026-10-05. Ersätter teknikvalet i 0001. Reglerna för sync i 0001 gäller.

## Bakgrund

Kropp byggdes med Blazor WebAssembly, ASP.NET Core, EF Core och Aspire. Mina andra appar (Bygg,
praliner) bygger på Vite, React och TypeScript med en server i Hono. Det är lättare att ha en
stack. Blazor-klienten laddar dessutom en .NET-runtime på flera MB, och varje ändring i sidorna
kräver ett bygge av hela lösningen.

## Beslut

**Hela stacken byts, som i Bygg.** Ett npm-paket. Appen är Vite, React 19 och TypeScript med
Tailwind v4. Servern är Hono på Node. Docker-imagen bygger båda och kör en enda process.

**Allt som redan finns i telefoner och i databasen är kvar som det var:**

- IndexedDB-databasen `kropp` version 1, med samma stores och samma form på posterna. En
  telefon behåller sin data och sin utkorg genom uppdateringen.
- Service workern heter fortfarande `/service-worker.js`. Telefonerna letar efter uppdateringar
  på den adressen. Med ett annat namn skulle de aldrig lämna den gamla versionen. Den nya
  workern tar över direkt (`skipWaiting`), eftersom den gamla sidan inte kan visa någon fråga.
- Sync-kontraktet: samma vägar, samma fält och samma regler. `data` är fortfarande JSON som
  text, med samma namn på fält och enum-värden som .NET skrev.
- Postgres med samma tabell `SyncDocuments` och sekvens `sync_seq`. Migreringen är skriven så
  att den inte ändrar något i en databas som EF Core skapade. Tabellen `__EFMigrationsHistory`
  blir kvar, men ingen läser den längre.

**Modellen och reglerna finns en gång, i `src/training`.** Servern importerar valideringen
därifrån. Förut fanns modellen i `Kropp.Shared`, som både klient och server använde.

**Tester:** Vitest. Sync-motorns tester körs mot både minneslagret och IndexedDB-lagret
(fake-indexeddb), så att de två inte kan glida isär. Servertesterna körs mot PGlite, och i CI
även mot en riktig Postgres. Sidornas bUnit-tester är portade till Testing Library.

**Språk:** svenska och engelska som förut, nu i `src/i18n/sv.ts` och `en.ts`. Typkontrollen
säger till om en nyckel saknas i något av språken.

## Följder

- Ingen .NET, Aspire eller EF Core längre. `npm run dev` startar allt, med PGlite som databas.
- Tjänsten `migrations` i Docker Compose försvinner. Servern migrerar själv när den startar.
  Den som kör hemma måste hämta den nya `docker-compose.yaml` före första `pull`.
- `Kropp.Import` är borttagen. Importen var en engångsföreteelse och finns i git-historiken.
- Samma typer finns inte längre i två språk. Ändras ett fält i modellen ändras det på ett ställe.
