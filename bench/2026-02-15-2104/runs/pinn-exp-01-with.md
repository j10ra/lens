Now I have the complete picture. Let me trace the complete flow.

## Estimate Workflow: Three Inspection Types (CEDEX, Maersk, Hapag)

### Flow Overview

**1. API Endpoint Entry Point** (`EstimateV1Controller.cs:77-114`)

```
GET /v1/estimate/container-estimate/{id}
```

The controller's `GetContainerEstimate(string id)` method receives the estimate ID and routes based on ID format:

| ID Format | Inspection Type | Method Called |
|-----------|-----------------|---------------|
| GUID (36 chars) | CEDEX first, then Maersk fallback | `GetCedexContainerEstimateAsync(id)` → `GetMskContainerEstimateAsync(id)` |
| Non-GUID (numeric) | Hapag | `GetHapagContainerEstimateAsync(id)` |

```csharp
var isGuid = Guid.TryParse(id, out _);
if (isGuid) {
    estimate = await _estimateService.GetCedexContainerEstimateAsync(id);
    if (estimate == null)
        estimate = await _estimateService.GetMskContainerEstimateAsync(id);
} else {
    estimate = await _estimateService.GetHapagContainerEstimateAsync(id);
}
```

---

**2. Service Layer** (`EstimateService.cs:74-76`)

The service simply delegates to the repository:

```csharp
public Task<ContainerEstimate> GetCedexContainerEstimateAsync(string id) 
    => _estimateRepository.FindCedexContainerEstimateAsync(id);
public Task<ContainerEstimate> GetMskContainerEstimateAsync(string id) 
    => _estimateRepository.FindMskContainerEstimateAsync(id);
public Task<ContainerEstimate> GetHapagContainerEstimateAsync(string id) 
    => _estimateRepository.FindHapagContainerEstimateAsync(id);
```

---

**3. Repository Layer** (`EstimateRepository.cs`) - Database Queries

Each inspection type queries a **different table** with **different schemas**:

| Inspection Type | Table | ID Type | Key Fields |
|-----------------|-------|---------|------------|
| CEDEX | `DepotInspections` | GUID | EstimateNo, RevisionNo, EstimateTotal |
| Maersk | `Maersk_Inspections` | GUID | VendorReferenceNo, StructuralTotal, MachineryTotal |
| Hapag | `Hapag_Inspections` | `long` (numeric) | StructuralTotal, MachineryTotal |

**CEDEX Query** (lines 572-611):
```sql
SELECT Id, EstimateNo, Status, RevisionNo, DateCreated,
       ContainerNo, DepotCode, CustomerCode, IsoCode,
       StructuralTotal, MachineryTotal, EstimateTotal
FROM DepotInspections di
INNER JOIN ContainerVisit cv ON cv.Id = di.ContainerVisitId
INNER JOIN ShippingContainer sc ON sc.Id = cv.ShippingContainerId
-- ... additional joins
WHERE di.Id = @id
```

**Maersk Query** (lines 724-790):
```sql
SELECT Id, Status, VendorReferenceNo, StructuralTotal, MachineryTotal,
       ContainerNo, DepotCode, Inspector, PTIDate, CallOut
FROM Maersk_Inspections msk
INNER JOIN ContainerVisit cv ON cv.Id = msk.ContainerVisitId
-- ... additional joins  
WHERE msk.Id = @id
```

**Hapag Query** (lines 792-829):
```sql
SELECT Id, Status, StructuralTotal, MachineryTotal,
       ContainerNo, DepotCode, manufactureDT
FROM Hapag_Inspections hpg
INNER JOIN ContainerVisit cv ON cv.Id = hpg.ContainerVisitId
-- ... additional joins
WHERE hpg.Id = @id
```

---

### Alternative Flow: By Visit + Customer Code

When fetching estimates by `visitId` (`EstimateService.cs:85-127`), the system determines inspection type via **customer code**:

```csharp
if (CustomerCode.HapagCodes.Contains(visit.Customer.CustomerCode))  // ["HAPG"]
    → GetHapagContainerEstimatesByVisitAsync(visitId)
else if (CustomerCode.MaerskCodes.Contains(visit.Customer.CustomerCode))  // ["MSK", "MSKO"]
    → GetMskContainerEstimatesByVisitAsync(visitId)
else
    → GetCedexContainerEstimatesByVisitAsync(visitId)
```

**Customer Codes** (`CustomerCode.cs:26-27`):
- **MaerskCodes**: `["MSK", "MSKO"]`
- **HapagCodes**: `["HAPG"]`
- **CEDEX**: All other customer codes (fallback)

---

### Summary Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  API: GET /v1/estimate/container-estimate/{id}                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │ ID Format Detection │
                    │ Guid.TryParse(id)   │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │ GUID?              │                    │ Non-GUID?
          ▼                    │                    ▼
    ┌───────────┐              │              ┌───────────┐
    │ Try CEDEX │              │              │  Hapag    │
    │ Depot     │              │              │ Hapag_    │
    │ Inspections│             │              │ Inspections│
    └─────┬─────┘              │              └───────────┘
          │ null?              │
          ▼                    │
    ┌───────────┐              │
    │ Try Maersk│              │
    │ Maersk_   │              │
    │ Inspections│             │
    └───────────┘              │
                               │
              ┌────────────────┴────────────────┐
              │         Shared Joins            │
              │  ContainerVisit → ShippingContainer
              │  → ShippingContainerDepot → Customer
              │  → IsoContainerCode → PinnacleContainerSubtype
              └─────────────────────────────────┘
```

## Report

- **Tool calls**: 12
- **Tools used**: Read, Grep, Glob
- **Files read**: 6
- **Files used**: 
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/web apps/api/Controllers/v1/EstimateV1Controller.cs`,
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/repository/dapper/cmdb/EstimateRepository.cs`,
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/AggregateModels/Estimate/EstimateService.cs`,
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/cm/AggregateModels/Estimate/IEstimateRepository.cs`,
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/core/common/constant/CustomerCode.cs`
- **Key findings**:
  - **ID-based routing**: GUID IDs query CEDEX (`DepotInspections`) first, then Maersk (`Maersk_Inspections`) as fallback; non-GUID (numeric long) IDs query Hapag (`Hapag_Inspections`) directly
  - **Three distinct tables**: CEDEX uses `DepotInspections` (GUID, has EstimateNo/RevisionNo), Maersk uses `Maersk_Inspections` (GUID, has VendorReferenceNo), Hapag uses `Hapag_Inspections` (long ID)
  - **Customer code routing**: When fetching by visit, customer code determines type - `HAPG` → Hapag, `MSK/MSKO` → Maersk, all others → CEDEX
