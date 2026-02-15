Now I have enough information to provide a comprehensive analysis. Let me compile the full mapping.

---

## New Domain "Logistics" - Complete Implementation Map

Based on analysis of existing CM, ER, and BI domains, here's the full set of files and patterns needed:

---

### 1. Domain Layer

**Path:** `Project/src/domain/lg/`

| File | Purpose | Pattern From |
|------|---------|--------------|
| `pinnacle.domain.lg.csproj` | Project file | `cm/pinnacle.domain.cm.csproj` |
| `ServiceRegistrar.cs` | DI registration for services | `cm/ServiceRegistrar.cs` |
| `Interface/IAssemblyCoreMarker.cs` | Assembly marker for DI scanning | `cm/Interface/IAssemblyCoreMarker.cs` |
| `Interface/ILogisticsService.cs` | Service interface | `cm/Interface/IContainerControlService.cs` |
| `Shared/BaseDomain.cs` | Base class with caching | `bi/Shared/BaseDomain.cs` |
| `AggregateModels/ILogisticsRepository.cs` | Repository interface | `cm/AggregateModels/IContainerManagementRepository.cs` |
| `AggregateModels/LogisticsService.cs` | Service implementation | `cm/AggregateModels/ContainerManagementService.cs` |
| `EmailBuilder/` | Email templates (optional) | `cm/EmailBuilder/` |

**csproj Template:**
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
    <ProjectReference Include="..\..\vendor\qube\qube.csproj" />
    <ProjectReference Include="..\model\pinnacle.domain.model.csproj" />
    <ProjectReference Include="..\pdf\pinnacle.domain.Pdf.csproj" />
  </ItemGroup>
</Project>
```

**ServiceRegistrar Template:**
```csharp
using Microsoft.Extensions.DependencyInjection;
using pinnacle.core.Interface;
using IAssemblyCoreMarker = pinnacle.domain.lg.Interface.IAssemblyCoreMarker;

