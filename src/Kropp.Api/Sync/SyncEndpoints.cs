using Kropp.Shared.Sync;

namespace Kropp.Api.Sync;

internal static class SyncEndpoints
{
    public static IEndpointRouteBuilder MapSyncEndpoints(this IEndpointRouteBuilder app)
    {
        var sync = app.MapGroup("/api/sync");

        sync.MapPost("/push", async (PushRequest request, SyncService service, CancellationToken cancellationToken) =>
        {
            if (request.Changes is null || request.Changes.Count == 0)
                return Results.Ok(new PushResponse([]));
            if (request.Changes.Count > SyncLimits.MaxChangesPerPush)
                return Results.Problem($"At most {SyncLimits.MaxChangesPerPush} changes per push.", statusCode: 400);

            // The whole batch is refused if one change is invalid: storing the rest would clear
            // them from the client's outbox and leave the invalid one retried forever in silence.
            var errors = request.Changes
                .Select((change, index) => (index, error: AggregateValidator.Validate(change)))
                .Where(x => x.error is not null)
                .ToDictionary(x => $"changes[{x.index}]", x => new[] { x.error! });
            if (errors.Count > 0)
                return Results.ValidationProblem(errors);

            return Results.Ok(await service.PushAsync(request.Changes, cancellationToken));
        });

        sync.MapGet("/pull", async (long? since, SyncService service, CancellationToken cancellationToken) =>
        {
            if (since < 0)
                return Results.Problem("since must not be negative.", statusCode: 400);
            return Results.Ok(await service.PullAsync(since ?? 0, cancellationToken));
        });

        return app;
    }
}
