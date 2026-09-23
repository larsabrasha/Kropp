using Bunit;
using Kropp.Client.Components;
using Kropp.Client.Pages;
using Kropp.Shared.Training;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class TemplatesPageTests : ClientTestContext
{
    private static readonly Exercise Bench = new() { Id = Guid.NewGuid(), Name = "Bröst maskin" };
    private static readonly Exercise Curl = new() { Id = Guid.NewGuid(), Name = "Biceps hantlar" };

    private async Task<WorkoutTemplate> SeedAsync()
    {
        await Repository.SaveAsync(Bench.Id, Bench);
        await Repository.SaveAsync(Curl.Id, Curl);
        var template = new WorkoutTemplate
        {
            Id = Guid.NewGuid(), Name = "Bröst",
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 60 }],
        };
        await Repository.SaveAsync(template.Id, template);
        return template;
    }

    private async Task<WorkoutTemplate> ReloadAsync(Guid id) => (await Repository.GetAsync<WorkoutTemplate>(id))!;

    [Fact]
    public void Without_templates_it_explains_how_to_make_one() =>
        Render<TemplatesPage>().WaitForElement("[data-testid=templates-empty]");

    [Fact]
    public async Task The_list_links_each_template_to_its_page()
    {
        var template = await SeedAsync();

        var list = Render<TemplatesPage>();

        var link = list.WaitForElement("[data-testid=templates] a");
        link.GetAttribute("href").ShouldBe($"templates/{template.Id}");
        link.TextContent.ShouldContain("Bröst maskin");
    }

    [Fact]
    public async Task A_template_is_edited_with_the_same_cards_as_a_workout_but_without_sets()
    {
        var template = await SeedAsync();
        var page = Render<TemplatePage>(p => p.Add(x => x.Id, template.Id));

        page.WaitForElement("[data-testid=exercise-entry]");
        page.FindComponent<ExerciseList>().Instance.ForTemplate.ShouldBeTrue();
        page.FindAll("[data-testid=sets]").ShouldBeEmpty();
        page.FindAll("[data-testid=context]").ShouldBeEmpty();

        page.Find("[data-testid=target]").Click();
        page.Find("[data-testid=target-editor]").QuerySelectorAll("[data-testid=stepper]")
            .Single(s => s.GetAttribute("data-label") == "kg").QuerySelector("[data-testid=increase]")!.Click();

        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 8 @ 62,5 kg"));
        (await ReloadAsync(template.Id)).Exercises.Single().TargetWeightKg.ShouldBe(62.5m);
    }

    [Fact]
    public async Task Exercises_are_added_reordered_and_the_template_renamed()
    {
        var template = await SeedAsync();
        var page = Render<TemplatePage>(p => p.Add(x => x.Id, template.Id));

        page.WaitForElement("[data-testid=add-exercise]").Click();
        page.Find("[data-testid=exercise-picker] input[type=search]").Input("biceps");
        page.Find("[data-testid=exercise-picker] li button").Click();
        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry] h3").Count.ShouldBe(2));

        await page.InvokeAsync(() => page.FindComponent<ExerciseList>().Instance.OnEntryReordered(1, 0));
        page.Find("input[type=text]").Change("Överkropp");

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry] h3").Select(h => h.TextContent).ShouldBe(["Biceps hantlar", "Bröst maskin"]));
        var saved = await ReloadAsync(template.Id);
        saved.Name.ShouldBe("Överkropp");
        saved.Exercises.Select(e => e.ExerciseId).ShouldBe([Curl.Id, Bench.Id]);
        saved.Exercises.ShouldAllBe(e => e.Sets.Count == 0);
    }

    [Fact]
    public async Task Deleting_asks_first_and_returns_to_the_list()
    {
        var template = await SeedAsync();
        var page = Render<TemplatePage>(p => p.Add(x => x.Id, template.Id));

        page.WaitForElements("button").Single(b => b.TextContent.Trim() == "Ta bort mallen").Click();
        page.Find("[role=alertdialog] button").Click();

        page.WaitForAssertion(() => Services.GetRequiredService<NavigationManager>().Uri.ShouldEndWith("/templates"));
        (await Repository.GetAsync<WorkoutTemplate>(template.Id)).ShouldBeNull();
    }

    [Fact]
    public void An_unknown_template_shows_not_found() =>
        Render<TemplatePage>(p => p.Add(x => x.Id, Guid.NewGuid())).WaitForElement("[data-testid=not-found]");
}
