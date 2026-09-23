using Kropp.Data;
using Microsoft.EntityFrameworkCore;

namespace Kropp.MigrationService;

/// <param name="fail">
/// How a failure is reported. Injectable because the real one writes the process-global
/// <see cref="Environment.ExitCode"/>, which a test of the failure path would otherwise set for
/// the whole test run.
/// </param>
internal sealed class MigrationService(
    IServiceProvider serviceProvider,
    IHostApplicationLifetime hostLifetime,
    ILogger<MigrationService> logger,
    Action<int>? fail = null
) : BackgroundService
{
    private readonly Action<int> fail = fail ?? (code => Environment.ExitCode = code);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Migration Service is starting");

        try
        {
            using var scope = serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<KroppContext>();
            var strategy = context.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () => await context.Database.MigrateAsync(stoppingToken));

            logger.LogInformation("Migration Service is finished");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Migration Service failed");
            // The API waits for this process to complete successfully. A zero exit code after a
            // failed migration would start it against a schema behind its model.
            fail(1);
        }

        hostLifetime.StopApplication();
    }
}
