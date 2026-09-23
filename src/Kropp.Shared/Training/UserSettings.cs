namespace Kropp.Shared.Training;

/// <summary>The user's settings: one document, synced like the rest, always under <see cref="SingletonId"/>.</summary>
public sealed record UserSettings
{
    public static readonly Guid SingletonId = Guid.Parse("00000000-0000-0000-0000-00000000c0de");

    public const int MinSessionsPerWeek = 1;
    public const int MaxSessionsPerWeek = 7;

    public Guid Id { get; init; } = SingletonId;

    public int SessionsPerWeek { get; init; } = 3;

    /// <summary>Days from one session to the next that spread the week's sessions evenly: 3 a week, every other day.</summary>
    public int DaysBetweenSessions => Math.Max(1, 7 / Math.Clamp(SessionsPerWeek, MinSessionsPerWeek, MaxSessionsPerWeek));

    public static readonly UserSettings Default = new();
}
