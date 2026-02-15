Now I have a complete picture. Let me summarize the relationship.

## Estimate-ContainerVisit Relationship Summary

### Entity Relationship Diagram

```
ContainerVisit (Guid Id)
│
├── DepotInspections (Cedex)     ── FK: ContainerVisitId (Guid)
│   └── DepotInspectionsLines
│
├── Maersk_Inspections           ── FK: ContainerVisitId (Guid)  
│   └── Maersk_Lines
│
└── Hapag_Inspections            ── FK: ContainerVisitId (Guid)
    └── Hapag_Lines
```

### Key Tables & FKs

| Table | PK | FK to ContainerVisit | Customer Type |
|-------|-----|---------------------|---------------|
| `DepotInspections` | `id` (Guid) | `ContainerVisitId` (Guid) | Cedex (all non-Maersk/Hapag) |
| `Maersk_Inspections` | `id` (Guid) | `ContainerVisitId` (Guid) | Maersk (`MSK`, `MSKO`) |
| `Hapag_Inspections` | `id` (long) | `ContainerVisitId` (Guid) | Hapag (`HAPG`) |

### Customer Routing Logic

From `EstimateService.cs:85-127`:

```csharp
if (CustomerCode.HapagCodes.Contains(visit.Customer.CustomerCode))  // "HAPG"
    → GetHapagContainerEstimatesByVisitAsync(visit.Id)
    
else if (CustomerCode.MaerskCodes.Contains(visit.Customer.CustomerCode))  // "MSK", "MSKO"
    → GetMskContainerEstimatesByVisitAsync(visit.Id)
    
else  // Cedex - all other customers
    → GetCedexContainerEstimatesByVisitAsync(visit.Id)
```

### Model Key Fields

**DepotInspection** (`Project/src/domain/model/cm/DepotInspection.cs`)
- `id` (Guid, PK) | `ContainerVisitId` (Guid, FK) | `Status` | `EstimateNo` | `DateSurveyed` | `StructuralTotal` | `MachineryTotal`

**MaerskInspections** (`Project/src/domain/model/cm/MaerskInspections.cs`)
- `id` (Guid, PK) | `ContainerVisitId` (Guid, FK) | `status` | `StructuralTotal` | `MachineryTotal` | `type` | `Weartear`

**HapagInspections** (`Project/src/domain/model/cm/HapagInspections.cs`)
- `id` (long, PK) | `ContainerVisitId` (Guid, FK) | `status` | `StructuralTotal` | `MachineryTotal` | `type` | `Grade`

### Frontend Integration

From `ContainerVisitProvider.tsx:71-86`:
- React hooks `useGetVisitInspectionMaersk` vs `useGetVisitInspections` are conditionally called based on customer code
- Maersk customers (`MSK`, `MSKO`) use Maersk-specific endpoint
- All other customers use generic depot inspections endpoint

### SQL Joins (Repository)

All three inspection tables JOIN to `ContainerVisit` to enrich data:
```sql
FROM DepotInspections di
INNER JOIN ContainerVisit cv ON cv.Id = di.ContainerVisitId
INNER JOIN ShippingContainer sc ON sc.Id = cv.ShippingContainerId
INNER JOIN Customer c ON c.Id = cv.CustomerId
```

Same pattern for `Maersk_Inspections` and `Hapag_Inspections`.

---

## Report

- **Tool calls**: 9
- **Files read**: 8
- **Key findings**:
  - **Central FK**: `ContainerVisitId` (Guid) is the foreign key linking all three estimate types to `ContainerVisit`
  - **Customer-based polymorphism**: System routes to different inspection tables based on customer code - Maersk (`MSK`, `MSKO`) → `Maersk_Inspections`, Hapag (`HAPG`) → `Hapag_Inspections`, all others → `DepotInspections`
  - **PK differences**: `DepotInspections` and `Maersk_Inspections` use `Guid` PKs, while `Hapag_Inspections` uses `long` PK
  - **Line items**: Each inspection type has its own line items table (`DepotInspectionsLines`, `Maersk_Lines`, `Hapag_Lines`)
  - **Repository pattern**: `EstimateRepository.cs` contains separate query constants for each estimate type, all joining back to `ContainerVisit` for container/customer/depot context
