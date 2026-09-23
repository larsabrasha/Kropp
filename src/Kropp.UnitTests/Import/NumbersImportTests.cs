using Kropp.Import;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Import;

public class NumbersImportTests
{
    private const string Header = "Datum;Övning;Set;Rep;Inst;Utfört;Kommentar;Träning nr";
    private static readonly DateOnly Today = new(2026, 9, 23);

    private static ImportResult Import(params (string Sheet, string Csv)[] sheets)
    {
        var report = new ImportReport();
        var rows = sheets.SelectMany(s => NumbersImport.ReadSheet(s.Sheet, s.Csv, report)).ToList();
        return NumbersImport.Build(rows, new Dictionary<string, Exercise>(), Today, report);
    }

    private static ImportResult Import(string csv) => Import(("Vecka 1", csv));

    private static WorkoutExercise OnlyEntry(ImportResult result) => result.Workouts.Single().Exercises.Single();

    [Fact]
    public void Reads_a_ticked_row_as_sets_done_at_the_planned_values()
    {
        var result = Import($"{Header}\n2026-01-05;Biceps hantlar;3;8;22,5;SANT;;51\n");

        var workout = result.Workouts.Single();
        workout.Date.ShouldBe(new DateOnly(2026, 1, 5));
        workout.SessionNumber.ShouldBe(51);
        workout.Status.ShouldBe(WorkoutStatus.Done);
        var entry = workout.Exercises.Single();
        (entry.TargetSets, entry.TargetReps, entry.TargetWeightKg).ShouldBe((3, 8, 22.5m));
        entry.Sets.ShouldBe(Enumerable.Repeat(new SetResult { Reps = 8, WeightKg = 22.5m }, 3));
        result.Exercises.Single().Kind.ShouldBe(ExerciseKind.Strength);
    }

    [Fact]
    public void Reps_per_set_in_the_comment_replace_the_plan_and_the_comment_is_kept()
    {
        var entry = OnlyEntry(Import($"{Header}\n2026-01-05;Bröst hantlar;3;8;20;SANT;8,8,10 45 grader;\n"));

        entry.Sets.Select(s => s.Reps).ShouldBe([8, 8, 10]);
        entry.Sets.ShouldAllBe(s => s.WeightKg == 20);
        entry.Comment.ShouldBe("8,8,10 45 grader");
        entry.Settings.ShouldBe("45 grader");
    }

    [Theory]
    [InlineData("5 i sista", new[] { 8, 8, 5 })]
    [InlineData("4 rep på sista", new[] { 8, 8, 4 })]
    [InlineData("Bara 10 sista set", new[] { 8, 8, 10 })]
    [InlineData("Sitthöjd 11, 4 i sista", new[] { 8, 8, 4 })]
    [InlineData("2 set", new[] { 8, 8 })]
    [InlineData("7,0,0 trött", new[] { 7 })]
    public void Reads_the_common_ways_of_writing_what_was_done(string comment, int[] reps) =>
        OnlyEntry(Import($"{Header}\n2026-01-05;Bröst maskin;3;8;60;SANT;{comment};\n")).Sets.Select(s => s.Reps).ShouldBe(reps.Cast<int?>());

    [Fact]
    public void An_angle_with_a_decimal_is_not_mistaken_for_reps()
    {
        var entry = OnlyEntry(Import($"{Header}\n2026-01-05;Bröst hantlar;3;8;20;SANT;22,5 grader;\n"));

        entry.Sets.Select(s => s.Reps).ShouldBe([8, 8, 8]);
        entry.Settings.ShouldBe("22,5 grader");
    }

    [Fact]
    public void An_unticked_row_is_planned_without_sets()
    {
        var workout = Import($"{Header}\n2026-01-05;Vader;3;20;;SANT;;\n2026-01-05;Bröstpress maskin;3;8;40;FALSKT;;\n").Workouts.Single();

        workout.Status.ShouldBe(WorkoutStatus.Done);
        workout.Exercises.Select(e => e.Sets.Count).ShouldBe([3, 0]);
        workout.Exercises[1].TargetWeightKg.ShouldBe(40);
    }

    [Fact]
    public void A_day_with_nothing_ticked_is_skipped_in_the_past_and_planned_ahead()
    {
        var result = Import($"{Header}\n2025-10-02;Vader;3;20;;FALSKT;;\n2026-10-02;Vader;3;20;;FALSKT;;\n");

        result.Workouts.Select(w => w.Status).ShouldBe([WorkoutStatus.Skipped, WorkoutStatus.Planned]);
    }

    [Fact]
    public void Walking_in_the_machine_is_cardio_with_the_setting_and_the_time()
    {
        var result = Import($"{Header}\n2026-01-05;Gång i maskin;3;8;60;SANT;3m 30s;\n");

        result.Exercises.Single().Kind.ShouldBe(ExerciseKind.Cardio);
        var entry = OnlyEntry(result);
        entry.Settings.ShouldBe("60");
        entry.DurationMinutes.ShouldBe(3.5m);
        (entry.TargetSets, entry.TargetReps, entry.TargetWeightKg).ShouldBe((null, null, null));
        entry.Sets.ShouldBeEmpty();
    }

    [Fact]
    public void Deadlift_keeps_the_rep_column_as_its_setting()
    {
        var entry = OnlyEntry(Import($"{Header}\n2026-01-05;Deadlift;3;40;5;SANT;2 set;\n"));

        entry.Settings.ShouldBe("40");
        entry.TargetReps.ShouldBeNull();
        entry.TargetWeightKg.ShouldBe(5);
        entry.Sets.ShouldBe([new SetResult { WeightKg = 5 }, new SetResult { WeightKg = 5 }]);
    }

