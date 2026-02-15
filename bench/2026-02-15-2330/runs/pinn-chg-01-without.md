Now I have enough information. Let me provide a comprehensive mapping of all files and patterns needed for a new "Logistics" domain.

## Report

- **Tool calls**: 36
- **Tools used**: Read, Grep, Glob, Bash
- **Files read**: 26
- **Files used**: 
  - `Project/src/domain/cm/ServiceRegistrar.cs`
  - `Project/src/domain/cm/pinnacle.domain.cm.csproj`
  - `Project/src/domain/cm/Interface/IAssemblyCoreMarker.cs`
  - `Project/src/domain/cm/Shared/BaseDomain.cs`
  - `Project/src/domain/er/ServiceRegistrar.cs`
  - `Project/src/domain/er/pinnacle.domain.er.csproj`
  - `Project/src/domain/bi/ServiceRegistrar.cs`
  - `Project/src/domain/bi/pinnacle.domain.bi.csproj`
  - `Project/src/domain/bi/Shared/IAssemblyCoreMarker.cs`
  - `Project/src/domain/bi/Billing/InvoiceService.cs`
  - `Project/src/domain/model/pinnacle.domain.model.csproj`
  - `Project/src/domain/model/cm/ContainerVisit.cs`
  - `Project/src/repository/dapper/cmdb/BaseDapper.cs`
  - `Project/src/repository/dapper/cmdb/cmdb.csproj`
  - `Project/src/repository/dapper/cmdb/ServiceRegistrar.cs`
  - `Project/src/repository/dapper/cmdb/ContainerControlRepository.cs`
  - `Project/src/repository/dapper/erdb/BaseDapper.cs`
  - `Project/src/repository/dapper/erdb/ServiceRegistrar.cs`
  - `Project/src/repository/dapper/billingdb/billingdb.csproj`
  - `Project/src/repository/dapper/billingdb/ServiceRegistrar.cs`
  - `Project/src/web apps/api/Startup.cs`
  - `Project/src/web apps/api/pinnacle.api.csproj`
  - `Project/src/web apps/api/Controllers/v1/TransportV1Controller.cs`
  - `Project/src/web apps/api/appsettings.Development.json`
  - `Project/src/domain/er/Interface/IEventService.cs`
  - `Solution/PinnacleSystem.sln`

- **Key findings**:
  - **Domain Layer Pattern**: Each domain has `pinnacle.domain.{code}` project with `ServiceRegistrar.cs`, `Interface/`, `AggregateModels/` (or domain-specific folders), `Shared/BaseDomain.cs`, and `IAssemblyCoreMarker.cs`
  - **Repository Layer Pattern**: Each DB has `pinnacle.repository.dapper.{db}db` project with `BaseDapper.cs` (connection string), `ServiceRegistrar.cs`, and `*Repository.cs` files implementing `IService`
  - **Auto-registration**: Uses Scrutor `services.Scan()` with `IService` marker interface for DI
  - **Solution structure**: Domains reference `pinnacle.core` and `pinnacle.domain.model`; Repositories reference their domain project
  - **API registration**: `Startup.cs` calls `Register{Domain}Services()` and `Register{Db}Repository()` extension methods

---

# New Logistics Domain - Complete File Map

## 1. Domain Layer (`Project/src/domain/lg/`)

| File | Pattern Source | Purpose |
|------|----------------|---------|
| `pinnacle.domain.lg.csproj` | `pinnacle.domain.er.csproj` | Project file, references core, model, pdf |
| `ServiceRegistrar.cs` | `cm/ServiceRegistrar.cs` | `RegisterLogisticsServices()` extension method |
| `Interface/IAssemblyCoreMarker.cs` | `cm/Interface/IAssemblyCoreMarker.cs` | Empty marker interface for Scrutor assembly scanning |
| `Interface/ILogisticsService.cs` | `er/Interface/IEventService.cs` | Service contract defining business operations |
| `Shared/BaseDomain.cs` | `cm/Shared/BaseDomain.cs` | Base class with `ICacheService` injection |
| `AggregateModels/Logistics/LogisticsService.cs` | `bi/Billing/InvoiceService.cs` | Service implementation: `BaseDomain, IService, ILogisticsService` |
| `AggregateModels/Logistics/ILogisticsRepository.cs` | `cm/AggregateModels/Billing/IBillingRepository.cs` | Repository interface |

**csproj template:**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.Caching.Abstractions" Version="9.0.2" />
    <PackageReference Include="System.ComponentModel.Annotations" Version="5.0.0" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\..\core\common\pinnacle.core.csproj" />
    <ProjectReference Include="..\model\pinnacle.domain.model.csproj" />
    <ProjectReference Include="..\pdf\pinnacle.domain.Pdf.csproj" />
  </ItemGroup>