namespace pinnacle.domain.lg
{
    public static class ServiceRegistrar
    {
        public static void RegisterLogisticsServices(this IServiceCollection services)
        {
            services.Scan(scan => scan
                  .FromAssemblyOf<IAssemblyCoreMarker>()
                  .AddClasses(classes => classes.AssignableTo<IService>())
                  .AsImplementedInterfaces()
                  .WithScopedLifetime());
        }
    }
}
```

---

### 2. Domain Models

**Path:** `Project/src/domain/model/Logistics/`

| File | Purpose | Pattern From |
|------|---------|--------------|
| `LogisticsEntity.cs` | Entity model with Dapper attributes | `model/cm/ContainerVisit.cs` |
| `LogisticsTransaction.cs` | Transaction model | `model/cm/*.cs` |

**Model Pattern:**
```csharp
using Dapper.Contrib.Extensions;
using System;

namespace pinnacle.domain.model.lg
{
    [Table("LogisticsEntity")]
    public class LogisticsEntity
    {
        [ExplicitKey]
        public Guid Id { get; set; }
        public string Code { get; set; }
        public string Description { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public string CreatedBy { get; set; }
        public bool Deleted { get; set; }
    }
}
```

---

### 3. Repository Layer (Dapper)

**Path:** `Project/src/repository/dapper/lgdb/`

| File | Purpose | Pattern From |
|------|---------|--------------|
| `lgdb.csproj` | Project file | `cmdb/cmdb.csproj` |
| `BaseDapper.cs` | Connection management | `cmdb/BaseDapper.cs` |
| `ServiceRegistrar.cs` | DI registration for repositories | `cmdb/ServiceRegistrar.cs` |
| `LogisticsRepository.cs` | Repository implementation | `cmdb/ContainerControlRepository.cs` |
| `DapperBatchExtensions.cs` | Batch operations (if needed) | `cmdb/DapperBatchExtensions.cs` |

**csproj Template:**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
    <RootNamespace>pinnacle.repository.dapper.lgdb</RootNamespace>
    <Company>Pinnacle Corporation Ltd</Company>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Dapper" Version="2.1.66" />
    <PackageReference Include="Dapper.Contrib" Version="2.0.78" />
    <PackageReference Include="Dapper.Rainbow" Version="2.1.66" />
    <PackageReference Include="Dapper.SqlBuilder" Version="2.1.66" />
    <PackageReference Include="System.Data.SqlClient" Version="4.9.0" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\..\..\domain\lg\pinnacle.domain.lg.csproj" />
    <ProjectReference Include="..\..\..\domain\pinn\pinnacle.domain.csproj" />
  </ItemGroup>
</Project>
```

**BaseDapper Template:**
```csharp
using Microsoft.Extensions.Configuration;
using System;
using System.Data;
using System.Data.SqlClient;

namespace pinnacle.repository.dapper.lgdb
{
    public abstract class BaseDapper
    {
        private readonly IConfiguration _configuration;
        public BaseDapper(IConfiguration configuration)
        {
            _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        }

        public IDbConnection Connection => GetConnection();

        private IDbConnection GetConnection()
        {
            string connStr = _configuration.GetConnectionString("LogisticsDbConnString");
            if (string.IsNullOrEmpty(connStr))
                connStr = _configuration["LogisticsDbConnString"];
            return new SqlConnection(connStr);
        }

        public int DefaultCommandTimeOut
        {
            get
            {
                if (int.TryParse(_configuration["DefaultCommandTimeOutInSeconds"], out int timeOut))
                    return timeOut;
                return 60;
            }
        }
    }
}
```

**ServiceRegistrar Template:**
```csharp
using Microsoft.Extensions.DependencyInjection;
using pinnacle.core.Interface;

namespace pinnacle.repository.dapper.lgdb
{
    public static class ServiceRegistrar
    {
        public static void RegisterLogisticsRepository(this IServiceCollection services)
        {
            services.Scan(scan => scan
                  .FromAssemblyOf<BaseDapper>()
                  .AddClasses(classes => classes.AssignableTo<IService>())
                  .AsImplementedInterfaces()
                  .WithScopedLifetime());
        }
    }
}
```

---

### 4. API Layer

**Path:** `Project/src/web apps/api/Controllers/v1/`

| File | Purpose | Pattern From |
|------|---------|--------------|
| `LogisticsV1Controller.cs` | REST endpoints | `EventV1Controller.cs` |

**Controller Pattern:**
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using pinnacle.api.Controllers;
using pinnacle.domain.lg.Interface;

namespace pinnacle.api.Controllers.v1
{
    [Authorize(AuthenticationSchemes = "PinnBearer,Bearer")]
    [Produces("application/json")]
    [Route("v1")]
    [ApiController]
    public class LogisticsV1Controller : BaseController
    {
        private readonly ILogisticsService _logisticsService;

        public LogisticsV1Controller(
            ILogisticsService logisticsService,
            /* other deps */)
            : base(/* base deps */)
        {
            _logisticsService = logisticsService;
        }

        [HttpGet("logistics")]
        public async Task<IActionResult> GetLogistics()
        {
            // implementation
        }
    }
}
```

---

### 5. API Project Reference

**File:** `Project/src/web apps/api/pinnacle.api.csproj`

**Add:**
```xml
<ItemGroup>
  <ProjectReference Include="..\..\domain\lg\pinnacle.domain.lg.csproj" />
  <ProjectReference Include="..\..\repository\dapper\lgdb\lgdb.csproj" />
