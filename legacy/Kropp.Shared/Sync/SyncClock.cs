namespace Kropp.Shared.Sync;

public static class SyncClock
{
    /// <summary>
    /// Now in UTC, truncated to whole milliseconds. Postgres keeps microseconds and JavaScript
    /// milliseconds, so a finer stamp would not survive the round trip and a record would look
    /// newer than its own copy on the server.
    /// </summary>
    public static DateTimeOffset Now(TimeProvider? time = null) => Truncate((time ?? TimeProvider.System).GetUtcNow());

    public static DateTimeOffset Truncate(DateTimeOffset value)
    {
        var utc = value.ToUniversalTime();
        return new DateTimeOffset(utc.Ticks - utc.Ticks % TimeSpan.TicksPerMillisecond, TimeSpan.Zero);
    }
}
