Based on my analysis of the codebase, here are two test scenarios for benchmarking an AI coding assistant:

---

#### pinn-exp-01
- **Category**: Exploratory
- **Prompt**:
  `Explain how the caching layer works in the Pinnacle system. I need to understand the architecture, the key components involved, and how data flows through the cache from API request to Redis storage.`
- **Judge Criteria**:
  1. Must mention `CacheService` class located at `PinnacleIntegratedSystem/Core/pinnacle.core.caching/CacheService.cs`
  2. Must mention `RedisCacheStore` class at `PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/RedisCacheStore.cs`
  3. Must mention `ICacheStore` interface at `PinnacleIntegratedSystem/Core/pinnacle.core.caching/redis/ICacheStore.cs`
  4. Must identify StackExchange.Redis as the underlying Redis client library
  5. Must note the default cache duration is 30 minutes (configured in `CacheService.Set<T>` method)

---

#### pinn-tgt-01
- **Category**: Targeted
- **Prompt**:
  `Find where the DaysInYard property is calculated for container visits and explain how it works. I need to locate the exact implementation.`
- **Judge Criteria**:
  1. Must locate the `DaysInYard` property in `pinnacle.domain.model/ContainerControl/Visit.cs`
  2. Must identify it returns an `int` value
  3. Must mention the calculation uses `GateIn` and `GateOut` DateTime properties
  4. Must note that if `GateOut` has no value, it calculates from `GateIn` to `DateTime.Now`
  5. Must mention the use of `MidpointRounding.AwayFromZero` in the calculation
