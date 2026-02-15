I now have a complete picture. Let me provide the analysis.

## Estimate Workflow: CEDEX, Maersk, Hapag Inspection Types

### Flow Summary

**1. API Endpoint (`EstimateV1Controller.cs:77-111`)**
```
GET v1/estimate/container-estimate/{id}
```

The controller uses **ID format discrimination** to route to the correct inspection type:

```csharp
var isGuid = Guid.TryParse(id, out _);

if (isGuid)
{
    // CEDEX first (DepotInspections table)
    estimate = await _estimateService.GetCedexContainerEstimateAsync(id);
    
    // MSK fallback if CEDEX returns null
    if (estimate == null)
        estimate = await _estimateService.GetMskContainerEstimateAsync(id);
}
else
{
    // HAPAG (uses long ID, not GUID)
    estimate = await _estimateService.GetHapagContainerEstimateAsync(id);
}
```

**2. Service Layer (`EstimateService.cs:74-76`)**
- Direct pass-through to repository:
  - `GetCedexContainerEstimateAsync(id)` → `FindCedexContainerEstimateAsync(id)`
  - `GetMskContainerEstimateAsync(id)` → `FindMskContainerEstimateAsync(id)`
  - `GetHapagContainerEstimateAsync(id)` → `FindHapagContainerEstimateAsync(id)`

**3. Repository Database Queries (`EstimateRepository.cs`)**

| Type | Table | ID Type | Key Fields |
|------|-------|---------|------------|
| **CEDEX** | `DepotInspections` | GUID | Standard AHAM codes, estimate totals |
| **Maersk** | `Maersk_Inspections` | GUID | STS codes, MCStatus, AVX fields |
| **Hapag** | `Hapag_Inspections` | long | Hapag-specific codes |

### Customer-Based Routing (for batch/visit queries)

When fetching estimates by container visit (`EstimateService.cs:85-127`), the system uses `CustomerCode` constants:

```csharp
// CustomerCode.cs
public static string[] MaerskCodes = { "MSK", "MSKO" };
public static string[] HapagCodes = { "HAPG" };
```

Routing logic:
```csharp
if (CustomerCode.HapagCodes.Contains(visit.Customer.CustomerCode))
    → GetHapagContainerEstimatesByVisitAsync()
else if (CustomerCode.MaerskCodes.Contains(visit.Customer.CustomerCode))
    → GetMskContainerEstimatesByVisitAsync()
else
    → GetCedexContainerEstimatesByVisitAsync()  // Default/fallback
```

### Key Differences

| Aspect | CEDEX | Maersk | Hapag |
|--------|-------|--------|-------|
| **Table** | DepotInspections | Maersk_Inspections | Hapag_Inspections |
| **ID Format** | GUID | GUID | long (non-GUID) |
| **Line Table** | DepotInspectionsLines | Maersk_Lines | Hapag_Lines |
| **Rate Codes** | AHAM 2012 | STS Pricing | Customer-specific |
| **Detection** | GUID + not found in MSK | GUID + fallback | Non-GUID string |

---

## Report

- **Tool calls**: 10
- **Tools used**: Glob, Grep, Read
- **Files read**: 5
- **Files used**: 
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/web apps/api/Controllers/v1/EstimateV1Controller.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/AggregateModels/Estimate/EstimateService.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/repository/dapper/cmdb/EstimateRepository.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/AggregateModels/Estimate/IEstimateRepository.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/Interface/IEstimateService.cs`
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/core/common/constant/CustomerCode.cs`
- **Key findings**:
  - ID format discrimination: GUID → CEDEX/Maersk, non-GUID → Hapag
  - CEDEX tries first, Maersk is fallback for GUID IDs
  - Customer code routing: `MSK/MSKO` → Maersk, `HAPG` → Hapag, others → CEDEX
  - Three separate database tables: `DepotInspections`, `Maersk_Inspections`, `Hapag_Inspections`
