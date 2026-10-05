namespace Kropp.Shared.Sync;

/// <summary>The server end of sync. Throws <see cref="HttpRequestException"/> when it cannot be reached.</summary>
public interface ISyncApi
{
    Task<PushResponse> PushAsync(PushRequest request, CancellationToken cancellationToken);

    Task<PullResponse> PullAsync(long since, CancellationToken cancellationToken);
}
