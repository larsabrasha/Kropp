using Kropp.Shared.Training;
using Microsoft.Extensions.Localization;
using Kropp.Client.Resources;

namespace Kropp.Client.Components;

/// <summary>An exercise's body areas, and the name a workout gets from them.</summary>
internal static class ExerciseCategories
{
    private const BodyArea Legs = BodyArea.Legs, Chest = BodyArea.Chest, Back = BodyArea.Back,
        Core = BodyArea.Core, Arms = BodyArea.Arms, Shoulders = BodyArea.Shoulders;

    /// <summary>
    /// Categories for the exercises from the old training log, until they are set in the app. Hand-written:
    /// the names say what they train better than any rule would.
    /// </summary>
    private static readonly Dictionary<string, BodyArea[]> Defaults = new(StringComparer.CurrentCultureIgnoreCase)
    {
        ["Armhävningar på hantlar"] = [Chest, Arms],
        ["Axlar hantlar rakt upp"] = [Shoulders],
        ["Axlar hantlar rakt åt sidan"] = [Shoulders],
        ["Axlar hantlar sidan"] = [Shoulders],
        ["Axlar hantlar upp i bänk"] = [Shoulders],
        ["Axlar hantlar uppåt"] = [Shoulders],
        ["Axlar hantlar uppåt upprätt"] = [Shoulders],
        ["Benböj lår baksida"] = [Legs],
        ["Benböj lår framsida"] = [Legs],
        ["Benböj lår maskin"] = [Legs],
        ["Benböj lår uppåt i maskin"] = [Legs],
        ["Benböj med steg framåt"] = [Legs],
        ["Biceps böjd stång"] = [Arms],
        ["Biceps hantlar"] = [Arms],
        ["Biceps rak stång"] = [Arms],
        ["Biceps stång"] = [Arms],
        ["Biceps stång rulla fingrar"] = [Arms],
        ["Biceps vajer"] = [Arms],
        ["Biceps z-stång"] = [Arms],
        ["Bröst bänk sidan (ont)"] = [Chest],
        ["Bröst hantlar"] = [Chest],
        ["Bröst maskin"] = [Chest],
        ["Bröst med hantlar på bänk"] = [Chest],
        ["Bröst åt sidan med hantlar"] = [Chest],
        ["Bröstpress maskin"] = [Chest],
        ["Bänkpress"] = [Chest],
        ["Bänkpress hantlar"] = [Chest],
        ["Bänkpress med hantlar"] = [Chest],
        ["Cykel till gymet"] = [Legs],
        ["Deadlift"] = [Back, Legs],
        ["Dra bak i maskin"] = [Back],
        ["Dra hantel upp från mark"] = [Back],
        ["Dra mig upp i ringar"] = [Back, Arms],
        ["Dra ner i maskin"] = [Back],
        ["Dra ner stång"] = [Back],
        ["Dra ner stång i maskin"] = [Back],
        ["Dra ner två handtag i maskin"] = [Back],
        ["Dra upp axlar med hantlar"] = [Shoulders],
        ["Dra upp nacke/axlar med hantlar"] = [Shoulders],
        ["Dra upp stång mot mage stående"] = [Back],
        ["Dra vikt bakåt maskin"] = [Back],
        ["Gå upp på bänk"] = [Legs],
        ["Gång i maskin"] = [Legs],
        ["Häng i stång"] = [Back, Arms],
        ["Häng i stång + dra mig upp i ringar"] = [Back, Arms],
        ["Hänga i armarna"] = [Back, Arms],
        ["Höj ben från bänk"] = [Core],
        ["Höj och sänk ben från bänk"] = [Core],
        ["Höjning sänk ben liggandes på bänk"] = [Core],
        ["Löpning på band"] = [Legs],
        ["Magmaskin"] = [Core],
        ["Marklyft?"] = [Back, Legs],
        ["Plankan"] = [Core],
        ["Pull down maskin"] = [Back],
        ["Pull down maskin 2"] = [Back],
        ["Sit ups"] = [Core],
        ["Solar rakt upp bänk"] = [Chest],
        ["Squats"] = [Legs],
        ["Squats med kettlebell"] = [Legs],
        ["Squats med kettlebell till huvud"] = [Legs, Shoulders],
        ["Sänk hängande från stång"] = [Back, Arms],
        ["Triceps"] = [Arms],
        ["Triceps bakåt på bänk"] = [Arms],
        ["Triceps dips"] = [Arms],
        ["Triceps maskin"] = [Arms],
        ["Triceps rak stång bänk"] = [Arms],
        ["Triceps rak stång i maskin"] = [Arms],
        ["Triceps stång på bänk"] = [Arms],
        ["Triceps sänk från bänk"] = [Arms],
        ["Tricepshävningar på bänk"] = [Arms],
        ["Trips rep i maskin"] = [Arms],
        ["Tåhävningar"] = [Legs],
        ["Underarm stång bakom"] = [Arms],
        ["Underarmar bakom rygg"] = [Arms],
        ["Vader"] = [Legs],
        ["Vader egenvikt"] = [Legs],
    };

    /// <summary>The chosen categories, or the default for an exercise from the old log, or none.</summary>
    public static IReadOnlyList<BodyArea> For(Exercise exercise) =>
        exercise.Categories.Count > 0 ? exercise.Categories
        : Defaults.TryGetValue(exercise.Name.Trim(), out var areas) ? areas
        : [];

    /// <summary>
    /// The picture that stands for a body area in the workout list: one exercise illustration per
    /// area, so the icons match the exercise pictures and are cached the same way.
    /// </summary>
    private static readonly Dictionary<BodyArea, string> AreaIcons = new()
    {
        [Legs] = "squat",
        [Chest] = "bench-press",
        [Back] = "lat-pulldown",
        [Core] = "crunch",
        [Arms] = "bicep-curl",
        [Shoulders] = "overhead-press",
    };

    private const string CardioIcon = "running";

    /// <summary>The icon for a workout: its dominant area, the first in its name; null when none is known.</summary>
    public static string? IconFor(Workout workout, IReadOnlyDictionary<Guid, Exercise> exercises)
    {
        Exercise? Find(Guid id) => exercises.GetValueOrDefault(id);
        if (WorkoutEditing.IsCardioOnly(workout, Find))
            return CardioIcon;
        var areas = WorkoutEditing.AreasOf(workout, Find, For);
        return areas.Count > 0 ? AreaIcons[areas[0]] : null;
    }

    public const int MaxAreasInName = 3;

    /// <summary>"Ben, rygg och mage" — or "Kondition", or null when nothing is known yet.</summary>
    public static string? WorkoutName(Workout workout, IReadOnlyDictionary<Guid, Exercise> exercises, IStringLocalizer<SharedResource> L)
    {
        Exercise? Find(Guid id) => exercises.GetValueOrDefault(id);
        if (WorkoutEditing.IsCardioOnly(workout, Find))
            return L["Workout.CardioOnly"];

        // At most three areas, the ones with the most exercises, so a name stays one short line.
        var names = WorkoutEditing.AreasOf(workout, Find, For).Take(MaxAreasInName).Select((a, i) => i == 0 ? L[$"BodyArea.{a}"].Value : L[$"BodyArea.{a}"].Value.ToLower(System.Globalization.CultureInfo.CurrentCulture)).ToList();
        return names.Count switch
        {
            0 => null,
            1 => names[0],
            _ => $"{string.Join(", ", names[..^1])} {L["Common.And"]} {names[^1]}",
        };
    }
}
