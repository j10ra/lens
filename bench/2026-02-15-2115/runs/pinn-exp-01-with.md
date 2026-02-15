Now I have a complete picture. Let me provide a comprehensive explanation.

## Pinnacle Caching Layer Architecture

### Overview

The Pinnacle system uses **Redis** as its distributed cache backing store, with **StackExchange.Redis** as the client library. The caching layer follows a layered architecture with clear separation of concerns.

---

### Architecture Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Controllers                              │
│          (RestApiV1Controller, JobV1Controller, etc.)               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      Domain Services                                 │
│   (LookupService, UserService, ContainerControlService, etc.)       │
│   - Inherits from BaseDomain<T> or BaseDomain                       │
│   - Accesses cache via protected `Cache` property                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      ICacheService Interface                         │
│   - SaveToCacheAsync<T>/RetrieveFromCacheAsync<T>                   │
│   - RemoveFromCache/Exists/Increment                                │
│   - RemoveKeys (pattern-based deletion)                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    CacheService Implementation                       │
│   - Uses StackExchange.Redis ConnectionMultiplexer                  │
│   - Lazy-initialized singleton connection                           │
│   - JSON serialization via Newtonsoft.Json                          │
│   - Default TTL: 60 minutes                                         │
│   - Read preference: CommandFlags.PreferReplica                     │
│   - Write flag: CommandFlags.FireAndForget                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    Redis Cache (Azure Redis / Local)                │
│   - ConnectionString + DefaultDb from appsettings.json              │
│   - 16 databases available (DB 10 used by API, DB 15 by workers)    │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Key Components

| Component | Path | Purpose |
|-----------|------|---------|
| `ICacheService` | `core/common/Interface/ICacheService.cs` | Interface defining cache operations |
| `CacheService` | `core/common/service/CacheService.cs` | Redis-backed implementation using StackExchange.Redis |
| `BaseDomain` | `domain/cm/Shared/BaseDomain.cs` | Abstract base class providing cache access to domain services |
| `RedisSettings` | `PinnacleIntegratedSystem/.../RedisSettings.cs` | Configuration container (legacy .NET Framework) |
| `ServiceRegistrar` | `core/common/ServiceRegistrar.cs` | Auto-registers services via Scrutor assembly scanning |

---

### Data Flow: API Request → Redis

1. **Request arrives** at API controller (e.g., `GatewayV1Controller`)

2. **Controller calls domain service** (e.g., `LookupService.GetAllAsync()`)

3. **Service checks cache first**:
   ```csharp
   string ckey = $"{cachePrefix}all:{lookupKey}";
   if (Cache.Exists(ckey))
   {
       return await Cache.RetrieveFromCacheAsync<IEnumerable<LookupValueBase>>(ckey);
   }
   ```

4. **Cache miss**: Data fetched from DB via repository, then stored:
   ```csharp
   var data = await _lookupRepository.FindAllAsync(lookupKey);
   _ = Cache.SaveToCacheAsync(ckey, data);
   ```

5. **CacheService serializes to JSON** and writes to Redis:
   ```csharp
   var json = JsonConvert.SerializeObject(item);
   await _cache.StringSetAsync(key, json, TimeSpan.FromMinutes(60), 
                                flags: CommandFlags.FireAndForget);
   ```

6. **Redis stores** the value with the configured TTL and database index.

---

### Configuration

**appsettings.json**:
```json
"Redis": {
    "ConnectionString": "scshoweb1:6379,scsreweb1:6379",
    "DefaultDb": "10"
}
```

**Development** uses Azure Redis Cache:
```json
"Redis": {
    "ConnectionString": "pinnaclenz.redis.cache.windows.net:6380,password=...,ssl=True",
    "DefaultDb": "10"
}
```

**Local development** via Docker (`docker-compose.redis.yml`):
- Redis 7.2 Alpine on port 6379
- 16 databases configured
- Persistent volume at `/data`

---

### Dependency Injection

Registration via Scrutor assembly scanning:
```csharp
services.Scan(scan => scan
    .FromAssemblyOf<IAssemblyCoreMarker>()
    .AddClasses(classes => classes.AssignableTo<IService>())
    .AsImplementedInterfaces()
    .WithScopedLifetime());
```

`CacheService` implements `IService`, so it's auto-registered as `ICacheService` with **scoped** lifetime.

---

### Key Features

| Feature | Implementation |
|---------|----------------|
| **Lazy connection** | `Lazy<ConnectionMultiplexer>` for thread-safe singleton |
| **Read optimization** | `CommandFlags.PreferReplica` for reads |
| **Fire-and-forget writes** | `CommandFlags.FireAndForget` for non-blocking sets |
| **Pattern-based removal** | `RemoveKeys(string startsWith)` scans servers for key patterns |
| **Atomic counter** | `Increment/IncrementAsync` for atomic operations |
| **Hash operations** | `HashGet/HashSet` for structured data (legacy API) |
| **Default TTL** | 60 minutes (configurable per-call) |

---

### Cache Key Patterns (Examples)

| Prefix | Usage |
|--------|-------|
| `lookupservice:all:{key}` | Lookup values by lookup key |
| `mercscrape-cookie` | Session cookies for Mercscrape tool |
| `Settings` | Application settings |
| `LookUp` | General lookup data |

---

## Report

- **Tool calls**: 21
- **Tools used**: Glob, Grep, Read
- **Files read**: 15
- **Files used**: 
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/core/common/Interface/ICacheService.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/core/common/service/CacheService.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/core/common/ServiceRegistrar.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/Shared/BaseDomain.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/AggregateModels/Shared/LookupService.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/web apps/api/Startup.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/docker-compose.redis.yml`
  - `/Volumes/Drive/__x/Pinnacle/PinnacleIntegratedSystem/Core/pinnacle.core.caching/CacheService.cs`
  - `/Volumes/Drive/__x/Pinnacle/PinnacleIntegratedSystem/Core/pinnacle.core.caching/CacheKey.cs`
  - `/Volumes/Drive/__x/Pinnacle/PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/ICacheStore.cs`
  - `/Volumes/Drive/__x/Pinnacle/PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/RedisCacheStore.cs`
  - `/Volumes/Drive/__x/Pinnacle/PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/RedisConnectionProvider.cs`
  - `/Volumes/Drive/__x/Pinnacle/PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/RedisSettings.cs`
  - `/Volumes/Drive/__x/Pinnacle/PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/ICacheStoreConnectionProvider.cs`
  - `/Volumes/Drive/__x/Pinnacle/PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/ICacheStoreSettings.cs`
- **Key findings**:
  - Two caching implementations exist: legacy `pinnacle.core.caching` (.NET Framework) and modern `pinnacle.core.service` (.NET Core)
  - Redis is the backing store using StackExchange.Redis client
  - Default cache TTL is 60 minutes
  - Read operations prefer replica nodes; writes use fire-and-forget for performance
  - Cache service is auto-registered via Scrutor assembly scanning with scoped lifetime
  - Multiple database indices used (DB 10 for API, DB 4/15 for worker services)
  - Pattern-based key removal scans all Redis servers for wildcard matches