</Project>
```

## 2. Model Layer (`Project/src/domain/model/Logistics/`)

| File | Pattern Source | Purpose |
|------|----------------|---------|
| `LogisticsEntity.cs` | `model/cm/ContainerVisit.cs` | Entity classes with `[Table]`, `[Key]`, `[ExplicitKey]`, `[Write(false)]` attributes |

**Model pattern:**
```csharp
using Dapper.Contrib.Extensions;
namespace pinnacle.domain.model.Logistics
{
    [Table("LogisticsEntity")]
    public class LogisticsEntity
    {
        [ExplicitKey] public Guid Id { get; set; }
        public string Name { get; set; }
        [Write(false)] public RelatedEntity Related { get; set; }
    }
}
```

## 3. Repository Layer (`Project/src/repository/dapper/lgdb/`)

| File | Pattern Source | Purpose |
|------|----------------|---------|
| `lgdb.csproj` | `cmdb/cmdb.csproj` | Project file referencing Dapper + domain project |
| `BaseDapper.cs` | `erdb/BaseDapper.cs` | Connection to `LogisticsDbConnString` |
| `ServiceRegistrar.cs` | `erdb/ServiceRegistrar.cs` | `RegisterLogisticsRepository()` extension |
| `LogisticsRepository.cs` | `cmdb/ContainerControlRepository.cs` | Implements `ILogisticsRepository`, inherits `BaseDapper` |

**BaseDapper.cs template:**
```csharp
namespace pinnacle.repository.dapper.lgdb
{
    public abstract class BaseDapper
    {
        private readonly IConfiguration _configuration;
        public BaseDapper(IConfiguration configuration) =>
            _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));

        public IDbConnection Connection => new SqlConnection(
            _configuration.GetConnectionString("LogisticsDbConnString") 
            ?? _configuration["LogisticsDbConnString"]);

        public int DefaultCommandTimeOut => 
            int.TryParse(_configuration["DefaultCommandTimeOutInSeconds"], out int t) ? t : 60;
    }
}
```

**Repository pattern:**
```csharp
namespace pinnacle.repository.dapper.lgdb
{
    public class LogisticsRepository : BaseDapper, IService, ILogisticsRepository
    {
        public LogisticsRepository(IConfiguration config, IDepotService depot)
            : base(config) { /* ... */ }
    }
}
```

## 4. API Layer (`Project/src/web apps/api/`)

| File | Pattern Source | Purpose |
|------|----------------|---------|
| `Controllers/v1/LogisticsV1Controller.cs` | `Controllers/v1/TransportV1Controller.cs` | REST endpoints |

**Controller pattern:**
```csharp
[Authorize(AuthenticationSchemes = "PinnBearer,Bearer")]
[Produces("application/json")]
[Route("v1/logistics")]
[ApiController]
public class LogisticsV1Controller : BaseController
{
    private readonly ILogisticsService _logisticsService;
    // constructor injection...
}
```

## 5. Configuration Changes

| File | Change |
|------|--------|
| `appsettings.json` | Add `"LogisticsDbConnString": "Data Source=...;Initial Catalog=LogisticsDB;..."` |
| `appsettings.Development.json` | Add dev connection string |
| `Startup.cs` | Add: `services.RegisterLogisticsServices();` and `services.RegisterLogisticsRepository();` |
| `pinnacle.api.csproj` | Add: `<ProjectReference Include="..\..\domain\lg\pinnacle.domain.lg.csproj" />` and `<ProjectReference Include="..\..\repository\dapper\lgdb\lgdb.csproj" />` |

## 6. Solution File (`Solution/PinnacleSystem.sln`)

Add two project entries:
```
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "pinnacle.domain.lg", "..\Project\src\domain\lg\pinnacle.domain.lg.csproj", "{NEW-GUID-1}"
EndProject
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "lgdb", "..\Project\src\repository\dapper\lgdb\lgdb.csproj", "{NEW-GUID-2}"
EndProject
```

## 7. SQL Migrations (`Project/src/sql/`)

| File | Purpose |
|------|---------|
| `{ticket}.Logistics.sql` | CREATE TABLE, stored procedures, indexes for new domain |

---

## Summary Count

| Layer | New Files |
|-------|-----------|
| Domain (`lg/`) | 6-8 files |
| Model (`model/Logistics/`) | N entities |
| Repository (`lgdb/`) | 4+ files |
| API | 1+ controllers |
| Config | 4 file edits |
| Solution | 2 project references |
| SQL | Migration scripts |

**Total: ~15+ new files + 6 configuration/solution edits**
