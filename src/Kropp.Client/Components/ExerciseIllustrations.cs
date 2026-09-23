using Kropp.Shared.Training;

namespace Kropp.Client.Components;

/// <summary>Which picture an exercise shows, and where its frames are.</summary>
internal static partial class ExerciseIllustrations
{
    public const int FrameCount = 3;

    /// <returns>The folder under wwwroot/exercises, or null for no picture.</returns>
    public static string? SlugFor(Exercise? exercise)
    {
        if (exercise is null || exercise.Illustration == Exercise.NoIllustration)
            return null;
        if (exercise.Illustration is { } chosen)
            return Catalog.ContainsKey(chosen) ? chosen : null;
        return Defaults.GetValueOrDefault(exercise.Name.Trim());
    }

    public static string Frame(string slug, int frame) => $"exercises/{slug}/frame-{frame}.svg";

    public static IEnumerable<string> Frames(string slug) => Enumerable.Range(1, FrameCount).Select(n => Frame(slug, n));
}
