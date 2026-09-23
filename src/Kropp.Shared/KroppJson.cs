using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kropp.Shared;

/// <summary>
/// The one set of serializer options for aggregate documents. The client writes documents with
/// these and the server validates them with the same, so both read the stored JSON alike.
/// </summary>
public static class KroppJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
