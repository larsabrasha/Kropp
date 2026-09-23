using Bunit;
using Kropp.Client.Pages;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class TemplatesPageTests : ClientTestContext
{
    [Fact]
    public void Without_templates_it_explains_how_to_make_one() =>
        Render<TemplatesPage>().WaitForElement("[data-testid=templates-empty]");

    [Fact]
    public async Task A_template_can_be_renamed_and_deleted()
    {
        var bench = new Exercise { Id = Guid.NewGuid(), Name = "Bröst maskin" };
        await Repository.SaveAsync(bench.Id, bench);
        var template = new WorkoutTemplate { Id = Guid.NewGuid(), Name = "Bröst", Exercises = [new WorkoutExercise { ExerciseId = bench.Id }] };
        await Repository.SaveAsync(template.Id, template);
        var page = Render<TemplatesPage>();

        page.WaitForElement("[data-testid=templates] li").TextContent.ShouldContain("Bröst maskin");
        page.Find("[data-testid=templates] input").Change("Överkropp");
        page.WaitForAssertion(() => Repository.GetAllAsync<WorkoutTemplate>().Result.Single().Name.ShouldBe("Överkropp"));

        page.FindAll("[data-testid=templates] button").Single(b => b.TextContent.Trim() == "Ta bort").Click();
        page.FindAll("[data-testid=templates] button").First(b => b.TextContent.Trim() == "Ta bort").Click();

        page.WaitForElement("[data-testid=templates-empty]");
        (await Repository.GetAllAsync<WorkoutTemplate>()).ShouldBeEmpty();
    }
}
