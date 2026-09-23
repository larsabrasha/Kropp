# 0002 Datamodell för gympass

Status: beslutad, 2026-09-23

## Bakgrund

Träningsloggen har hittills legat i ett Numbers-dokument: ett blad per vecka, en rad per övning,
med kolumnerna Datum, Övning, Set, Rep, Inst (vikt i kg), Utfört, Kommentar och Träning nr.

Det som syns i datat:

- **Plan och utfall blandas.** Set × Rep × Inst är målet. Vad som faktiskt blev står i
  kommentaren, till exempel "8,8,10" eller "10,10,7 45 grader, avbryter för trött".
- **Utfört** är tom på pass som inte är gjorda än. Veckobladet är en plan som bockas av.
- **Inställningar** står också i kommentaren: "Sitthöjd 11", "45 grader", "Lutning 1:a".
- **Olika sorters övningar:** styrka (rep × kg), kroppsvikt (ingen vikt), tid (plankan: Rep = 60
  sekunder; häng: "35,30,25" sekunder) och kondition (löpband: "20 min i 8:30 min/km zon 2").
- **Samma övning heter olika saker** på olika rader, till exempel "Sit ups" och "Situps".
- **Passnummer** räknas upp för varje pass.
- **Datum** ligger ibland på 23:00 dagen före, ett tidszonsfel.

## Beslut

Två aggregat, båda i `Kropp.Shared/Training`:

- **`Exercise`**: övningsregistret. `Name`, `Kind` (Strength, Bodyweight, Timed, Cardio),
  `SettingsNote` för inställningar som gäller varje gång (till exempel "Sitthöjd 11") och
  `Categories` (en eller flera av ben, bröst, rygg, mage, armar, axlar), `IsArchived`, `Illustration` (bild) och `WeightStepKg` (hur mycket − och + ändrar vikten,
  standard 2,5 kg). `MeasuresTimeOnly` för kondition som bara loggas i tid, som gång i maskin;
  då visas varken avstånd eller puls. Ett pass pekar på en övning via id, så ett namnbyte skriver inte om gamla pass.
- **`Workout`**: ett pass. `Date` är `DateOnly`, så en tidszon aldrig kan flytta passet en dag.
  `SessionNumber`, `Status` (Planned, InProgress, Done), `Note` och en ordnad lista `WorkoutExercise`.
  Status väljs inte, den räknas fram (`WorkoutEditing.StatusOf`): inget loggat ger Planned, även
  när dagen har passerat; något loggat ger InProgress ("Påbörjat") tills varje övning är klar
  eller överhoppad, och då Done. När dagen har passerat ger något loggat alltid Done: passet är
  över, även om inte varje planerat set loggades. Så ser det mesta ut som importerades från
  Numbers. Den sparas ändå, så att listan och servern kan läsa den utan att
  räkna om. Skipped ("Inte gjort") räknas inte fram längre sedan 2026-09-23, men finns kvar i
  enumen så att pass som sparats med den går att läsa.
  - mål: `TargetSets`, `TargetReps`, `TargetWeightKg`, `TargetSeconds`
  - utfall: en `SetResult` per set (`Reps`, `WeightKg`, `Seconds`). Det ersätter "8,8,10" i
    kommentaren.
  - kondition: mål `TargetDurationMinutes`, `TargetDistanceKm`; utfall `DurationMinutes`,
    `DistanceKm`, `AvgHeartRate`. Målen kom till 2026-09-23. Mallar från före dess har minuterna i
    `DurationMinutes`, och de läses som mål (`WorkoutEditing.CardioTargetMinutes`).
  - `Comment` och `Settings` för det som gäller just det tillfället
  - `IsSkipped` när övningen avslutas innan planen är gjord, med färre set eller inga. Målen står
    kvar, så nästa pass planeras som förut.

Passet har inget eget namn. Det namnges efter övningarnas kategorier, flest övningar först,
utan konditionsövningar (`WorkoutEditing.AreasOf`) och med högst tre områden: "Ben, rygg och mage",
eller "Kondition". Vid lika antal gäller ordningen ben, bröst, rygg, mage, armar, axlar.

Vikt och blodtryck blir senare ett eget aggregat, `Measurement`.

## Följder

- Importen från Numbers måste slå ihop övningsnamn med en mappningstabell och tolka kommentarer
  som "8,8,10" till set. Originalkommentaren sparas alltid.
- Idéer som datat pekar på: "kopiera förra passet som plan", visa "förra gången: 3×8 @ 60 kg"
  vid varje övning, bocka av set för set.

## Tillägg: mallar och nästa pass (2026-09-23)

- **`WorkoutTemplate`** är ett eget aggregat: ett namn och en ordnad lista övningar med mål, aldrig
  några set. Det skapas med "Ny mall" under Inställningar → Mallar och synkas som övriga aggregat.
- Ett pass som planeras från en mall får `Workout.TemplateId`. Varje övning börjar från förra
  gången (`WorkoutEditing.LastTime`), och mallens mål gäller bara övningar som aldrig gjorts.
- **Nästa mall** är den som gjordes längst sedan. Ett pass räknas till en mall om det planerades
  från den, eller för äldre pass om minst hälften av övningarna är desamma, räknat utan kondition.
- **Nästa dag** är två dagar efter senaste passet, men tidigast i dag. Har veckan (måndag–söndag)
  redan tre gjorda pass blir det måndagen efter. Tre pass i veckan är fast i koden (`Planning`).
- Finns redan ett planerat pass från i dag och framåt, visas det i stället för ett förslag.

## Tillägg: papperskorg (2026-09-23)

- "Ta bort passet" flyttar passet till papperskorgen. Där ligger det i 30 dagar och går att
  återställa. Sedan raderas det för gott.
- **`TrashedWorkout`** är ett eget aggregat (`trashedWorkout`) med samma id som passet, hela
  passet och `DeletedAt`. Att flytta dit sparar det och lägger en tombstone på passet. Att
  återställa gör tvärtom. Ett fält `DeletedAt` på `Workout` valdes bort: då skulle varje vy och
  planeringen behöva filtrera, och en äldre app som inte känner fältet skulle visa passet igen.
- **Radera för gott** är en tombstone på `TrashedWorkout`. Servern skriver då över datat med
  null, så inga träningsdata finns kvar någonstans, bara id och tid. Raden tas inte bort helt,
  eftersom en enhet som varit offline annars aldrig får veta att passet är borta.
- Rensningen görs av klienten (`WorkoutTrash.PurgeAsync`) när appen startar och när
  papperskorgen öppnas, inte av servern. En enhet som aldrig öppnas rensar alltså inte, men
  nästa enhet som öppnas gör det för alla. Har passet ändrats på en annan enhet efter att det
  lades i papperskorgen, vinner ändringen och kopian i papperskorgen tas bort.
