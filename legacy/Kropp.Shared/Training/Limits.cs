namespace Kropp.Shared.Training;

/// <summary>
/// The largest values the app's fields take: well past what anyone logs, low enough to catch a
/// slipped digit. The server keeps its own, wider checks, so data logged before these stays valid.
/// </summary>
public static class Limits
{
    public const int Sets = 10;
    public const int Reps = 100;
    public const decimal WeightKg = 500;
    public const int Seconds = 3600;
    public const decimal Minutes = 300;
    public const decimal DistanceKm = 100;
    public const int HeartRate = 250;
    public const int SessionNumber = 9999;

    /// <summary>An exercise or template name.</summary>
    public const int Name = 100;

    /// <summary>A setting, like "Sitthöjd 11".</summary>
    public const int ShortText = 200;

    /// <summary>A comment or a note.</summary>
    public const int LongText = 1000;

    public const int Search = 100;

    /// <summary>The dates the server accepts, see <c>AggregateValidator</c>.</summary>
    public static readonly DateOnly FirstDate = new(2000, 1, 1);
    public static readonly DateOnly LastDate = new(2100, 12, 31);

    public static bool IsInRange(DateOnly date) => date >= FirstDate && date <= LastDate;
}
