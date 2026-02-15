Now I have a comprehensive understanding of the caching architecture. Let me provide a detailed explanation.

---

## Pinnacle Caching Layer Architecture

Boss, here's a comprehensive breakdown of the caching layer in the Pinnacle system:

### Architecture Overview

The Pinnacle system implements a **distributed caching layer** using **Redis** as the backing store. The architecture follows a **layered abstraction pattern** with two parallel implementations:

1. **Modern .NET Core API** (`Pinnacle System/Project/src/`) - ASP.NET Core with DI-based caching
2. **Legacy MVC Application** (`PinnacleIntegratedSystem/`) - Unity container-based caching

---

### Key Components

#### 1. **Interface Layer** (`ICacheService`)
Location: `src/core/common/Interface/ICacheService.cs`

```csharp
public interface ICacheService
{
    // Async operations
    Task SaveToCacheAsync<T>(string key, T item);
    Task<T> RetrieveFromCacheAsync<T>(string key);
    Task RemoveFromCacheAsync(string key);
    Task RemoveKeysAsync(string startsWith);
    Task<bool> ExistsAsync(string key);
    Task<long> IncrementAsync(string key, long value = 1);
    
    // Sync operations
    void SaveToCache<T>(string key, T item);
    T RetrieveFromCache<T>(string key);
    void RemoveFromCache(string key);
    bool Exists(string key);
    long Increment(string key, long value = 1);
}
```

#### 2. **Redis-Specific Abstraction** (`pinnacle.core.caching.redis`)
Location: `PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/`

| Component | Purpose |
|-----------|---------|
| `ICacheStore` | Low-level Redis operations interface |
| `RedisCacheStore` | Concrete Redis implementation using StackExchange.Redis |
| `RedisConnectionProvider` | Manages ConnectionMultiplexer lifecycle |
| `RedisSettings` | Configuration container (connection string, DB, timeout) |
| `ICacheStoreSettings` | Settings interface for flexibility |

#### 3. **Concrete Implementation** (`CacheService`)
Location: `src/core/common/service/CacheService.cs`

```csharp
public class CacheService : ICacheService
{
    private readonly IDatabase _cache;
    private const int DefaultExpirationInMinutes = 60;
    private static Lazy<ConnectionMultiplexer> lazyConnection;
    
    // Serializes objects to JSON before storing
    // Uses StackExchange.Redis for all operations
}
```

---

### Configuration

#### Redis Configuration (Docker)
Location: `docker-compose.redis.yml`

```yaml
services:
  redis:
    image: redis:7.2-alpine
    ports: "6379:6379"
    command: redis-server --appendonly yes --databases 16
    # App uses DB 10 (configured via Redis:DefaultDb)
```

#### App Configuration
```json
{
  "Redis": {
    "ConnectionString": "localhost:6379",
    "DefaultDb": "10"
  }
}
```

---

### Data Flow: API Request → Redis Storage

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           API REQUEST FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. HTTP Request                                                         │
│     ↓                                                                    │
│  ┌──────────────────────┐                                               │
│  │   API Controller     │  (e.g., AccountV1Controller)                  │
│  │  - Injects ICacheService via DI                                      │
│  │  - Also injects domain services                                      │
│  └──────────┬───────────┘                                               │
│             ↓                                                            │
│  ┌──────────────────────┐                                               │
│  │   Domain Service     │  (e.g., LookupService, CustomerService)       │
│  │  - Extends BaseDomain │                                               │
│  │  - Accesses Cache property                                           │
│  └──────────┬───────────┘                                               │
│             ↓                                                            │
│  ┌──────────────────────┐                                               │
│  │   BaseDomain         │  Abstract base class                          │
│  │  protected ICacheService Cache { get; }                              │
│  └──────────┬───────────┘                                               │
│             ↓                                                            │
│  ┌──────────────────────┐                                               │
│  │   CacheService       │  Implementation                               │
│  │  - Check cache first │  (Cache-Aside pattern)                        │
│  │  - If miss: query DB │                                               │
│  │  - Store in cache    │                                               │
│  └──────────┬───────────┘                                               │
│             ↓                                                            │
│  ┌──────────────────────┐                                               │
│  │   StackExchange.Redis│                                               │
│  │  - ConnectionMultiplexer (singleton, lazy)                           │
│  │  - IDatabase (DB 10) │                                               │
│  └──────────┬───────────┘                                               │
│             ↓                                                            │
│  ┌──────────────────────┐                                               │
│  │   Redis Server       │  localhost:6379, DB 10                        │
│  │  - JSON serialized storage                                           │
│  │  - TTL: 60 min default                                               │
│  └──────────────────────┘                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Caching Patterns Used

#### 1. **Cache-Aside (Lazy Loading)**
Domain services implement this pattern:

```csharp
// Example from ContainerManagementService.cs
public Grade GetGrade(string code)
{
    string cKey = $"cm:grade-{code}";
    if (Cache.Exists(cKey))
    {
        return Cache.RetrieveFromCache<Grade>(cKey);  // Cache HIT
    }
    else
    {
        var d = _repository.FindGrade(code);          // Query DB
        if (d != null)
            Cache.SaveToCache(cKey, d);               // Populate cache
        return d;
    }
}
```

