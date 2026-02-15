Now I have a comprehensive understanding. Let me compile the complete list of files that need modification for adding `EstimatedRepairHours` to container damage records.

## Files to Modify for Adding `EstimatedRepairHours` to Container Damage Records

### 1. Database Layer

| File | Purpose |
|------|---------|
| `Project/src/sql/[TICKET].ContainerManagement.sql` | **New migration** - Add `EstimatedRepairHours decimal(10,2) NULL` column to `ContainerDamage` table |
| SQL Stored Procedure `spVisitContainerDamage` | Update to include new column in SELECT (referenced at ContainerControlRepository.cs:1548) |

### 2. Domain Models (C#)

| File | Purpose |
|------|---------|
| `Project/src/domain/model/cm/ContainerDamage.cs` | Add `EstimatedRepairHours` property |
| `Project/src/domain/model/ContainerControl/VisitDamage.cs` | Add `EstimatedRepairHours` property (DTO for API) |

### 3. Repository Layer

| File | Purpose |
|------|---------|
| `Project/src/repository/dapper/cmdb/ContainerControlRepository.cs` | - Lines ~7235-7248: `UpdateContainerDamageAsync()` - include new column<br>- Lines ~7251-7265: `InsertContainerDamageAsync()` - include new column<br>- Lines ~1548: `spVisitContainerDamage` SP returns this data |

### 4. Service Layer

| File | Purpose |
|------|---------|
| `Project/src/repository/dapper/cmdb/FieldOpsRepository.cs` | Multiple queries with `ContainerDamage` CTEs - add column if needed for workshop calculations |
| `Project/src/repository/dapper/cmdb/EstimateRepository.cs` | Lines 1381, 1411, 1439, 1486 - queries joining ContainerDamage |

### 5. API Layer

| File | Purpose |
|------|---------|
| `Project/src/web apps/api/Controllers/v1/RestApiV1Controller.cs` | `GetVisitDamages` endpoint (line ~642-660) returns damage data |

### 6. React Frontend

| File | Purpose |
|------|---------|
| `Project/src/web apps/react-web-external/src/app/schema/ContainerDamage.ts` | Add `estimatedRepairHours: number` to TypeScript type |
| `Project/src/web apps/react-web-external/src/app/main/external/admin/container-visit/details/tabs/MainInfo/widgets/DamageDetails.tsx` | Display `estimatedRepairHours` in damage table |

### 7. Angular Frontend

| File | Purpose |
|------|---------|
| `Project/src/web apps/mypinnacle/src/app/core/models/cm/container-damage.ts` | Add `estimatedRepairHours: number` to interface |
| `Project/src/web apps/mypinnacle/src/app/core/models/visit-damage.ts` | Add `estimatedRepairHours: number` to interface |
| `Project/src/web apps/mypinnacle/src/app/main/apps/container-control/visit/visit-damage-detail/visit-damage-detail.component.html` | Add form field to display `estimatedRepairHours` |

---

## Report

- **Tool calls**: 32
- **Files read**: 18
- **Key findings**:
  - `ContainerDamage.cs` already has `Hours` property (actual hours) - `EstimatedRepairHours` would be a separate estimate field
  - Damage data flows through stored procedure `spVisitContainerDamage` which needs updating
  - Repository has `InsertContainerDamageAsync()` and `UpdateContainerDamageAsync()` methods using Dapper Contrib
  - Frontend has parallel models in both React (TypeScript types) and Angular (interfaces)
  - `VisitDamage.cs` is a separate read-only DTO for API responses that also needs the new property
