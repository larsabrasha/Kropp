using System.Globalization;
using Kropp.Shared.Training;

namespace Kropp.Import;

internal sealed record SheetRow(
    string Sheet,
    DateOnly Date,
    string Exercise,
    int? Sets,
    int? Reps,
    decimal? Inst,
    bool Done,
    string? Comment,
    int? SessionNumber,
    int? VisitOfForty);

internal sealed record ImportResult(
    IReadOnlyList<Exercise> Exercises,
    IReadOnlyList<Workout> Workouts,
    ImportReport Report);

internal sealed class ImportReport
{
    public int RowsRead { get; set; }
    public List<string> SkippedRows { get; } = [];
    public List<string> DroppedCopies { get; } = [];
    public List<string> MergedDates { get; } = [];
    public List<string> MergedNames { get; } = [];
    public List<string> CommentsKeptAsText { get; } = [];
}

/// <summary>
/// Turns the rows of the old weekly sheets into workouts and exercises. Pure: files in, aggregates
/// out, so every rule here is covered by tests with made-up rows.
/// </summary>
internal static class NumbersImport
{
    public static List<SheetRow> ReadSheet(string sheet, string csv, ImportReport report)
    {
        var table = SemicolonCsv.Parse(csv);
        if (table.Count == 0)
            return [];

        var header = table[0].Select(h => h.Trim().TrimStart('﻿')).ToList();
        int Col(string name) => header.FindIndex(h => string.Equals(h, name, StringComparison.OrdinalIgnoreCase));
        var (date, exercise, sets, reps, inst, done, comment, session, visit) =
            (Col("Datum"), Col("Övning"), Col("Set"), Col("Rep"), Col("Inst"), Col("Utfört"), Col("Kommentar"), Col("Träning nr"), Col("Gång av 40"));
        if (date < 0 || exercise < 0)
            throw new FormatException($"{sheet}: the header has no Datum or Övning column.");

        var rows = new List<SheetRow>();
        foreach (var (cells, line) in table.Skip(1).Select((c, i) => (c, i + 2)))
        {
            string? Cell(int index) => index >= 0 && index < cells.Length && !string.IsNullOrWhiteSpace(cells[index]) ? cells[index].Trim() : null;
            if (cells.All(string.IsNullOrWhiteSpace))
                continue;

            report.RowsRead++;
            var name = Cell(exercise);
            if (!DateOnly.TryParseExact(Cell(date), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) || name is null)
            {
                report.SkippedRows.Add($"{sheet} rad {line}: saknar datum eller övning");
                continue;
            }

            rows.Add(new SheetRow(
                sheet, day, ExerciseCatalog.Canonical(name),
                Int(Cell(sets)), Int(Cell(reps)), Decimal(Cell(inst)),
                string.Equals(Cell(done), "SANT", StringComparison.OrdinalIgnoreCase) || string.Equals(Cell(done), "TRUE", StringComparison.OrdinalIgnoreCase),
                Cell(comment), Int(Cell(session)), Int(Cell(visit))));

            if (ExerciseCatalog.Canonical(name) != System.Text.RegularExpressions.Regex.Replace(name, @"\s+", " ").Trim())
                report.MergedNames.Add($"{name.Trim()} → {ExerciseCatalog.Canonical(name)}");
        }
        return rows;
    }

    /// <param name="existingExercises">Exercises already on the server, reused by name so nothing is duplicated.</param>
    public static ImportResult Build(IEnumerable<SheetRow> allRows, IReadOnlyDictionary<string, Exercise> existingExercises, DateOnly today, ImportReport report)
    {
        var rows = allRows.ToList();

        var anyWeight = rows
            .Where(r => !ExerciseCatalog.MachineCardio.Contains(r.Exercise))
            .GroupBy(r => r.Exercise, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Any(r => r.Inst is not null), StringComparer.OrdinalIgnoreCase);

        var exercises = new Dictionary<string, Exercise>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in rows.Select(r => r.Exercise).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            exercises[name] = existingExercises.TryGetValue(name, out var existing)
                ? existing
                : new Exercise
                {
                    Id = DeterministicGuid.Create("exercise:" + name.ToLowerInvariant()),
                    Name = name,
                    Kind = ExerciseCatalog.KindOf(name, anyWeight.GetValueOrDefault(name)),
                };
        }