#### 2. **Cache Invalidation on Write**
```csharp
// Example from CustomerService.cs
public async Task<bool> UpdateCustomerAsync(Customer item)
{
    var success = await _repository.UpdateCustomerAsync(item);
    if (success)
    {
        string ckey = $"{cachePrefix}getcustomer:{item.Code}";
        await Cache.RemoveFromCacheAsync(ckey);  // Invalidate on update
    }
    return success;
}
```

#### 3. **Pattern-Based Cache Clearing**
```csharp
// Example from LookupService.cs
public async Task SaveValueAsync(LookupValueBase item)
{
    _ = Cache.RemoveKeysAsync(cachePrefix);  // Clear all keys starting with prefix
    await _repository.InsertValueAsync(item);
}
```

---

### Key Naming Conventions

| Domain Service | Key Pattern | Example |
|----------------|-------------|---------|
| `ContainerManagementService` | `cm:{entity}-{id}` | `cm:grade-GRADE01`, `cm:isocode-22G1` |
| `LookupService` | `lookupservice:all:{key}` | `lookupservice:all:HoldReasons` |
| `CustomerService` | `containercontrolservice:getcustomer:{code}` | `containercontrolservice:getcustomer:MAEU` |
| `DepotService` | `cm:yard-locations:{depotCodes}` | `cm:yard-locations:AKL-WLG` |

---

### Dependency Injection Registration

**Modern .NET Core** (`Startup.cs` + `ServiceRegistrar.cs`):
```csharp
// Auto-registers all IService implementations with Scoped lifetime
services.Scan(scan => scan
    .FromAssemblyOf<IAssemblyCoreMarker>()
    .AddClasses(classes => classes.AssignableTo<IService>())
    .AsImplementedInterfaces()
    .WithScopedLifetime());
```

**Legacy Unity** (`UnityConfig.cs`):
```csharp
container.RegisterType<CacheService>(
    new ContainerControlledLifetimeManager(),  // Singleton
    new InjectionFactory(c => new CacheService(
        new RedisConnectionProvider(
            new RedisSettings(
                ConfigurationManager.AppSettings["RedisServer"], 
                true, 50000, ""))));
```

---

### Serialization & Storage

- **Format**: JSON (via Newtonsoft.Json)
- **TTL**: Default 60 minutes, configurable per-operation
- **Read Optimization**: `CommandFlags.PreferReplica` for read operations
- **Write Optimization**: `CommandFlags.FireAndForget` for writes

---

### Two-Tier Caching Note

The system also uses **IMemoryCache** alongside Redis in some controllers:

```csharp
// AccountV1Controller.cs
private readonly ICacheService _cacheService;     // Redis
private readonly IMemoryCache _memoryCache;       // In-memory (local)
```

This enables **L1/L2 caching** pattern where frequently accessed data stays in local memory while Redis serves as the distributed L2 cache.

---

## Report

- **Tool calls**: 17
- **Tools used**: Glob, Grep, Read
- **Files read**: 15
- **Files used**: 
  - `Pinnacle System/docker-compose.redis.yml`
  - `Pinnacle System/Project/src/core/common/Interface/ICacheService.cs`
  - `Pinnacle System/Project/src/core/common/service/CacheService.cs`
  - `Pinnacle System/Project/src/core/common/ServiceRegistrar.cs`
  - `Pinnacle System/Project/src/domain/cm/Shared/BaseDomain.cs`
  - `Pinnacle System/Project/src/domain/cm/AggregateModels/ContainerManagementService.cs`
  - `Pinnacle System/Project/src/domain/cm/AggregateModels/Shared/LookupService.cs`
  - `Pinnacle System/Project/src/domain/cm/AggregateModels/Shared/CustomerService.cs`
  - `Pinnacle System/Project/src/web apps/api/Startup.cs`
  - `Pinnacle System/Project/src/web apps/api/Controllers/v1/AccountV1Controller.cs`
  - `PinnacleIntegratedSystem/Core/pinnacle.core.caching/CacheService.cs`
  - `PinnacleIntegratedSystem/Core/pinnacle.core.caching/CacheKey.cs`
  - `PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/ICacheStore.cs`
  - `PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/RedisCacheStore.cs`
  - `PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/RedisConnectionProvider.cs`
  - `PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/RedisSettings.cs`
  - `PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/ICacheStoreSettings.cs`
  - `PinnacleIntegratedSystem/pinnacle/App_Start/UnityConfig.cs`
- **Key findings**:
  - Redis-backed distributed caching using StackExchange.Redis with DB 10 isolation
  - Cache-Aside pattern implemented across all domain services via BaseDomain inheritance
  - 60-minute default TTL with JSON serialization
  - Pattern-based cache invalidation using prefix matching (`RemoveKeys`)
  - Dual abstraction: modern ICacheService (ASP.NET Core) and legacy ICacheStore (Unity)
  - Hybrid L1/L2 caching capability with IMemoryCache + Redis in controllers
