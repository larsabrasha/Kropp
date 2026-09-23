using System.Net;
using Shouldly;

namespace Kropp.IntegrationTests;

[Collection(ApiCollection.Name)]
public sealed class HostingTests(KroppApiFixture api)
{
    private readonly HttpClient http = api.CreateClient();

    [Fact]
    public async Task The_root_serves_the_app_shell()
    {
        var html = await http.GetStringAsync("/");

        html.ShouldContain("manifest.webmanifest");
        html.ShouldContain("apple-mobile-web-app-capable");
    }

    [Fact]
    public async Task The_framework_scripts_the_shell_names_are_served()
    {
        var html = await http.GetStringAsync("/");
        var script = System.Text.RegularExpressions.Regex.Match(html, "_framework/blazor\\.webassembly[^\"]*\\.js").Value;

        script.ShouldNotBeNullOrEmpty();
        (await http.GetAsync(script)).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await http.GetAsync("/service-worker.js")).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await http.GetAsync("/js/kropp-db.js")).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_deep_link_serves_the_app_shell_too() =>
        (await http.GetStringAsync("/workouts/some-id")).ShouldContain("<div id=\"app\">");

    [Fact]
    public async Task An_unknown_api_path_is_a_404_not_the_app_shell() =>
        (await http.GetAsync("/api/nope")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
}