        var workouts = new List<Workout>();
        foreach (var day in rows.GroupBy(r => r.Date).OrderBy(g => g.Key))
        {
            var dayRows = RowsForDay(day.Key, [.. day], report);
            var entries = dayRows.Select((r, i) => Entry(r, exercises[r.Exercise], i, report)).ToList();

            var visit = dayRows.Select(r => r.VisitOfForty).FirstOrDefault(v => v is not null);
            workouts.Add(new Workout
            {
                Id = DeterministicGuid.Create("workout:" + day.Key.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                Date = day.Key,
                SessionNumber = dayRows.Select(r => r.SessionNumber).FirstOrDefault(n => n is not null),
                Status = dayRows.Any(r => r.Done) ? WorkoutStatus.Done : WorkoutStatus.Planned,
                Note = visit is not null ? $"Gång {visit} av 40" : null,
                Exercises = entries,
            });
        }

        var newExercises = exercises.Values.Where(e => !existingExercises.ContainsKey(e.Name)).OrderBy(e => e.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
        return new ImportResult(newExercises, workouts, report);
    }

    /// <summary>
    /// A date can sit on more than one weekly sheet. A sheet where nothing is ticked, beside one where
    /// something is, is the next week's plan copied forward and is dropped. Otherwise the rows are
    /// merged: one row per exercise, a ticked one preferred.
    /// </summary>
    private static List<SheetRow> RowsForDay(DateOnly date, List<SheetRow> rows, ImportReport report)
    {
        var sheets = rows.GroupBy(r => r.Sheet).OrderByDescending(g => g.Count(r => r.Done)).ThenByDescending(g => g.Count()).ToList();
        if (sheets.Count == 1)
            return sheets[0].ToList();

        if (sheets.Any(s => s.Any(r => r.Done)))
        {
            foreach (var copy in sheets.Where(s => !s.Any(r => r.Done)))
                report.DroppedCopies.Add($"{date:yyyy-MM-dd}: {copy.Count()} ej ibockade rader på {copy.Key} (kopierad plan)");
            sheets = [.. sheets.Where(s => s.Any(r => r.Done))];
            if (sheets.Count == 1)
                return sheets[0].ToList();
        }

        var merged = sheets[0].ToList();
        foreach (var row in sheets.Skip(1).SelectMany(s => s))
        {
            var index = merged.FindIndex(r => string.Equals(r.Exercise, row.Exercise, StringComparison.OrdinalIgnoreCase));
            if (index < 0)
                merged.Add(row);
            else if (!merged[index].Done && row.Done)
                merged[index] = row;
        }
        report.MergedDates.Add($"{date:yyyy-MM-dd}: {string.Join(" + ", sheets.Select(s => s.Key))}");
        return merged;
    }

    private static WorkoutExercise Entry(SheetRow row, Exercise exercise, int order, ImportReport report)
    {
        var entry = new WorkoutExercise { ExerciseId = exercise.Id, Order = order, Comment = row.Comment };
        var parsed = true;

        if (ExerciseCatalog.MachineCardio.Contains(row.Exercise))
        {
            var seconds = CommentParser.DurationSeconds(row.Comment);
            entry = entry with
            {
                Settings = row.Inst is { } setting ? setting.ToString(CultureInfo.CurrentCulture) : null,
                DurationMinutes = row.Done && seconds is not null ? Math.Round(seconds.Value / 60m, 2) : null,
            };
            parsed = seconds is not null;
        }
        else if (ExerciseCatalog.PacedCardio.Contains(row.Exercise))
        {
            var minutes = CommentParser.RunMinutes(row.Comment);
            entry = entry with
            {
                DurationMinutes = row.Done ? minutes : null,
                DistanceKm = row.Done ? CommentParser.RunKm(row.Comment) : null,
            };
            parsed = minutes is not null;
        }
        else if (exercise.Kind == ExerciseKind.Timed)
        {
            var target = row.Inst is { } inst ? (int)inst : row.Reps is > 1 and not 8 ? row.Reps : null;
            entry = entry with { TargetSets = row.Sets, TargetSeconds = target };
            if (row.Done)
            {
                var perSet = CommentParser.PerSetValues(row.Comment, row.Sets);
                var each = CommentParser.DurationSeconds(row.Comment);
                var count = CommentParser.SetCount(row.Comment) ?? row.Sets ?? 1;
                parsed = perSet is not null || each is not null || CommentParser.SetCount(row.Comment) is not null;
                entry = entry with
                {
                    Sets = perSet is not null
                        ? [.. perSet.Where(s => s > 0).Select(s => new SetResult { Seconds = s })]
                        : [.. Enumerable.Repeat(new SetResult { Seconds = each ?? target }, count)],
                };
            }
        }
        else
        {
            var settingInReps = ExerciseCatalog.SettingInReps.Contains(row.Exercise);
            var reps = settingInReps ? null : row.Reps;
            var weight = exercise.Kind == ExerciseKind.Strength ? row.Inst : null;
            entry = entry with
            {
                TargetSets = row.Sets,
                TargetReps = reps,
                TargetWeightKg = weight,
                Settings = settingInReps && row.Reps is { } setting ? setting.ToString(CultureInfo.InvariantCulture)
                    : ExerciseCatalog.SettingInInst.Contains(row.Exercise) && row.Inst is { } bench
                        ? string.Join(" · ", new[] { bench.ToString(CultureInfo.CurrentCulture), CommentParser.Setting(row.Comment) }.Where(p => p is not null))
                    : CommentParser.Setting(row.Comment),
            };
            if (row.Done)
            {
                var perSet = settingInReps ? null : CommentParser.PerSetValues(row.Comment, row.Sets);
                var last = settingInReps ? null : CommentParser.LastSet(row.Comment);
                var count = CommentParser.SetCount(row.Comment);
                var planned = count ?? row.Sets ?? 1;
                parsed = perSet is not null || last is not null || count is not null || entry.Settings is not null;

                IEnumerable<int?> repsPerSet = perSet is not null ? perSet.Where(r => r > 0).Select(r => (int?)r)
                    : last is not null ? [.. Enumerable.Repeat(reps, Math.Max(planned - 1, 0)), last]
                    : Enumerable.Repeat(reps, planned);
                entry = entry with { Sets = [.. repsPerSet.Select(r => new SetResult { Reps = r, WeightKg = weight })] };
            }
        }

        if (row.Done && !parsed && row.Comment is not null)
            report.CommentsKeptAsText.Add($"{row.Date:yyyy-MM-dd} {row.Exercise}: {row.Comment}");
        return entry;
    }

    private static int? Int(string? value) =>
        decimal.TryParse(value?.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? (int)Math.Round(d) : null;

    private static decimal? Decimal(string? value) =>
        decimal.TryParse(value?.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null;
}
