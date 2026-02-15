Boss, I now have a complete picture of the container gate-in data flow. Here's the trace:

---

## Container Gate-In Data Flow

### 1. API Layer (Entry Points)

**Primary endpoint** (`RestApiV1Controller.cs:4345-4400`):
```
POST /api/v1/gate-in-container
```

Two paths trigger gate-in:
1. **Manual gate-in via booking**: `gate-in-container` endpoint
2. **EDI batch processing**: `GateInService.ProcessAsync()` for automated CODECO message parsing

### 2. Request Model
```csharp
GateInContainerItem {
    ContainerNo, VbsBookingReference, DepotSite, 
    Controller, Comment, VehicleBookingId
}
```

### 3. Service Layer (`ContainerControlService.cs`)

**Validation flow** (`ValidateGateInUnitAsync` at line 2421):
1. Find booking by `VbsBookingReference` or `VehicleBookingId`
2. Check booking status (not CANCELLED, not already GATEDIN)
3. Verify container not already gated-in at depot (`FindActiveAsync`)
4. Verify container not gated-in elsewhere (`FindContainerGatedInAsync`)
5. Get active acceptance for container

**Gate-in execution** (`GateInUnitAsync` at line 1568):
1. **Lock acquisition** - `await m_lock.LockAsync()` (prevents concurrent gate-ins)
2. **Create ContainerVisit entity** via `SetupContainerVisitAsync` (line 2229):
   - Maps acceptance data → ContainerVisit
   - Sets `GateInDate`, `Site`, `AVX`, status
   - Links to `ShippingContainerId`, `CustomerId`, `DepotId`

### 4. Core Gate-In Operations (private `GateInUnitAsync` at line 133)

Sequential database writes:

| Order | Table | Repository Method | Purpose |
|-------|-------|-------------------|---------|
| 1 | `ContainerVisit` | `InsertContainerVisitAsync` | Creates visit record |
| 2 | `DepotRecordIdentifier` | `InsertDepotRecordIdentifierAsync` | Audit trail |
| 3 | `ContainerMovement` | `InsertContainerMovementAsync` | Movement history (type: GATEIN, subtype: A100) |
| 4 | `ContainerDamageSummary` | `InsertContainerDamageSummaryAsync` | Damage tracking |
| 5 | `DepotInspection` | `InsertDepotInspectionAsync` | Survey/estimate record |
| 6 | `ContainerComment` | `InsertContainerCommentAsync` | Comments from acceptance |
| 7 | `Daily_GateIn` | `InsertDailyGateInAsync` | Daily operational log |
| 8 | `TransportMovementStaging` | `InsertTransportMovementStagingAsync` | Transport integration |
| 9 | `VehicleBooking` | `UpdateBookingAsync` | Mark booking as GATEDIN |
| 10 | `ContainerAcceptance` | `UpdateAcceptanceAsync` | Link acceptance to visit |

### 5. Repository Layer (`ContainerControlRepository.cs`)

Uses **Dapper.Contrib** for ORM:
```csharp
public async Task InsertContainerVisitAsync(ContainerVisit item) {
    using (IDbConnection cn = Connection) {
        await cn.InsertAsync(item);  // Dapper.Contrib extension
    }
}
```

### 6. Database Tables (ContainerManagement DB)

**Central entity** - `ContainerVisit`:
```sql
[Id] UNIQUEIDENTIFIER (PK)
[ShippingContainerId] UNIQUEIDENTIFIER (FK)
[CustomerId] UNIQUEIDENTIFIER (FK)
[ShippingContainerDepotId] UNIQUEIDENTIFIER (FK)
[GateInDate] DATETIME
[GateOutDate] DATETIME NULL
[Site] VARCHAR -- depot site (A, B, etc.)
[AVX] VARCHAR -- status flag
[Hold] VARCHAR
[Blocked] BIT
[Deleted] BIT
```

### 7. Post-Gate-In Side Effects

After successful gate-in:
- **VBS notification**: `SendGateOutMessageToVbsAsync` (vehicle booking system)
- **SignalR broadcast**: `SendTIYbookingMessageToSignalRAsync` (real-time UI updates)
- **Triton integration**: `SendGateEventToTritonAsync` (3rd party)
- **Billing initiation**: `AddContainerBillingAsync`
- **Maersk fetch** (if MSK customer): `GetContainerDetailsAsync`

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT (React/Angular/EDI)                                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API LAYER                                                          │
│  RestApiV1Controller.GateInContainer()                              │
│  POST /api/v1/gate-in-container                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER                                                       │
│  ContainerControlService.GateInUnitAsync()                          │
│  ├── ValidateGateInUnitAsync() - validation                         │
│  ├── SetupContainerVisitAsync() - build entity                      │
│  └── GateInUnitAsync(private) - execute with lock                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  REPOSITORY LAYER                                                    │
│  ContainerControlRepository (Dapper ORM)                            │
│  ├── InsertContainerVisitAsync()                                    │
│  ├── InsertContainerMovementAsync()                                 │
│  ├── InsertDailyGateInAsync()                                       │
│  └── UpdateAcceptanceAsync() / UpdateBookingAsync()                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DATABASE (SQL Server - ContainerManagement)                        │
│  ├── ContainerVisit (main record)                                   │
│  ├── ContainerMovement (audit)                                      │
│  ├── Daily_GateIn (operational log)                                 │
│  ├── ContainerAcceptance (updated with ContainerVisitId)            │
│  └── VehicleBooking (status = GATEDIN)                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Report

- **Tool calls**: 14
- **Files read**: 8
- **Key findings**:
  - Gate-in uses **async locking** (`m_lock.LockAsync()`) to prevent concurrent operations on the same container
  - Central FK is `ContainerVisitId (Guid)` - links to damage, estimates, billing, transport
  - Two entry points: manual API (`gate-in-container`) and EDI batch (`GateInService.ProcessAsync`)
  - **10+ tables** written in a single gate-in transaction (ContainerVisit, ContainerMovement, Daily_GateIn, VehicleBooking, etc.)
  - Repository uses **Dapper.Contrib** with `[Table]`, `[ExplicitKey]`, `[Write(false)]` attributes
