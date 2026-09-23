using Kropp.Client.Components;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class ExerciseIllustrationsTests
{
    private static Exercise Named(string name, string? illustration = null) =>
        new() { Id = Guid.NewGuid(), Name = name, Illustration = illustration };

    private static string ExercisesFolder()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Kropp.sln")))
            dir = dir.Parent;
        return Path.Combine(dir.ShouldNotBeNull().FullName, "Kropp.Client", "wwwroot", "exercises");
    }

    [Fact]
    public void An_imported_name_gets_its_default_picture() =>
        ExerciseIllustrations.SlugFor(Named("bröst maskin ")).ShouldBe("machine-chest-press");

    [Fact]
    public void A_chosen_picture_wins_over_the_default() =>
        ExerciseIllustrations.SlugFor(Named("Bröst maskin", "pec-deck")).ShouldBe("pec-deck");

    [Fact]
    public void No_picture_can_be_chosen() =>
        ExerciseIllustrations.SlugFor(Named("Bröst maskin", Exercise.NoIllustration)).ShouldBeNull();

    [Fact]
    public void An_unknown_name_or_picture_has_none()
    {
        ExerciseIllustrations.SlugFor(Named("Något nytt")).ShouldBeNull();
        ExerciseIllustrations.SlugFor(Named("Bröst maskin", "not-a-picture")).ShouldBeNull();
    }

    [Fact]
    public void Every_picture_in_the_catalog_has_its_three_frames_on_disk()
    {
        var folder = ExercisesFolder();
        ExerciseIllustrations.Catalog.Count.ShouldBe(302);
        var missing = ExerciseIllustrations.Catalog.Keys
            .SelectMany(ExerciseIllustrations.Frames)
            .Where(frame => !File.Exists(Path.Combine(folder, "..", frame)))
            .ToList();
        missing.ShouldBeEmpty();
    }

    [Fact]
    public void No_picture_carries_script_or_external_references()
    {
        var offending = Directory.GetFiles(ExercisesFolder(), "*.svg", SearchOption.AllDirectories)
            .Where(f => File.ReadAllText(f) is var svg
                && (svg.Contains("<script", StringComparison.OrdinalIgnoreCase)
                    || svg.Contains("href=", StringComparison.OrdinalIgnoreCase)
                    || svg.Contains("<foreignObject", StringComparison.OrdinalIgnoreCase)
                    || System.Text.RegularExpressions.Regex.IsMatch(svg, @"\son\w+=", System.Text.RegularExpressions.RegexOptions.IgnoreCase)))
            .ToList();
        offending.ShouldBeEmpty();
    }

    [Theory]
    [InlineData("plank", true)]
    [InlineData("none", true)]
    [InlineData("../etc/passwd", false)]
    [InlineData("Plank", false)]
    public void The_server_accepts_only_picture_names(string illustration, bool valid)
    {
        var id = Guid.NewGuid();
        var json = System.Text.Json.JsonSerializer.Serialize(new Exercise { Id = id, Name = "Plankan", Illustration = illustration }, Kropp.Shared.KroppJson.Options);

        var error = AggregateValidator.Validate(new SyncChange(AggregateTypes.Exercise, id, DateTimeOffset.UnixEpoch, false, json));

        (error is null).ShouldBe(valid);
    }
}
