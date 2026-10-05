# Build from src/:  docker build -t kropp .
#
# One image holds both programs, so the API and its migrations always come from the same commit:
#   /app         the API, which also serves the client (the default entrypoint)
#   /migrations  the migration service; run it to completion before the API (see docker-compose.yaml)

# The build stage runs on the builder's own platform: both programs are framework-dependent and
# portable (no runtime identifier, no apphost), so only the final stage differs per architecture.
# Pinned to the SDK global.json asks for; the floating 10.0 tag moves past that band.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0.201 AS build
WORKDIR /src
COPY ["global.json", "Directory.Build.props", "Directory.Packages.props", "./"]
COPY ["Kropp.Api/Kropp.Api.csproj", "Kropp.Api/"]
COPY ["Kropp.Client/Kropp.Client.csproj", "Kropp.Client/"]
COPY ["Kropp.Data/Kropp.Data.csproj", "Kropp.Data/"]
COPY ["Kropp.MigrationService/Kropp.MigrationService.csproj", "Kropp.MigrationService/"]
COPY ["Kropp.ServiceDefaults/Kropp.ServiceDefaults.csproj", "Kropp.ServiceDefaults/"]
COPY ["Kropp.Shared/Kropp.Shared.csproj", "Kropp.Shared/"]
RUN dotnet restore "Kropp.Api/Kropp.Api.csproj" \
 && dotnet restore "Kropp.MigrationService/Kropp.MigrationService.csproj"
COPY . .
RUN dotnet publish "Kropp.Api/Kropp.Api.csproj" -c Release --no-restore -o /out/app /p:UseAppHost=false \
 && dotnet publish "Kropp.MigrationService/Kropp.MigrationService.csproj" -c Release --no-restore -o /out/migrations /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
COPY --from=build /out/migrations /migrations
COPY --from=build /out/app /app
WORKDIR /app
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Kropp.Api.dll"]
