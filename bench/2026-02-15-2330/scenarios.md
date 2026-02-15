# Benchmark Scenarios — Pinnacle System

#### pinn-exp-01
- **Category**: Exploratory
- **Prompt**:
  `How does the dependency injection system wire up domain services to API controllers? Trace the full registration chain from Startup.cs through to a domain service being available in a controller action.`
- **Judge Criteria**:
  1. Must mention `ServiceRegistrar.cs` in `core/common/` and its Scrutor-based assembly scanning (`services.Scan`)
  2. Must mention `BaseDomain` abstract class providing shared dependencies (ICacheService, IUnitOfWork) to domain services
  3. Must mention `IAssemblyCoreMarker` and/or `IAssemblyDomainMarker` interfaces used for assembly scanning boundaries
  4. Must identify that services are registered with scoped lifetime (`WithScopedLifetime`)
  5. Must trace from `Startup.cs` calling `RegisterCoreServices()` and/or `RegisterDomainServices()` extension methods

#### pinn-chg-01
- **Category**: Change-Impact
- **Prompt**:
  `If we needed to add a new domain called "Logistics" (similar to the existing CM or ER domains), what files and patterns would need to be created or modified? Map out the full set of changes needed.`
- **Judge Criteria**:
  1. Must mention creating a new domain folder under `Project/src/domain/` (like existing `cm/`, `er/`, `pinn/`)
  2. Must mention creating a `BaseDomain.cs` in the new domain's `Shared/` folder inheriting the pattern from existing domains
  3. Must mention creating a new repository project under `Project/src/repository/dapper/` (like existing `cmdb/`, `erdb/`)
  4. Must mention an `IAssemblyDomainMarker` or marker interface for the new domain assembly for Scrutor scanning
  5. Must mention adding new API controllers under `Project/src/web apps/api/Controllers/`
