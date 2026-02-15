Found it - Scrutor is in the core project. Now I have the complete picture.

## DI Registration Chain Summary

Here's the complete dependency injection wiring from `Startup.cs` to domain services in controllers:

### 1. Entry Point: Program.cs → Startup.cs
```
Program.cs → CreateHostBuilder() → webBuilder.UseStartup<Startup>()
```

### 2. Startup.ConfigureServices() Registration Calls (lines 55-67)
```csharp
// Services (Domain Layer)
services.RegisterCoreServices();           // pinnacle.core
services.RegisterServices();                // pinnacle.domain (pinn)
services.RegisterCmServices();              // pinnacle.domain.cm
services.RegisterBillingServices();         // pinnacle.domain.bi
services.RegisterEventReportingServices();  // pinnacle.domain.er
services.RegisterDataWarehouseServices();   // pinnacle.domain.dw

// Repositories (Dapper Layer)
services.RegisterCmRepository();            // cmdb
services.RegisterDapperRepository();        // pinndb
services.RegisterEventReportingRepository();// erdb
services.RegisterBillingRepository();       // billingdb
services.RegisterDataWarehouseRepository(); // dwdb
```

### 3. ServiceRegistrar Pattern (All use Scrutor assembly scanning)

Each module has a `ServiceRegistrar.cs` with extension methods using **Scrutor**:

**Domain Services** (e.g., `pinnacle.domain.cm/ServiceRegistrar.cs`):
```csharp
services.Scan(scan => scan
    .FromAssemblyOf<IAssemblyCoreMarker>()     // Assembly marker interface
    .AddClasses(classes => classes.AssignableTo<IService>())  // Filter: implements IService
    .AsImplementedInterfaces()                  // Register as IXxxService
    .WithScopedLifetime());                     // Scoped per HTTP request
```

**Repositories** (e.g., `pinnacle.repository.dapper.cmdb/ServiceRegistrar.cs`):
```csharp
services.Scan(scan => scan
    .FromAssemblyOf<BaseDapper>()              // Assembly marker class
    .AddClasses(classes => classes.AssignableTo<IService>())
    .AsImplementedInterfaces()
    .WithScopedLifetime());
```

### 4. Marker Interfaces

| Layer | Marker | Location |
|-------|--------|----------|
| Core | `IAssemblyCoreMarker` | `pinnacle.core.Interface` |
| Domain CM | `IAssemblyCoreMarker` | `pinnacle.domain.cm.Interface` |
| Domain Pinn | `IAssemblyCoreMarker` | `pinnacle.domain.Interface` |
| Repository CM | `BaseDapper` | `pinnacle.repository.dapper.cmdb` |

### 5. Service Interface Contract

`pinnacle.core.Interface.IService`:
```csharp
public interface IService { }  // Empty marker interface
```

### 6. Example: TransportService Registration Flow

```
1. TransportService implements:
   - IService (marker for Scrutor)
   - ITransportService (functional interface)

2. Scrutor scan finds TransportService
   - FromAssemblyOf<IAssemblyCoreMarker>() in cm assembly
   - Matches: AssignableTo<IService>()
   - Registers: ITransportService → TransportService (Scoped)

3. Controller receives via constructor injection:
   public TransportV1Controller(ITransportService transportService, ...)
```

### 7. Service → Repository Injection Chain

```
TransportV1Controller
    ↓ (ITransportService)
TransportService : IService, ITransportService
    ↓ (ITransportRepository)
TransportRepository : BaseDapper, IService, ITransportRepository
    ↓ (IConfiguration)
BaseDapper (creates SqlConnection)
```

### Key Architecture Points

1. **Convention-based registration** - Any class implementing `IService` in the assembly is auto-registered
2. **All services are Scoped** - New instance per HTTP request
3. **Interface-first** - Services registered as their interfaces (`AsImplementedInterfaces()`)
4. **Scrutor** package (`pinnacle.core.csproj` line 17) enables assembly scanning
5. **Separate registration per domain** - Each bounded context (cm, er, dw, bi, pinn) registers independently

## Report

- **Tool calls**: 25
- **Tools used**: Glob, Grep, Read
- **Files read**: 14
- **Files used**: `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/web apps/api/Program.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/web apps/api/Startup.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/core/common/ServiceRegistrar.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/ServiceRegistrar.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/pinn/ServiceRegistrar.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/bi/ServiceRegistrar.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/repository/dapper/cmdb/ServiceRegistrar.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/repository/dapper/billingdb/ServiceRegistrar.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/core/common/Interface/IService.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/Interface/IAssemblyCoreMarker.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/web apps/api/Controllers/v1/TransportV1Controller.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/AggregateModels/Transport/TransportService.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/repository/dapper/cmdb/TransportRepository.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/repository/dapper/cmdb/BaseDapper.cs`, `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/core/common/pinnacle.core.csproj`
- **Key findings**:
  - Uses **Scrutor** for convention-based assembly scanning (not manual registration)
  - Empty `IService` marker interface identifies all injectable services/repositories
  - `IAssemblyCoreMarker` / `BaseDapper` define assembly boundaries for scanning
  - All services registered as **Scoped** lifetime (per HTTP request)
  - Each bounded context (cm, pinn, er, dw, bi) has its own `ServiceRegistrar.cs`
  - Repositories and services use identical registration pattern - both implement `IService`
  - `BaseDapper` provides `IDbConnection` via `IConfiguration` connection strings