</ItemGroup>
```

---

### 6. Startup Registration

**File:** `Project/src/web apps/api/Startup.cs`

**Add using statements:**
```csharp
using pinnacle.domain.lg;
using pinnacle.repository.dapper.lgdb;
```

**Add in ConfigureServices():**
```csharp
services.RegisterLogisticsServices();
services.RegisterLogisticsRepository();
```

---

### 7. Solution File

**File:** `Solution/PinnacleSystem.sln`

**Add entries:**
```
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "pinnacle.domain.lg", "..\Project\src\domain\lg\pinnacle.domain.lg.csproj", "{NEW-GUID-1}"
EndProject
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "lgdb", "..\Project\src\repository\dapper\lgdb\lgdb.csproj", "{NEW-GUID-2}"
EndProject
```

---

### 8. Configuration

**File:** `Project/src/web apps/api/appsettings.json`

**Add connection string:**
```json
{
  "ConnectionStrings": {
    "LogisticsDbConnString": "Server=...;Database=LogisticsDB;..."
  }
}
```

---

### 9. SQL Migrations

**Path:** `Project/src/sql/`

**Naming convention:** `{TICKET}.Logistics.sql`

Examples:
- `3444.Logistics.sql` - Initial schema
- `3450.Logistics.sql` - Add columns/tables

---

### 10. React Frontend (if needed)

**Path:** `Project/src/web apps/react-web-external/src/app/logistics/`

| File/Pattern | Purpose |
|--------------|---------|
| `LogisticsScreen.tsx` | Main screen component |
| `hooks/useLogistics.ts` | Data fetching hook |
| `components/LogisticsForm.tsx` | Form component |
| `logisticsConfig.tsx` | Grid/form configuration |
| `logisticsApi.ts` | API client |

---

### 11. Angular Frontend (if needed)

**Path:** `Project/src/web apps/mypinnacle/src/app/main/apps/logistics/`

| File | Purpose |
|------|---------|
| `logistics.module.ts` | Feature module |
| `logistics.component.ts` | Main component |
| `logistics.service.ts` | API service |
| `logistics-routing.module.ts` | Routing |

---

## Summary Checklist

| Layer | Files Needed |
|-------|-------------|
| Domain | 6-8 files (csproj, ServiceRegistrar, interfaces, services) |
| Models | 1+ files per entity |
| Repository | 4+ files (csproj, BaseDapper, ServiceRegistrar, repositories) |
| API | 1+ controllers |
| Config | appsettings.json, Startup.cs |
| Solution | 2 project entries |
| SQL | Migrations as needed |
| Frontend | 4-6 files per screen (React) or 4+ files per feature (Angular) |

---

## Report

- **Tool calls**: 38
- **Tools used**: Read, Glob, Bash
- **Files read**: 22
- **Files used**: 
  - `Project/src/domain/cm/pinnacle.domain.cm.csproj`
  - `Project/src/domain/cm/ServiceRegistrar.cs`
  - `Project/src/domain/cm/Interface/IAssemblyCoreMarker.cs`
  - `Project/src/domain/cm/Interface/IContainerControlService.cs`
  - `Project/src/domain/cm/AggregateModels/IContainerManagementRepository.cs`
  - `Project/src/domain/cm/AggregateModels/ContainerManagementService.cs`
  - `Project/src/domain/er/pinnacle.domain.er.csproj`
  - `Project/src/domain/er/ServiceRegistrar.cs`
  - `Project/src/domain/bi/pinnacle.domain.bi.csproj`
  - `Project/src/domain/bi/ServiceRegistrar.cs`
  - `Project/src/domain/bi/Shared/IAssemblyCoreMarker.cs`
  - `Project/src/domain/model/cm/ContainerVisit.cs`
  - `Project/src/repository/dapper/cmdb/cmdb.csproj`
  - `Project/src/repository/dapper/cmdb/ServiceRegistrar.cs`
  - `Project/src/repository/dapper/cmdb/BaseDapper.cs`
  - `Project/src/repository/dapper/erdb/erdb.csproj`
  - `Project/src/repository/dapper/erdb/ServiceRegistrar.cs`
  - `Project/src/repository/dapper/erdb/BaseDapper.cs`
  - `Project/src/repository/dapper/billingdb/billingdb.csproj`
  - `Project/src/repository/dapper/billingdb/ServiceRegistrar.cs`
  - `Project/src/repository/dapper/billingdb/BaseDapper.cs`
  - `Project/src/web apps/api/Startup.cs`
  - `Project/src/web apps/api/pinnacle.api.csproj`
  - `Project/src/web apps/api/Controllers/v1/EventV1Controller.cs`
  - `Solution/PinnacleSystem.sln`
- **Key findings**:
  - Domain layer follows DDD with `Interface/`, `AggregateModels/`, `Shared/`, `EmailBuilder/` folders
  - Each domain has `ServiceRegistrar.cs` using Scrutor for auto-DI registration via `IAssemblyCoreMarker` and `IService`
  - Repository layer uses abstract `BaseDapper` class with connection string per database
  - API Startup.cs registers domain services and repositories via extension methods
  - Solution file organizes projects under `domain/` and `repository/dapper/` folders
  - SQL migrations use `{TICKET}.{DatabaseName}.sql` naming convention
  - Models use Dapper.Contrib attributes: `[Table]`, `[ExplicitKey]`, `[Write(false)]`, `[Computed]`
