using System.Security.Cryptography;
using System.Text;

namespace Kropp.Import;

/// <summary>
/// A name-based GUID (RFC 4122 version 5 layout, SHA-1). The same exercise name or workout date
/// always gets the same id, so running the import twice updates rather than duplicates.
/// </summary>
internal static class DeterministicGuid
{
    private static readonly Guid Namespace = Guid.Parse("6f1c2b1e-3c3a-4f3e-9d0c-6b72f6a1c0de");

    public static Guid Create(string name)
    {
        var bytes = Namespace.ToByteArray(bigEndian: true).Concat(Encoding.UTF8.GetBytes(name)).ToArray();
        var hash = SHA1.HashData(bytes).AsSpan(0, 16).ToArray();
        hash[6] = (byte)((hash[6] & 0x0F) | 0x50);
        hash[8] = (byte)((hash[8] & 0x3F) | 0x80);
        return new Guid(hash, bigEndian: true);
    }
}
