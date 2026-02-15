Based on my analysis, here's the data flow when a container is gated in:

## Container Gate-In Data Flow

### 1. API Layer (Entry Point)

**`RestApiV1Controller.cs`** - Two main entry points:

- **`POST /api/v1/validate-gate-in-container`** (line 4256-4281)
  - Validates container before gate-in
  - Calls `_containerControlService.ValidateGateInUnitAsync()`
  
- **`POST /api/v1/gate-in-unit`** (implicit from bulk/booking flows, line 4371)
  - Executes gate-in
  - Calls `_containerControlService.GateInUnitAsync()`

### 2. Service Layer

**`ContainerControlService.cs`** - Core orchestration:

**Validation (`ValidateGateInUnitAsync` - line 2421):**
- Checks booking exists & not cancelled
- Verifies container not already gated in
- Validates active acceptance exists (with date range checks)
- Returns validation result with acceptance

**Gate-In Execution:**

Two overloads of `GateInUnitAsync`:

1. **With Acceptance** (line 1498-1566):
   - Creates `ContainerVisit` from acceptance data
   - Handles Off-Site/Call-Out types
   - Delegates to private `GateInUnitAsync`

2. **With Booking ID** (line 1568+):
   - Loads `VehicleBooking` by ID/reference
   - Checks booking status (not cancelled/gated-in)
   - Loads active `ContainerAcceptance`
   - Creates `ContainerVisit` via `SetupContainerVisitAsync`

**`SetupContainerVisitAsync` (line 2229):**
Creates `ContainerVisit` entity with:
- `Id` = new Guid
- `GateInDate` = current time
- Links: `ShippingContainerId`, `CustomerId`, `ShippingContainerDepotId`, `VisitIsoContainerCodeId`
- Status = "AS" (Awaiting Survey) or "AV" (if arrived AV)
- Site, AVX, Blocked=false, Deleted=false

**Private `GateInUnitAsync` (line 133-210):**
Orchestrates DB writes:
1. `InsertContainerVisitAsync` - Main visit record
2. `CreateContainerMovementAsync` - Logs "GATEIN/A100" movement
3. `AddContainerDamageSummaryAsync` - Creates damage summary
4. `AddEstimateAsync` - Creates estimate record
5. `UpdateAcceptanceAsync` - Links acceptance to visit
6. `AddContainerBlockAsync` - If block reason exists

### 3. Repository Layer

**`ContainerControlRepository.cs`**:

- **`InsertContainerVisitAsync`** (line 1973-1986):
  ```csharp
  using (IDbConnection cn = Connection)
  {
      await cn.InsertAsync(item);  // Dapper.Contrib
  }
  ```
  - Inserts into `ContainerVisit` table in **ContainerManagement DB**

- **`InsertDailyGateInAsync`** (line 2048+):
  - Inserts into `Daily_GateIn` table for daily tracking

- **`InsertContainerMovementAsync`**:
  - Inserts into `ContainerMovement` table for audit trail

### 4. Database Tables (ContainerManagement DB)

| Table | Purpose |
|-------|---------|
| `ContainerVisit` | Main visit record (central FK entity) |
| `Daily_GateIn` | Daily gate-in log |
| `ContainerMovement` | Movement history (type: "GATEIN", code: "A100") |
| `ContainerDamageSummary` | Initial damage tracking |
| `ContainerAcceptance` | Updated with `ContainerVisitId` |
| `VehicleBooking` | Updated with status="GATEDIN", `ContainerVisitId` |

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  API Layer (RestApiV1Controller)                                    │
│  POST /validate-gate-in-container  →  POST /gate-in-unit            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Service Layer (ContainerControlService)                            │
│  1. ValidateGateInUnitAsync() - validate booking/acceptance         │
│  2. GateInUnitAsync() - orchestrate gate-in                         │
│     ├── SetupContainerVisitAsync() - build ContainerVisit entity    │
│     └── GateInUnitAsync(private) - execute writes                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Repository Layer (ContainerControlRepository)                      │
│  - InsertContainerVisitAsync() → INSERT ContainerVisit              │
│  - InsertContainerMovementAsync() → INSERT ContainerMovement        │
│  - InsertDailyGateInAsync() → INSERT Daily_GateIn                   │
│  - UpdateAcceptanceAsync() → UPDATE ContainerAcceptance             │
│  - UpdateBookingAsync() → UPDATE VehicleBooking                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Database (ContainerManagement)                                     │
│  Tables: ContainerVisit, Daily_GateIn, ContainerMovement,           │
│          ContainerAcceptance, VehicleBooking, ContainerDamageSummary│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Report

- **Tool calls**: 16
- **Files read**: 12
- **Key findings**:
  - API entry: `RestApiV1Controller.cs` (`validate-gate-in-container`, `gate-in-unit` endpoints)
  - Service: `ContainerControlService.cs` (`ValidateGateInUnitAsync`, `GateInUnitAsync`, `SetupContainerVisitAsync`)
  - Repository: `ContainerControlRepository.cs` (`InsertContainerVisitAsync` uses Dapper.Contrib)
  - Database: `ContainerManagement` DB - `ContainerVisit` table (primary), plus `Daily_GateIn`, `ContainerMovement`, `ContainerAcceptance`
  - Central FK: `ContainerVisitId (Guid)` links all downstream entities (estimates, damage, workshop, billing)
