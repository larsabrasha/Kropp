using Kropp.Shared.Training;

namespace Kropp.Client.Components;

/// <summary>Which picture an exercise shows, and where its frames are.</summary>
internal sealed record Illustration(string Name, int Frame);

internal static partial class ExerciseIllustrations
{
    /// <returns>The folder under wwwroot/exercises, or null for no picture.</returns>
    public static string? SlugFor(Exercise? exercise)
    {
        if (exercise is null || exercise.Illustration == Exercise.NoIllustration)
            return null;
        if (exercise.Illustration is { } chosen)
            return Catalog.ContainsKey(chosen) ? chosen : null;
        return Defaults.GetValueOrDefault(exercise.Name.Trim());
    }

    /// <summary>The file shown for an illustration: its most legible frame.</summary>
    public static string Picture(string slug) => $"exercises/{slug}/frame-{Catalog[slug].Frame}.svg";

    public static string NameOf(string slug) => Catalog.TryGetValue(slug, out var illustration) ? illustration.Name : slug;
}
