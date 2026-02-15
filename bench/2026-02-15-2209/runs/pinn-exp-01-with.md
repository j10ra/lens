Excellent! Now I have a complete understanding. Let me summarize the architecture.

## Pinnacle Caching Layer Architecture

### Overview

The Pinnacle system uses **Redis** as its distributed caching layer, implemented via `StackExchange.Redis`. The architecture follows a clean separation of concerns with dependency injection throughout.

---

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ICacheService` | `core/common/Interface/ICacheService.cs` | Interface defining cache operations |
| `CacheService` | `core/common/service/CacheService.cs` | Redis implementation using StackExchange.Redis |
| `BaseDomain` | `domain/*/Shared/BaseDomain.cs` | Abstract base class providing cache access to domain services |
| `ServiceRegistrar` | `core/common/ServiceRegistrar.cs` | DI registration using Scrutor assembly scanning |

---

### Data Flow (Request → Cache → Redis)

```
1. HTTP Request
       ↓
2. API Controller (injects ICacheService or domain service)
       ↓
3. Domain Service (inherits BaseDomain → protected Cache property)
       ↓
4. CacheService (implements ICacheService)
       ↓
5. StackExchange.Redis ConnectionMultiplexer
       ↓
6. Redis Server (scshoweb1:6379, scsreweb1:6379 / DB 10)
```

---

### Configuration

From `appsettings.json`:
```json
"Redis": {
    "ConnectionString": "scshoweb1:6379,scsreweb1:6379",
    "DefaultDb": "10"
}
```

- **High availability**: Multiple endpoints for Redis cluster
- **Default TTL**: 60 minutes (`DefaultExpirationInMinutes = 60`)
- **Serialization**: JSON via Newtonsoft.Json

---

### Cache Service Operations

| Method | Description |
|--------|-------------|
| `SaveToCache<T>(key, item)` | Save with 60-min default TTL |
| `SaveToCache<T>(key, item, expirationMins)` | Save with custom TTL |
| `RetrieveFromCache<T>(key)` | Get item (sync) |
| `RetrieveFromCacheAsync<T>(key)` | Get item (async, prefers replica) |
| `RemoveFromCache(key)` | Delete single key |
| `RemoveKeys(prefix)` | Pattern-based deletion (e.g., clear all keys starting with prefix) |
| `Exists(key)` | Check key existence |
| `Increment(key, value)` | Atomic counter increment |

---

### Usage Patterns

**1. Cache-Aside (Lazy Loading)**
```csharp
// LookupService.cs:39-60
string ckey = $"{cachePrefix}all:{lookupKey}";
if (Cache.Exists(ckey))
    return await Cache.RetrieveFromCacheAsync<IEnumerable<LookupValueBase>>(ckey);

var data = await _lookupRepository.FindAllAsync(lookupKey);
if (data.Any())
    Cache.SaveToCacheAsync(ckey, data);
```

**2. Token Caching (External API Auth)**
```csharp
// AuthService.cs - Qube vendor
string ckey = "qube-auth-token";
if (await _cacheService.ExistsAsync(ckey))
    return await _cacheService.RetrieveFromCacheAsync<string>(ckey);

// Fetch from OAuth endpoint, then cache with token expiry
_cacheService.SaveToCacheAsync(ckey, token.AccessToken, token.ExpiresIn / 60);
```

**3. Cache Invalidation on Update**
```csharp
// CustomerService.cs:126-135
if (await _customerRepository.UpdateCustomerAsync(item))
{
    string ckey = $"{cachePrefix}getcustomer:{item.Code}";
    await Cache.RemoveFromCacheAsync(ckey);
}
```

**4. Pattern-Based Cache Clearing**
```csharp
// LookupService.cs:116 - Clear all lookup caches on value change
await Cache.RemoveKeysAsync(cachePrefix);  // "lookupservice:*"
```

---

### Key Naming Convention

| Pattern | Example | Use Case |
|---------|---------|----------|
| `{domain}:{entity}-{id}` | `cm:customer-MAEU1234567` | Single entity |
| `{domain}:{entities}` | `cm:customers` | Entity collection |
| `{service}:{operation}:{params}` | `lookupservice:all:ContainerTypes` | Service result |
| `{vendor}:{resource}` | `mytrucking:access-token` | External integration |
| `qube-auth-token{-uat}` | `qube-auth-token` | Auth tokens |

---

### DI Registration

```csharp
// Startup.cs:56
services.RegisterCoreServices();

// ServiceRegistrar.cs - Scrutor auto-registration
services.Scan(scan => scan
    .FromAssemblyOf<IAssemblyCoreMarker>()
    .AddClasses(classes => classes.AssignableTo<IService>())
    .AsImplementedInterfaces()
    .WithScopedLifetime());
```

- CacheService implements `IService` marker
- Registered as `ICacheService` with **scoped lifetime**
- Lazy-loaded `ConnectionMultiplexer` via static field (singleton pattern for connection)

---

### Design Characteristics

1. **Fail-silent**: All cache operations wrapped in try/catch with empty returns on failure
2. **Fire-and-forget**: Writes use `CommandFlags.FireAndForget` for non-blocking saves
3. **Read replica preference**: Reads use `CommandFlags.PreferReplica`
4. **No distributed locking**: Cache operations are atomic but no lock coordination
5. **No cache stampede protection**: Multiple concurrent misses could all hit the database

---

## Report

- **Tool calls**: 16
- **Tools used**: Read, Grep, Glob
- **Files read**: 12
- **Files used**: 
  - `/Project/src/core/common/Interface/ICacheService.cs`
  - `/Project/src/core/common/service/CacheService.cs`
  - `/Project/src/core/common/ServiceRegistrar.cs`
  - `/Project/src/core/common/pinnacle.core.csproj`
  - `/Project/src/web/api/Startup.cs`
  - `/Project/src/web/api/appsettings.json`
  - `/Project/src/domain/cm/Shared/BaseDomain.cs`
  - `/Project/src/domain/cm/AggregateModels/Shared/LookupService.cs`
  - `/Project/src/domain/cm/AggregateModels/Shared/CustomerService.cs`
  - `/Project/src/vendor/qube/AuthService.cs`
  - `/Project/src/vendor/mytrucking/BaseService.cs`
  - `/Project/src/domain/dw/DataWarehouse/DataWarehouseService.cs`
- **Key findings**:
  - Redis distributed cache using StackExchange.Redis with multi-node HA config
  - Cache-aside pattern with 60-min default TTL
  - BaseDomain inheritance provides cache access to all domain services
  - Pattern-based key invalidation via `RemoveKeys(prefix)`
  - External API tokens cached with dynamic expiry based on OAuth response
  - Scrutor-based auto-registration with scoped lifetime