    [Theory]
    [InlineData("Plankan;3;60;", "60,45,35", new[] { 60, 45, 35 })]
    [InlineData("Häng i stång;3;8;", "25s", new[] { 25, 25, 25 })]
    [InlineData("Hänga i armarna;3;1;25", "", new[] { 25, 25, 25 })]
    public void Timed_exercises_record_seconds(string columns, string comment, int[] seconds)
    {
        var result = Import($"{Header}\n2026-01-05;{columns};SANT;{comment};\n");

        result.Exercises.Single().Kind.ShouldBe(ExerciseKind.Timed);
        OnlyEntry(result).Sets.Select(s => s.Seconds).ShouldBe(seconds.Cast<int?>());
    }

    [Fact]
    public void A_run_reads_its_minutes_and_distance()
    {
        var entry = OnlyEntry(Import($"{Header}\n2026-01-05;Löpning på band;1;1;;SANT;20 min i 8:30 min/km zon 2;\n"));

        entry.DurationMinutes.ShouldBe(20);
        entry.Comment.ShouldBe("20 min i 8:30 min/km zon 2");
    }

    [Fact]
    public void A_plan_copied_to_the_next_weeks_sheet_is_ignored()
    {
        var result = Import(
            ("Vecka 38", $"{Header}\n2026-09-14;Vader;3;20;;SANT;;\n"),
            ("Vecka 39", $"{Header}\n2026-09-14;Vader;3;20;;FALSKT;;\n2026-09-14;Plankan;2;60;;FALSKT;;\n"));

        result.Workouts.Single().Exercises.ShouldHaveSingleItem().Sets.Count.ShouldBe(3);
        result.Report.DroppedCopies.ShouldHaveSingleItem();
    }

    [Fact]
    public void A_date_on_two_sheets_with_ticks_on_both_is_merged()
    {
        var result = Import(
            ("Vecka 36", $"{Header}\n2025-09-09;Vader;3;20;;SANT;;\n2025-09-09;Plankan;2;60;;FALSKT;;\n"),
            ("Vecka 39", $"{Header}\n2025-09-09;Plankan;2;60;;SANT;;\n2025-09-09;Sit ups;3;20;5;SANT;;\n"));

        var workout = result.Workouts.Single();
        workout.Exercises.Select(e => (result.Exercises.Single(x => x.Id == e.ExerciseId).Name, e.Sets.Count))
            .ShouldBe([("Vader", 3), ("Plankan", 2), ("Sit ups", 3)], ignoreOrder: true);
        result.Report.MergedDates.ShouldHaveSingleItem();
    }

    [Fact]
    public void Spellings_of_the_same_exercise_become_one()
    {
        var result = Import($"{Header}\n2026-01-05;Situps ;3;20;5;SANT;;\n2026-01-06;Sit ups;3;20;5;SANT;;\n");

        result.Exercises.ShouldHaveSingleItem().Name.ShouldBe("Sit ups");
        result.Workouts.Select(w => w.Exercises.Single().ExerciseId).Distinct().ShouldHaveSingleItem();
    }

    [Fact]
    public void Ids_are_stable_so_a_second_run_updates_instead_of_duplicating()
    {
        var csv = $"{Header}\n2026-01-05;Vader;3;20;;SANT;;\n";

        var first = Import(csv);
        var second = Import(csv);

        second.Workouts.Single().Id.ShouldBe(first.Workouts.Single().Id);
        second.Exercises.Single().Id.ShouldBe(first.Exercises.Single().Id);
    }

    [Fact]
    public void An_exercise_already_in_the_app_is_reused_by_name()
    {
        var existing = new Exercise { Id = Guid.NewGuid(), Name = "Bröst maskin", Kind = ExerciseKind.Strength };
        var report = new ImportReport();
        var rows = NumbersImport.ReadSheet("Vecka 1", $"{Header}\n2026-01-05;bröst maskin;3;8;60;SANT;;\n", report);

        var result = NumbersImport.Build(rows, new Dictionary<string, Exercise>(StringComparer.OrdinalIgnoreCase) { ["Bröst maskin"] = existing }, Today, report);

        result.Exercises.ShouldBeEmpty();
        OnlyEntry(result).ExerciseId.ShouldBe(existing.Id);
    }

    [Fact]
    public void Rows_without_a_date_are_reported_and_skipped()
    {
        var result = Import($"{Header}\n;;;0;;FALSKT;;\n2026-01-05;Vader;3;20;;SANT;;\n");

        result.Workouts.ShouldHaveSingleItem();
        result.Report.SkippedRows.ShouldHaveSingleItem();
    }

    [Fact]
    public void The_visits_of_forty_column_becomes_a_note()
    {
        var result = Import($"Datum;Övning;Set;Rep;Inst;Utfört;Kommentar; Gång av 40\n2025-11-18;Vader;3;20;;SANT;;36\n");

        result.Workouts.Single().Note.ShouldBe("Gång 36 av 40");
        result.Workouts.Single().SessionNumber.ShouldBeNull();
    }

    [Fact]
    public void Quoted_fields_may_hold_semicolons_and_quotes() =>
        OnlyEntry(Import($"{Header}\n2026-01-05;Vader;3;20;;SANT;\"a; \"\"b\"\"\";\n")).Comment.ShouldBe("a; \"b\"");
}
