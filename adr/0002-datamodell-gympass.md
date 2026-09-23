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
  `IsArchived`. Ett pass pekar på en övning via id, så ett namnbyte skriver inte om gamla pass.
- **`Workout`**: ett pass. `Date` är `DateOnly`, så en tidszon aldrig kan flytta passet en dag.
  `SessionNumber`, `Status` (Planned, Done, Skipped), `Note` och en ordnad lista `WorkoutExercise`.
  Status väljs inte, den räknas fram (`WorkoutEditing.StatusOf`): något loggat ger Done, inget
  loggat ger Planned fram till passets dag och Skipped ("Inte gjort") efter. Den sparas ändå, så
  att listan och servern kan läsa den utan att räkna om.
  - mål: `TargetSets`, `TargetReps`, `TargetWeightKg`, `TargetSeconds`
  - utfall: en `SetResult` per set (`Reps`, `WeightKg`, `Seconds`). Det ersätter "8,8,10" i
    kommentaren.
  - kondition: `DurationMinutes`, `DistanceKm`, `AvgHeartRate`
  - `Comment` och `Settings` för det som gäller just det tillfället

Vikt och blodtryck blir senare ett eget aggregat, `Measurement`.

## Följder

- Importen från Numbers måste slå ihop övningsnamn med en mappningstabell och tolka kommentarer
  som "8,8,10" till set. Originalkommentaren sparas alltid.
- Idéer som datat pekar på: "kopiera förra passet som plan", visa "förra gången: 3×8 @ 60 kg"
  vid varje övning, bocka av set för set.
