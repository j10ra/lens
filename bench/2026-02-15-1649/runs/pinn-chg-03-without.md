Now I have a comprehensive understanding of the container status system. Let me compile my findings.

## Report

- **Tool calls**: 38
- **Files read**: 22
- **Key findings**:

  ### 1. Core Status Definitions (Backend C#)
  - **`Project/src/core/common/constant/ContainerStatusConstant.cs`** - Primary constant definitions with 9 status codes (HLD, AAR, AA, AS, SCP, DEL, AAW, AV, ACC) and their GUID mappings
  - **`Project/src/domain/model/cm/ShippingContainerStatus.cs`** - Dapper model with `Code`, `Description`, `WorkflowStep`, `IsAvailable`, `MappingCode`
  - **`Project/src/domain/model/Shared/ContainerStatusItem.cs`** - Model with `AllowedStatusChange` computed property that restricts SCP changes to AA/AS/AAR only

  ### 2. Frontend Constants (TypeScript)
  - **Angular**: `Project/src/web apps/mypinnacle/src/app/app.constants.ts` - `ContainerStatusIds` (GUID map) and `ContainerTotalConstant` (6 statuses for counts)
  - **React**: `Project/src/web apps/react-web-external/src/app/constants.ts` - Same structures, plus `ContainerStatus` object (AV, AS, AA only)

  ### 3. API & Service Layer
  - **`Project/src/web apps/api/Controllers/v1/RestApiV1Controller.cs:3012`** - `GET /v1/get-container-status` endpoint returns all statuses from `GetShippingContainerStatusesAsync()`
  - **`Project/src/domain/cm/Interface/IContainerControlService.cs:181`** - `UpdateVisitStatusAsync()` handles status transitions
  - **`Project/src/domain/cm/AggregateModels/ContainerControl/ContainerControlService.cs:4786`** - Core status update logic with status-specific handling for AAR, AAW, AS

  ### 4. Status Transition Logic
  - Status transitions handled in `ContainerControlService.cs:4365-4520`
  - AVX values tied to status (AS clears AVX)
  - AAR/AAW trigger damage summary updates
  - Workflow mappings at lines 4390-4400 (SCP, AV, AS, AA/AAR, AAW)

  ### 5. Data Warehouse
  - **`Project/src/domain/model/DataWarehouse/FactStatusRevenue.cs`** - Uses `Status` string field for revenue fact tables

  ### 6. Database
  - **SQL Table**: `ShippingContainerStatus` with columns: Id (PK), Code, Description, WorkflowStep, IsAvailable, MappingCode
  - **Migration 3398**: Added `MappingCode` column

  ### 7. UI Components Using Status
  - **Stock reports**: Filter by status, display counts per status (ContainerTotalConstant)
  - **Status/AVX change dialog**: `status-avxchange.component.ts`
  - **Container visit forms**: Display/edit status with autocomplete
  - **Acceptance dialogs**: Status selection dropdown
  - **Container totals**: Aggregations per status

  ### 8. Key Locations to Modify for QT (Quarantine)
  1. `ContainerStatusConstant.cs` - Add `QT = "QT"` and generate new GUID
  2. `ContainerStatusIdConstant.cs` - Add new GUID constant
  3. SQL: Insert new row into `ShippingContainerStatus` table
  4. `app.constants.ts` (Angular) - Add to `ContainerStatusIds` and `ContainerTotalConstant` if needed for totals
  5. `constants.ts` (React) - Same additions
  6. `ContainerStatusItem.cs` - Update `AllowedStatusChange` if QT has special transition rules
  7. `ContainerControlService.cs:UpdateVisitStatusAsync()` - Add QT-specific handling if needed
  8. Any workflow logic that filters by status arrays
