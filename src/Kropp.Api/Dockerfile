# Build from src/:  docker build -f Kropp.Api/Dockerfile -t kropp-api .
# The migration service is not in this image; run it before the API (see AppHost.cs for the order).

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
USER $APP_UID
EXPOSE 8080

# Pinned to the SDK global.json asks for; the floating 10.0 tag moves past that band.
FROM mcr.microsoft.com/dotnet/sdk:10.0.201 AS build
WORKDIR /src
COPY ["global.json", "Directory.Build.props", "Directory.Packages.props", "./"]
COPY ["Kropp.Api/Kropp.Api.csproj", "Kropp.Api/"]
COPY ["Kropp.Client/Kropp.Client.csproj", "Kropp.Client/"]
COPY ["Kropp.Data/Kropp.Data.csproj", "Kropp.Data/"]
COPY ["Kropp.ServiceDefaults/Kropp.ServiceDefaults.csproj", "Kropp.ServiceDefaults/"]
COPY ["Kropp.Shared/Kropp.Shared.csproj", "Kropp.Shared/"]
RUN dotnet restore "Kropp.Api/Kropp.Api.csproj"
COPY . .
RUN dotnet publish "Kropp.Api/Kropp.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Kropp.Api.dll"]
