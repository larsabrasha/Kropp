using System.Net.Http.Json;
using Kropp.Shared.Sync;

namespace Kropp.IntegrationTests;

/// <summary>The same calls the browser client makes, over the test server's HttpClient.</summary>
internal sealed class HttpSyncApi(HttpClient http) : ISyncApi
{
    public async Task<PushResponse> PushAsync(PushRequest request, CancellationToken cancellationToken)
    {
        using var response = await http.PostAsJsonAsync("api/sync/push", request, cancellationToken);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PushResponse>(cancellationToken))!;
    }

    public async Task<PullResponse> PullAsync(long since, CancellationToken cancellationToken) =>
        (await http.GetFromJsonAsync<PullResponse>($"api/sync/pull?since={since}", cancellationToken))!;
}
