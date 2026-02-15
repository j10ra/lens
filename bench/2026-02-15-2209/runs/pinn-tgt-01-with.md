## DaysInYard Implementation

There are **two implementations** of `DaysInYard`:

### 1. Client-Side Calculation (Visit.cs - line 82)

**File:** `Project/src/domain/model/ContainerControl/Visit.cs:82`

```csharp
public int DaysInYard => (int)Math.Round(
    GateOut.HasValue 
        ? GateOut.Value.Subtract(GateIn).TotalDays 
        : DateTime.Now.Subtract(GateIn).TotalDays, 
    MidpointRounding.AwayFromZero);
```

**Logic:**
- If container has **gated out** (`GateOut` has value) → calculates days between `GateIn` and `GateOut`
- If container is **still in yard** → calculates days between `GateIn` and `DateTime.Now`
- Uses `Math.Round` with `MidpointRounding.AwayFromZero` (rounds 0.5 up to 1, not down to 0)
- Returns `int` (whole days)

### 2. SQL Server Calculation (Repository queries)

**File:** `Project/src/repository/dapper/cmdb/ContainerControlRepository.cs`

Two queries use SQL `DATEDIFF`:

**Query 1** (line 4374 - Container Allocations):
```sql
DATEDIFF(DAY, cv.GateInDate, GETDATE()) AS DaysInYard
```

**Query 2** (line 5473 - Container Blocks/Holds):
```sql
DATEDIFF(DAY, cv.GateInDate, GETDATE()) AS DaysInYard
```

**SQL Logic:**
- Counts day boundaries crossed between `GateInDate` and `GETDATE()`
- Always uses current date (doesn't account for gated-out containers)
- Populates `ContainerAllocationItem.DaysInYard` and `ContainerBlockItem.DaysInYard` DTOs

---

## Report

- **Tool calls**: 4
- **Tools used**: Grep, Read
- **Files read**: 4
- **Files used**: `Project/src/domain/model/ContainerControl/Visit.cs`, `Project/src/repository/dapper/cmdb/ContainerControlRepository.cs`, `Project/src/domain/model/Shared/ContainerBlockItem.cs`, `Project/src/domain/model/Shared/ContainerAllocationItem.cs`
- **Key findings**:
  - **Two implementations exist**: C# computed property in `Visit.cs` and SQL `DATEDIFF` in repository queries
  - **C# version** handles both gated-out and in-yard containers; **SQL version** only calculates from gate-in to current date
  - C# uses `MidpointRounding.AwayFromZero` for proper rounding (0.5 → 1)
  - DTOs (`ContainerBlockItem`, `ContainerAllocationItem`) receive pre-calculated values from SQL queries
