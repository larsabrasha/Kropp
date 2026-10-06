# 0004 Export och import

Status: beslutad, 2026-10-06

## Bakgrund

Användaren ska kunna ta ut all sin data som en fil och läsa in den igen: som backup, för att
flytta till en annan server eller för att få tillbaka något. En fil lever längre än appen som
skrev den. En export från i dag ska gå att importera om flera år, när modellen har växt.

## Beslut

**Filen är JSON med ett kuvert och en lista poster** (`src/sync/backup.ts`):

```json
{
  "format": "kropp",
  "version": 1,
  "exportedAt": "2026-10-06T12:00:00.000Z",
  "records": [
    { "type": "workout", "id": "…", "modifiedAt": "2026-09-22T18:30:00.123Z", "data": { … } }
  ]
}
```

- `data` är aggregatet i samma JSON som i databasen och i IndexedDB, men som objekt i stället
  för text. Det gör att filen följer samma regler som de lagrade aggregaten, som redan är låsta
  i `src/contract.test.ts`.
- `modifiedAt` följer med. Utan den går det inte att avgöra om filen eller enheten har den nyare
  versionen.
- Raderade aggregat kommer inte med. En import raderar aldrig något.

**Versionen räknas fram ur migreringarna.** `MIGRATIONS` är en lista med ett steg per version.
Steg 0 lyfter en fil från version 1 till 2, och så vidare. `BACKUP_VERSION` är antalet steg plus
ett. Därför kan versionen inte höjas utan ett steg, och ett steg kan vara att bara skicka filen
vidare. Vid import körs stegen från filens version upp till den aktuella. Sedan valideras varje
post med samma kontroll som servern gör vid push. En enda felaktig post stoppar hela filen, så
en import blir aldrig halvgjord.

**När versionen höjs:**

- När en ny aggregattyp läggs till. En äldre app avvisar då hela filen och ber om en uppdatering,
  i stället för att avvisa de okända posterna. Kontraktstestet håller en lista över typerna per
  version och slår larm när typerna inte stämmer.
- När kuvertet ändras, eller när ett fält byter form eller betydelse så att äldre filer måste
  skrivas om.

**Ingen ny version behövs** för ett nytt valfritt fält i ett aggregat. Läsarna i `model.ts`
fyller i standardvärden för fält som saknas och behåller fält de inte känner till. Det gäller
redan för det som ligger lagrat.

**Varje version ligger kvar som en fil i kontraktstestet.** Den måste importeras till samma
aggregat för all framtid. En ny version lägger till sin fil och ändrar aldrig en gammal.

**En fil från en nyare version avvisas** med en uppmaning att uppdatera appen.

## Förhandsgranskning och krockar

Både export och import visar först vad de gör, i ett sheet.

- **Export** visar antal pass (med första och sista datum), övningar, mallar och nyligen
  raderade, filnamnet och hur många ändringar som inte är synkade än. Filen byggs när sheetet
  öppnas, så att delningsmenyn öppnas direkt vid trycket. Det kräver Safari.
- **Import** synkar först, om det går, så att jämförelsen gäller det som servern har. Sedan
  visar den tre tal: *läggs till* (finns inte i appen), *uppdateras* (nyare i filen) och
  *behålls* (likadant, nyare i appen eller raderat i appen).

**En import följer samma regel som sync och frågar ingenting: den nyaste versionen vinner.**
Varje post från filen sparas med stämpeln den hade i filen, och bara om appens kopia är äldre.
Servern avgör sedan som för en enhet som har varit offline länge. En import kan därför aldrig
skriva över en senare ändring, inte heller en på servern som appen inte har hämtat än, och den
kan aldrig väcka liv i något som har raderats. Det som har raderats finns i papperskorgen i 30
dagar.

Val per krock prövades och valdes bort (2026-10-06). De krävde en vy som visar hur versionerna
skiljer sig för att vara begripliga, och de löste ett problem som sällan uppstår. Den som vill
gå tillbaka till en äldre version får i så fall en egen funktion, "Återställ från fil", som visar
exakt vad som skrivs över. Den hör inte hemma i varje import.

En stämpel i framtiden sätts till nu (`restoredStamp`). Annars skulle den vinna över varje
ändring fram till dess.

## Radera all data (2026-10-06)

"Radera all data" i Profil lägger en tombstone på varje aggregat utom inställningarna. Raderingen
når servern och varje enhet som synkar, och servern skriver över datat med null som vid annan
radering. Den nattliga backupen av databasen har kvar det som fanns före raderingen.

Det frågar två gånger, så som iOS gör innan en telefon raderas. Ett sheet visar först vad som
raderas, att det gäller överallt och att det inte går att ångra. Där finns också "Exportera
först". Den röda knappen ställer sedan en sista fråga längst ner på skärmen.

**Inställningarna får `resetAt`**, tiden för raderingen, ett nytt valfritt fält i `UserSettings`.
Utan det skulle en import direkt efter raderingen inte ge tillbaka något, eftersom varje tombstone
är nyare än filen. Därför räknar en import en post vars tombstone är från raderingen eller äldre
(`modifiedAt <= resetAt`) som saknad. Den importeras med en ny stämpel, så att den vinner över
tombstone både här och på servern. Det som raderas efter raderingen är fortfarande raderat för
en import. Efter en radering blir alltså filen utgångspunkten.

## Följder

- Det här är ingen import från andra appar. En sådan blir en egen omvandling till det här
  formatet.
- En äldre app kan inte läsa en fil från en nyare version, inte ens de delar den känner till.
  Appen uppdaterar sig själv via service workern, så det bör sällan hända.
- Exportfiler innehåller hälsodata. `kropp-*.json` gitignoreras.
