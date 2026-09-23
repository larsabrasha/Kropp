namespace Kropp.Client.Components;

/// <summary>
/// One look for every choice chip: template choices and categories alike. Chosen is filled with
/// the accent and white text; not chosen is white with a border that holds against a tinted card.
/// Both states have the same border and weight, so choosing never changes a chip's size.
/// </summary>
public static class ChipStyle
{
    public static string For(bool on) =>
        "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed "
        + (on
            ? "border-accent-600 bg-accent-600 text-white"
            : "border-gray-400 bg-white text-gray-800 hover:bg-gray-100 dark:border-gray-500 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800");
}
