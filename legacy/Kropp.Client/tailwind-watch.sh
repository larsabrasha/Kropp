#!/bin/zsh
# Rebuilds tailwind-output.css on every change, with the same CLI binary Tailwind.MSBuild uses.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
MSBUILD_VERSION=$(grep 'PackageVersion Include="Tailwind.MSBuild"' "$SCRIPT_DIR/../Directory.Packages.props" | sed 's/.*Version="\([^"]*\)".*/\1/')
TAILWIND_VERSION=$(grep '<TailwindVersion>' "$SCRIPT_DIR/Kropp.Client.csproj" | sed 's/.*<TailwindVersion>\([^<]*\)<.*/\1/')

TAILWIND_CLI=$(find "$HOME/.nuget/packages/tailwind.msbuild/$MSBUILD_VERSION/cli/$TAILWIND_VERSION" -name "tailwindcss-*" -type f 2>/dev/null | head -1)

if [ -z "$TAILWIND_CLI" ]; then
  echo "Could not find the tailwindcss binary for Tailwind.MSBuild $MSBUILD_VERSION / Tailwind $TAILWIND_VERSION. Build Kropp.Client once first."
  exit 1
fi

echo "Using: $TAILWIND_CLI"
exec "$TAILWIND_CLI" -i "$SCRIPT_DIR/tailwind-input.css" -o "$SCRIPT_DIR/wwwroot/tailwind-output.css" -w
