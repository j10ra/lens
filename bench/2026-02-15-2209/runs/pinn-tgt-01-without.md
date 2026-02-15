Now I have the complete picture. Here's how `DaysInYard` works:

## DaysInYard Implementation

The **primary calculation** is in `Project/src/domain/model/ContainerControl/Visit.cs:82`:

```csharp
public int DaysInYard => (int)Math.Round(
    (GateOut.HasValue 
        ? GateOut.Value.Subtract(GateIn).TotalDays 
        : DateTime.Now.Subtract(GateIn).TotalDays), 
    MidpointRounding.AwayFromZero);
```

### How It Works

1. **Computed property** - not stored in DB, calculated on-demand
2. **Logic**:
   - If container has **gated out** (`GateOut` has value): calculates days between `GateIn` and `GateOut`
   - If container is **still in yard**: calculates days from `GateIn` to `DateTime.Now`
3. **Rounding**: Uses `MidpointRounding.AwayFromZero` - so 2.5 days becomes 3, not 2

### Other Implementations

There are **SQL-based calculations** in `ContainerControlRepository.cs` used for specific queries:

- **Line 4374** - For `ContainerAllocationItem`:
  ```sql
  DATEDIFF(DAY, cv.GateInDate, GETDATE()) AS DaysInYard
  ```

- **Line 5473** - For `ContainerBlockItem`:
  ```sql
  DATEDIFF(DAY, cv.GateInDate, GETDATE()) AS DaysInYard
  ```

These SQL versions only calculate **current** days in yard (no GateOut consideration), whereas the C# model property handles both active and completed visits.

---

## Report

- **Tool calls**: 2
- **Tools used**: Grep, Read
- **Files read**: 1
- **Files used**: Project/src/domain/model/ContainerControl/Visit.cs, Project/src/repository/dapper/cmdb/ContainerControlRepository.cs
- **Key findings**:
  - Primary implementation: `Visit.cs:82` - computed property using C# expression
  - Formula: `(GateOut - GateIn)` for completed visits, `(Now - GateIn)` for active visits
  - Rounding: `MidpointRounding.AwayFromZero` ensures 2.5 → 3 days
  - SQL versions exist in repository for allocation/block queries using `DATEDIFF(DAY, GateInDate, GETDATE())`
