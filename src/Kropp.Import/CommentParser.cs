using System.Globalization;
using System.Text.RegularExpressions;

namespace Kropp.Import;

/// <summary>
/// Reads what was actually done out of the free-text comment. Anything it does not recognise is
/// left alone; the comment is always kept word for word beside the parsed result.
/// </summary>
internal static partial class CommentParser
{
    /// <summary>"8,8,10", "10,10,7 45 grader", "20,20 Kroppsvikt" → the values, in order. Not "22,5 grader".</summary>
    public static IReadOnlyList<int>? PerSetValues(string? comment, int? plannedSets)
    {
        if (string.IsNullOrWhiteSpace(comment))
            return null;
        var match = SetList().Match(comment);
        if (!match.Success)
            return null;
        var rest = comment[match.Length..].TrimStart();
        if (rest.StartsWith('°') || rest.StartsWith("grader", StringComparison.OrdinalIgnoreCase))
            return null;
        var values = match.Groups["list"].Value.Split(',').Select(v => int.Parse(v.Trim(), CultureInfo.InvariantCulture)).ToList();
        return values.Count <= Math.Max(plannedSets ?? 0, 1) + 1 ? values : null;
    }

    /// <summary>"5 i sista", "4 rep på sista", "Bara 10 sista set", "Sitthöjd 11, 4 i sista" → the reps of the last set.</summary>
    public static int? LastSet(string? comment) =>
        comment is not null && LastSetPattern().Match(comment) is { Success: true } m ? int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) : null;

    /// <summary>
    /// A machine setting mentioned in the comment: an angle ("45 grader", "22,5°") or a seat height
    /// ("Sitthöjd 11"). Carried to the Settings field so it follows the exercise to the next plan.
    /// </summary>
    public static string? Setting(string? comment) =>
        comment is not null && SettingPattern().Match(comment) is { Success: true } m ? m.Value.Trim() : null;

    /// <summary>"2 set" or "1 set" as the whole comment → that many sets done.</summary>
    public static int? SetCount(string? comment) =>
        comment is not null && SetCountPattern().Match(comment) is { Success: true } m ? int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) : null;

    /// <summary>A Numbers duration cell as exported: "5m", "3m 30s", "25s" → seconds.</summary>
    public static int? DurationSeconds(string? comment)
    {
        if (comment is null || DurationPattern().Match(comment.Trim()) is not { Success: true } m || !(m.Groups["m"].Success || m.Groups["s"].Success))
            return null;
        var minutes = m.Groups["m"].Success ? int.Parse(m.Groups["m"].Value, CultureInfo.InvariantCulture) : 0;
        var seconds = m.Groups["s"].Success ? int.Parse(m.Groups["s"].Value, CultureInfo.InvariantCulture) : 0;
        return minutes * 60 + seconds;
    }

    /// <summary>"20 min i 8:30 min/km" → 20. The pace is left in the comment.</summary>
    public static decimal? RunMinutes(string? comment) =>
        comment is not null && RunMinutesPattern().Match(comment) is { Success: true } m ? decimal.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) : null;

    /// <summary>"6 min/km i 1 km" → 1.</summary>
    public static decimal? RunKm(string? comment) =>
        comment is not null && RunKmPattern().Match(comment) is { Success: true } m ? decimal.Parse(m.Groups[1].Value.Replace(',', '.'), CultureInfo.InvariantCulture) : null;

    [GeneratedRegex(@"^\s*(?<list>\d{1,3}(\s*,\s*\d{1,3})+)(?=\s|$)")]
    private static partial Regex SetList();

    [GeneratedRegex(@"(?:^|[\s,.])(\d{1,3})\s+(?:rep\s+|st\s+)?(?:(?:i|på)\s+)?sista(?:\s+set)?\b", RegexOptions.IgnoreCase)]
    private static partial Regex LastSetPattern();

    [GeneratedRegex(@"\b(?:\d{1,3}(?:,\d)?\s*(?:grader|°)|sitthöjd\s+\d{1,2})", RegexOptions.IgnoreCase)]
    private static partial Regex SettingPattern();

    [GeneratedRegex(@"^\s*(\d{1,2})\s+set\s*$", RegexOptions.IgnoreCase)]
    private static partial Regex SetCountPattern();

    [GeneratedRegex(@"^(?:(?<m>\d{1,3})m)?\s*(?:(?<s>\d{1,2})s)?$")]
    private static partial Regex DurationPattern();

    [GeneratedRegex(@"^\s*(\d{1,3})\s*min\s+i\b", RegexOptions.IgnoreCase)]
    private static partial Regex RunMinutesPattern();

    [GeneratedRegex(@"\bi\s+(\d+(?:[,.]\d+)?)\s*km\b", RegexOptions.IgnoreCase)]
    private static partial Regex RunKmPattern();
}
