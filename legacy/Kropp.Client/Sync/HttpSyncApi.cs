using System.Net.Http.Json;
using Kropp.Shared.Sync;

namespace Kropp.Client.Sync;

internal sealed class HttpSyncApi(HttpClient http) : ISyncApi
{
    public async Task<PushResponse> PushAsync(PushRequest request, CancellationToken cancellationToken)
    {
        using var response = await http.PostAsJsonAsync("api/sync/push", request, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<PushResponse>(cancellationToken)
            ?? throw new HttpRequestException("The server returned an empty push response.");
    }

    public async Task<PullResponse> PullAsync(long since, CancellationToken cancellationToken)
    {
        using var response = await http.GetAsync($"api/sync/pull?since={since}", cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<PullResponse>(cancellationToken)
            ?? throw new HttpRequestException("The server returned an empty pull response.");
    }
}
