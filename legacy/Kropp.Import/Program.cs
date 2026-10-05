using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Kropp.Import;
using Kropp.Shared;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;

// Usage: dotnet run --project src/Kropp.Import -- <folder with CSV files> [--server URL] [--push] [--overwrite]
//
// Without --push nothing is sent: the run only reports what it would import. Every change is
// stamped 2020-01-01, older than anything the app writes, so a second run is refused by the server
// and never overwrites an edit made in the app since. --overwrite stamps with the current time
// instead, for when the import itself was wrong and must replace what it wrote.

CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = new CultureInfo("sv-SE");

var folder = args.FirstOrDefault(a => !a.StartsWith("--"));
var server = args.SkipWhile(a => a != "--server").Skip(1).FirstOrDefault() ?? "http://localhost:5260/";
var push = args.Contains("--push");
var overwrite = args.Contains("--overwrite");

if (folder is null || !Directory.Exists(folder))
{
    Console.Error.WriteLine("Ange mappen med CSV-filerna (Numbers → Arkiv → Exportera till → CSV).");
    return 2;
}

var report = new ImportReport();
var rows = Directory.GetFiles(folder, "*.csv")
    .OrderBy(f => f, StringComparer.Ordinal)
    .SelectMany(f => NumbersImport.ReadSheet(Path.GetFileNameWithoutExtension(f), File.ReadAllText(f), report))
    .ToList();

using var http = new HttpClient { BaseAddress = new Uri(server.EndsWith('/') ? server : server + "/") };

var existing = new List<SyncRecord>();
try
{
    for (long since = 0; ;)
    {
        var page = await http.GetFromJsonAsync<PullResponse>($"api/sync/pull?since={since}") ?? throw new InvalidOperationException("Empty pull.");
        existing.AddRange(page.Changes);
        since = page.ServerSeq;
        if (!page.HasMore) break;
    }
}
catch (HttpRequestException ex)
{
    Console.Error.WriteLine($"Kommer inte åt servern på {server}: {ex.Message}");
    return 1;
}

var existingExercises = existing
    .Where(r => r.Type == AggregateTypes.Exercise && !r.IsDeleted && r.Data is not null)
    .Select(r => JsonSerializer.Deserialize<Exercise>(r.Data!, KroppJson.Options)!)
    .GroupBy(e => e.Name.Trim(), StringComparer.OrdinalIgnoreCase)
    .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
var existingWorkouts = existing
    .Where(r => r.Type == AggregateTypes.Workout && !r.IsDeleted && r.Data is not null)
    .Select(r => JsonSerializer.Deserialize<Workout>(r.Data!, KroppJson.Options)!)
    .ToList();

var result = NumbersImport.Build(rows, existingExercises, DateOnly.FromDateTime(DateTime.Now), report);

Console.WriteLine($"Rader lästa:        {report.RowsRead}");
Console.WriteLine($"Pass:               {result.Workouts.Count} ({string.Join(", ", result.Workouts.GroupBy(w => w.Status).Select(g => $"{g.Count()} {g.Key}"))})");
Console.WriteLine($"Nya övningar:       {result.Exercises.Count} (plus {existingExercises.Count} som redan finns och återanvänds)");
Console.WriteLine($"Set:                {result.Workouts.Sum(w => w.Exercises.Sum(e => e.Sets.Count))}");
Print("Hoppade över rader", report.SkippedRows);
Print("Kopierade planer som ignoreras", report.DroppedCopies);
Print("Datum från flera blad som slagits ihop", report.MergedDates);
Print("Namn som slagits ihop", [.. report.MergedNames.Distinct()]);
Print("Kommentarer som inte tolkats (sparas som text, seten räknas som planerat)", report.CommentsKeptAsText);

var importedIds = result.Workouts.Select(w => w.Id).ToHashSet();
var sameDay = existingWorkouts.Where(w => !importedIds.Contains(w.Id) && result.Workouts.Any(i => i.Date == w.Date)).ToList();
Print("Pass i appen som ligger på samma datum som ett importerat (ta bort dem i appen om de är testpass)",
    [.. sameDay.Select(w => $"{w.Date:yyyy-MM-dd} {w.Note}")]);

Console.WriteLine();
foreach (var e in result.Exercises)
    Console.WriteLine($"  {e.Kind,-10} {e.Name}");

if (!push)
{
    Console.WriteLine();
    Console.WriteLine("Torrkörning. Kör igen med --push för att skicka till servern.");
    return 0;
}

var stamp = overwrite ? SyncClock.Now() : new DateTimeOffset(2020, 1, 1, 0, 0, 0, TimeSpan.Zero);
var changes = result.Exercises
    .Select(e => new SyncChange(AggregateTypes.Exercise, e.Id, stamp, false, JsonSerializer.Serialize(e, KroppJson.Options)))
    .Concat(result.Workouts.Select(w => new SyncChange(AggregateTypes.Workout, w.Id, stamp, false, JsonSerializer.Serialize(w, KroppJson.Options))))
    .ToList();

var rejected = 0;
foreach (var batch in changes.Chunk(SyncLimits.MaxChangesPerPush))
{
    using var response = await http.PostAsJsonAsync("api/sync/push", new PushRequest(batch));
    if (!response.IsSuccessStatusCode)
    {
        Console.Error.WriteLine($"Servern avvisade en batch: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return 1;
    }
    rejected += (await response.Content.ReadFromJsonAsync<PushResponse>())!.Rejected.Count;
}

Console.WriteLine();
Console.WriteLine($"Skickat: {changes.Count - rejected} sparade, {rejected} fanns redan (ändrade i appen eller importerade förut).");
return 0;

static void Print(string title, IReadOnlyList<string> lines)
{
    if (lines.Count == 0) return;
    Console.WriteLine();
    Console.WriteLine($"{title} ({lines.Count}):");
    foreach (var line in lines.Take(40)) Console.WriteLine($"  {line}");
    if (lines.Count > 40) Console.WriteLine($"  … och {lines.Count - 40} till");
}
