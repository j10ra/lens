Now I have a complete picture. Here is the comprehensive mapping of all container status locations in the system:

---

## Container Status Locations - Complete Map

### 1. **Backend - Core Constants** (Primary definition)
| File | Purpose | Status Codes |
|------|---------|--------------|
| `Project/src/core/common/constant/ContainerStatusConstant.cs` | C# constants for status codes + UUIDs | HLD, AAR, AA, AS, SCP, DEL, AAW, AV, ACC |

Two classes:
- `ContainerStatusConstant` - code → UUID mapping
- `ContainerStatusIdConstant` - UUID → code mapping

### 2. **Backend - Domain Models**
| File | Purpose |
|------|---------|
| `Project/src/domain/model/cm/ShippingContainerStatus.cs` | Dapper entity for `ShippingContainerStatus` table (Id, Code, Description, WorkflowStep, IsAvailable, MappingCode) |
| `Project/src/domain/model/Shared/ContainerStatusItem.cs` | DTO with `AllowedStatusChange` logic (AA/AS/AAR → SCP allowed) |
| `Project/src/domain/model/cm/ContainerVisit.cs` | Has `ShippingContainerStatusId` FK and navigation property |

### 3. **Backend - Service Layer**
| File | Method |
|------|--------|
| `Project/src/domain/cm/Interface/IContainerControlService.cs` | `GetShippingContainerStatusesAsync()`, `UpdateShippingContainerStatusAsync()` |
| `Project/src/domain/cm/AggregateModels/ContainerControl/ContainerControlService.cs` | Uses `ContainerStatusConstant` for AAR→AS conversion, release validation |
| `Project/src/domain/cm/AggregateModels/ContainerControl/IContainerControlRepository.cs` | `FindShippingContainerStatusAsync()`, `FindShippingContainerStatusesAsync()` |

### 4. **Backend - Repository**
| File | Purpose |
|------|---------|
| `Project/src/repository/dapper/cmdb/ContainerControlRepository.cs` | `FindShippingContainerStatusesAsync()` - fetches from `ShippingContainerStatus` table |

### 5. **Backend - API**
| File | Endpoint |
|------|----------|
| `Project/src/web apps/api/Controllers/v1/RestApiV1Controller.cs` | `GET /v1/get-container-status` |
| `Project/src/web apps/api/Models/ShippingContainerStatusCode.cs` | API response model |

### 6. **Frontend - Angular (MyPinnacle)**

**Constants:**
| File | Purpose |
|------|---------|
| `Project/src/web apps/mypinnacle/src/app/app.constants.ts` | `ContainerStatusIds` (UUIDs), `ContainerStatus` (AV, AS, AA), `ContainerTotalConstant` |

**Models/Interfaces:**
| File | Purpose |
|------|---------|
| `Project/src/web apps/mypinnacle/src/app/core/models/access-data.ts` | `ContainerStatusItem` interface |
| `Project/src/web apps/mypinnacle/src/app/core/models/cm/shipping-container-status.ts` | `ShippingContainerStatusItem` interface |
| `Project/src/web apps/mypinnacle/src/app/core/models/container-status.ts` | `ContainerStatusItem` + `ContainerStatusObj` class |

**Services:**
| File | Purpose |
|------|---------|
| `Project/src/web apps/mypinnacle/src/app/core/auth/authentication.service.ts` | `loadContainerStatuses()`, `getContainerStatus()`, `getContainerStatusOnly()` |
| `Project/src/web apps/mypinnacle/src/app/core/auth/token-storage.service.ts` | Stores/retrieves statuses in localStorage |

**Components using status:**
- `Project/src/web apps/mypinnacle/src/app/main/apps/report/container-totals/` - Dynamic columns by status
- `Project/src/web apps/mypinnacle/src/app/layout/components/quick-panel/container-status/` - Displays status code
- `Project/src/web apps/mypinnacle/src/app/main/apps/container-control/visit/status-avxchange/` - Status change UI
- `Project/src/web apps/mypinnacle/src/app/main/apps/administration/visit-status/` - Status admin page

### 7. **Frontend - React (External)**

**Constants:**
| File | Purpose |
|------|---------|
| `Project/src/web apps/react-web-external/src/app/constants.ts` | `ContainerStatusIds` (UUIDs), `ContainerTotalConstant` |

**Schema/Types:**
| File | Purpose |
|------|---------|
| `Project/src/web apps/react-web-external/src/app/schema/ShippingContainerStatusItem.ts` | TypeScript type |
| `Project/src/web apps/react-web-external/src/app/schema/ContainerStatusItem.ts` | TypeScript type (if exists) |

**Hooks/Services:**
| File | Purpose |
|------|---------|
| `Project/src/web apps/react-web-external/src/app/services/shared/useContainerStatus.ts` | Zustand hook, fetches `/get-container-status` |

### 8. **Database**
| Table | Columns |
|-------|---------|
| `ContainerManagement.dbo.ShippingContainerStatus` | Id (GUID), Code, Description, WorkflowStep, IsAvailable, MappingCode |
| `ContainerManagement.dbo.ContainerVisit` | ShippingContainerStatusId (FK) |

### 9. **SQL Migrations**
| File | Purpose |
|------|---------|
| `Project/src/sql/3398.ContainerManagement.sql` | Added `MappingCode` column |

---

## To Add QUARANTINE (QT) Status

### Required Changes:

1. **SQL** - Insert new row:
   ```sql
   INSERT INTO ShippingContainerStatus (Id, Code, Description, WorkflowStep, IsAvailable, MappingCode)
   VALUES (NEWID(), 'QT', 'Quarantine', <step>, <bit>, 'QT')
   ```

2. **C# Constants** (`ContainerStatusConstant.cs`):
   - Add `public const string QT = "QT";`
   - Add `QT` to `ContainerStatusDict` with new GUID
   - Add constant in `ContainerStatusIdConstant` class

3. **Frontend Constants** (both Angular & React `constants.ts`):
   - Add `QT: '<new-uuid>'` to `ContainerStatusIds`

4. **Optional** - If QT can transition to SCP:
   - Update `AllowedStatusChange` in `ContainerStatusItem.cs`

5. **Optional** - If status affects `ContainerTotalConstant`:
   - Add `Status_Count_QT: 'QT'` in both Angular and React constants

---

## Report

- **Tool calls**: 23
- **Files read**: 18
- **Key findings**:
  - **Primary source of truth**: `ShippingContainerStatus` SQL table in ContainerManagement DB
  - **C# constants**: `ContainerStatusConstant.cs` has 9 statuses with hardcoded UUIDs
  - **Frontend**: Statuses loaded dynamically via `/get-container-status` API and cached in localStorage/Zustand
  - **Hardcoded UUIDs**: Both Angular and React `constants.ts` files have `ContainerStatusIds` with same UUIDs as C#
  - **Status transition logic**: `AllowedStatusChange` property allows AA/AS/AAR → SCP transitions
  - **Dynamic columns**: Container totals report builds status columns dynamically from fetched data
  - **No hardcoded status strings in UI components** - all display fetched status codes
