using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Kropp.Data;

/// <summary>Lets <c>dotnet ef migrations add</c> build the model without a running database.</summary>
internal sealed class DesignTimeKroppContextFactory : IDesignTimeDbContextFactory<KroppContext>
{
    public KroppContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<KroppContext>()
            .UseNpgsql("Host=localhost;Database=kropp_design")
            .Options);
}
