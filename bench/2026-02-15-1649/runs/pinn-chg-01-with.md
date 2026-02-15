Now I have a comprehensive view. Let me compile the complete list of files that need modification.

## Files to Modify for Adding `EstimatedRepairHours` Property

Based on my analysis, here are all files that need modification:

### 1. Domain Models (Backend - C#)

| File | Purpose |
|------|---------|
| `Project/src/domain/model/cm/ContainerDamage.cs` | Core domain model for container damage records |
| `Project/src/domain/model/cm/ContainerDamageSummary.cs` | Summary model (may need `TotalEstimatedRepairHours`) |
| `Project/src/domain/model/ContainerControl/VisitDamage.cs` | View model returned by `spVisitContainerDamage` SP |

### 2. Repository Layer

| File | Purpose |
|------|---------|
| `Project/src/repository/dapper/cmdb/ContainerControlRepository.cs` | Contains `SELECT * FROM ContainerDamage` queries and `UpdateContainerDamageAsync` method |
| `Project/src/repository/dapper/cmdb/FieldOpsRepository.cs` | Contains multiple `ContainerDamage` SELECT queries |
| `Project/src/repository/dapper/cmdb/EstimateRepository.cs` | Contains `ContainerDamage` JOIN queries |
| `Project/src/repository/dapper/cmdb/ContainerManagementRepository.cs` | Contains `ContainerDamageSummary` JOIN queries |

### 3. Frontend - React App

| File | Purpose |
|------|---------|
| `Project/src/web apps/react-web-external/src/app/schema/ContainerDamage.ts` | TypeScript type definition |
| `Project/src/web apps/react-web-external/src/app/schema/ContainerDamageSummaryItem.ts` | Summary type (if aggregating) |
| `Project/src/web apps/react-web-external/src/app/main/external/admin/container-visit/details/tabs/MainInfo/widgets/DamageDetails.tsx` | Damage display widget |

### 4. Frontend - Angular App

| File | Purpose |
|------|---------|
| `Project/src/web apps/mypinnacle/src/app/core/models/cm/container-damage.ts` | TypeScript interface |
| `Project/src/web apps/mypinnacle/src/app/core/models/cm/container-damage-summary.ts` | Summary interface |
| `Project/src/web apps/mypinnacle/src/app/core/models/visit-damage.ts` | Visit damage interface |
| `Project/src/web apps/mypinnacle/src/app/main/apps/container-control/visit/visit-main-info/visit-main-info.component.ts` | Damage display table columns (line ~1862) |
| `Project/src/web apps/mypinnacle/src/app/main/apps/container-control/visit/visit-damage-detail/visit-damage-detail.component.ts` | Damage detail component |

### 5. Database

| File | Purpose |
|------|---------|
| **New SQL migration** | `ALTER TABLE ContainerDamage ADD EstimatedRepairHours DECIMAL(10,2) NULL` |
| **Stored Procedure** | `spVisitContainerDamage` - needs to include new column |

### 6. Service/Interface Layer (if business logic needed)

| File | Purpose |
|------|---------|
| `Project/src/domain/cm/AggregateModels/ContainerControl/IContainerControlRepository.cs` | Repository interface (if new methods needed) |
| `Project/src/domain/cm/Interface/IContainerControlService.cs` | Service interface |
| `Project/src/domain/cm/AggregateModels/ContainerControl/ContainerControlService.cs` | Service implementation |

---

## Report

- **Tool calls**: 14
- **Files read**: 10
- **Key findings**:
  - `ContainerDamage.cs` already has `Hours` property (line 15) - `EstimatedRepairHours` would be a separate estimate field
  - `ContainerDamageSummary.cs` aggregates damage data - may need `TotalEstimatedRepairHours`
  - Angular component (`visit-main-info.component.ts`) displays damage table with hours column (line 1862) - needs new column
  - React `DamageDetails.tsx` displays damage grid - needs EstimatedRepairHours row
  - Repository uses `SELECT *` for ContainerDamage in most places, so new column will auto-populate
  - Stored procedure `spVisitContainerDamage` and `VisitDamage` model used for read-only damage views
