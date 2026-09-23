using System.Text.RegularExpressions;
using Kropp.Shared.Training;

namespace Kropp.Import;

/// <summary>
/// What the spreadsheet's exercise names mean. Only spellings that are clearly the same exercise are
/// merged; everything else keeps its own entry, since merging later is easier than splitting.
/// </summary>
internal static partial class ExerciseCatalog
{
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Situps"] = "Sit ups",
        ["Trips rak stång i maskin"] = "Triceps rak stång i maskin",
        ["Dra mig upp i ringar ä"] = "Dra mig upp i ringar",
        ["Tricepthävningar på bän"] = "Tricepshävningar på bänk",
        ["Hänga i stång"] = "Häng i stång",
    };

    /// <summary>
    /// Rows where the columns meant something else. "Gång i maskin" and "Cykel till gymet": Inst is the
    /// machine's setting and the comment holds the time, Set and Rep are leftovers. "Deadlift": Rep
    /// holds the setting. Plank and hangs are held for seconds.
    /// </summary>
    public static readonly IReadOnlySet<string> MachineCardio = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Gång i maskin", "Cykel till gymet" };
    public static readonly IReadOnlySet<string> PacedCardio = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Löpning på band" };
    public static readonly IReadOnlySet<string> SettingInReps = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Deadlift" };
    public static readonly IReadOnlySet<string> Timed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Plankan", "Häng i stång", "Hänga i armarna" };

    public static string Canonical(string raw)
    {
        var name = Whitespace().Replace(raw, " ").Trim();
        return Aliases.GetValueOrDefault(name, name);
    }

    /// <param name="anyWeight">Whether any row for the exercise has a value in Inst.</param>
    public static ExerciseKind KindOf(string name, bool anyWeight) =>
        MachineCardio.Contains(name) || PacedCardio.Contains(name) ? ExerciseKind.Cardio
        : Timed.Contains(name) ? ExerciseKind.Timed
        : anyWeight ? ExerciseKind.Strength
        : ExerciseKind.Bodyweight;

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
