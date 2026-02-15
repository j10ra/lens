Now I have enough information to explain the caching architecture. Let me summarize.

## Pinnacle Caching Layer Architecture

The Pinnacle system uses a **two-tier caching strategy** with Redis as the primary distributed cache and ASP.NET MemoryCache for local caching.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           API Layer                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Controllers (e.g., GatewayV1Controller)                             │ │
│  │ - Uses IMemoryCache for local, short-lived cache                    │ │
│  │ - Also has access to ICacheService for Redis                        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Domain Layer                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ BaseDomain (abstract class)                                         │ │
│  │ - All domain services inherit from this                             │ │
│  │ - Protected property: ICacheService Cache                           │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Domain Services (LookupService, BillingService, CustomerService, etc)  │
│  - Use Cache.SaveToCache/RetrieveFromCache for data caching             │
│  - Use Cache.RemoveKeys for cache invalidation                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Core Layer                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ ICacheService (interface)                                           │ │
│  │ - SaveToCache<T>(), RetrieveFromCache<T>()                          │ │
│  │ - RemoveFromCache(), RemoveKeys()                                   │ │
│  │ - Exists(), Increment()                                             │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  CacheService (implementation)                                          │
│  - Uses StackExchange.Redis                                             │
│  - JSON serialization via Newtonsoft.Json                               │
│  - Lazy-loaded ConnectionMultiplexer                                    │
│  - Default expiration: 60 minutes                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Redis Server                                     │
│  - ConnectionString: "scshoweb1:6379,scsreweb1:6379" (prod)             │
│  - DefaultDb: 10                                                        │
│  - Supports replica reads (CommandFlags.PreferReplica)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **ICacheService** | `core/common/Interface/ICacheService.cs` | Interface defining cache operations |
| **CacheService** | `core/common/service/CacheService.cs` | Redis implementation using StackExchange.Redis |
| **BaseDomain** | `domain/cm/Shared/BaseDomain.cs`, `domain/pinn/Shared/BaseDomain.cs`, `domain/er/Shared/BaseDomain.cs` | Abstract base class providing Cache property to domain services |
| **IMemoryCache** | ASP.NET Core built-in | Local in-memory cache for API controllers |
| **ServiceRegistrar** | `core/common/ServiceRegistrar.cs` | Registers CacheService as scoped via Scrutor assembly scanning |

### Data Flow

1. **API Request** → Controller receives request
2. **Local Cache Check** → Controller checks `IMemoryCache` for gateway keys, depot lists (1-hour TTL)
3. **Domain Service Call** → Controller calls domain service (e.g., `BillingService`, `LookupService`)
4. **Redis Cache Check** → Domain service checks `Cache.Exists(key)`
5. **Cache Hit** → Returns `Cache.RetrieveFromCacheAsync<T>(key)`
6. **Cache Miss** → Queries database, then `Cache.SaveToCacheAsync(key, data)`
7. **Cache Invalidation** → On updates, calls `Cache.RemoveFromCache()` or `Cache.RemoveKeys(prefix)`

### Cache Key Naming Conventions

Services use prefix-based keys for organization and bulk invalidation:

```csharp
// BillingService
$"billingservice:{depotCode}:customerrate:{customerCode}-{rateCode}"

// LookupService  
$"lookupservice:all:{lookupKey}"

// DataWarehouseService
$"datawarehouse:working-days-{companyGroup}-{companyCode}-{accountCode}"

// FieldOpsService (atomic increment pattern)
$"fieldops:workplan-priority:{workshopCode}"
```

### Configuration

```json
// appsettings.json
"Redis": {
  "ConnectionString": "scshoweb1:6379,scsreweb1:6379",
  "DefaultDb": "10"
}
```

### Notable Patterns

1. **Lazy Connection** - `ConnectionMultiplexer` is lazy-loaded as a static singleton
2. **Fire-and-Forget Writes** - Saves use `CommandFlags.FireAndForget` for non-blocking writes
3. **Replica Reads** - Retrieves use `CommandFlags.PreferReplica` to distribute read load
4. **Atomic Increment** - `FieldOpsService` uses `IncrementAsync` for distributed counters
5. **Prefix Invalidation** - `RemoveKeys("prefix*")` clears all keys matching pattern

---

## Report

- **Tool calls**: 15
- **Tools used**: Grep, Glob, Read
- **Files read**: 11
- **Files used**: 
  - `Project/src/core/common/Interface/ICacheService.cs`
  - `Project/src/core/common/service/CacheService.cs`
  - `Project/src/core/common/ServiceRegistrar.cs`
  - `Project/src/domain/cm/Shared/BaseDomain.cs`
  - `Project/src/domain/pinn/Shared/BaseDomain.cs`
  - `Project/src/domain/er/Shared/BaseDomain.cs`
  - `Project/src/domain/cm/AggregateModels/Billing/BillingService.cs`
  - `Project/src/domain/cm/AggregateModels/Shared/LookupService.cs`
  - `Project/src/domain/dw/DataWarehouse/DataWarehouseService.cs`
  - `Project/src/web/apps/api/Startup.cs`
  - `Project/src/web/apps/api/appsettings.json`
  - `Project/src/vendor/qube/AuthService.cs`
- **Key findings**:
  - Two-tier caching: Redis (distributed, 60-min default TTL) + IMemoryCache (local, 1-hour TTL for gateway data)
  - All domain services inherit `BaseDomain` which provides `ICacheService Cache` property
  - StackExchange.Redis with JSON serialization, supports replica reads and fire-and-forget writes
  - Pattern-based cache invalidation via `RemoveKeys(prefix*)` for bulk clears
  - Redis configured with two nodes for HA: `scshoweb1:6379,scsreweb1:6379` on DB 10
