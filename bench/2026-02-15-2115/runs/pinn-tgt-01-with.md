## DaysInYard Implementation

**Primary Location:** `Visit.cs` (both projects)
- `Pinnacle System/Project/src/domain/model/ContainerControl/Visit.cs:82`
- `React Web Master/Project/src/domain/model/ContainerControl/Visit.cs:82`

### The Calculation (Domain Model)

```csharp
public int DaysInYard => (int)Math.Round(
    (GateOut.HasValue 
        ? GateOut.Value.Subtract(GateIn).TotalDays 
        : DateTime.Now.Subtract(GateIn).TotalDays), 
    MidpointRounding.AwayFromZero);
```

**How it works:**
1. **If container has gated out** (`GateOut.HasValue`): Calculates `GateOut - GateIn` in days
2. **If still in yard** (no GateOut): Calculates `Now - GateIn` in days
3. Uses `MidpointRounding.AwayFromZero` - rounds 0.5 up to 1 (not banker's rounding)
4. Casts to `int` for whole number result

---

### Secondary Implementation (GateOut Validation)

**Location:** `ContainerControlService.cs:2408-2409`
```csharp
daysInYard = Math.Round((visit.GateOutDate.HasValue 
    ? visit.GateOutDate.Value.Subtract(visit.GateInDate).TotalDays + 1 
    : DateTime.Now.Subtract(visit.GateInDate).TotalDays + 1)).ToString();
```

**Difference:** Adds `+1` to count the day of gate-in as a full day (inclusive counting).

---

### SQL-based Calculation

**Location:** `ContainerControlRepository.cs` (lines 4374, 5473)
```sql
DATEDIFF(DAY, cv.GateInDate, GETDATE()) AS DaysInYard
```
Used for reporting queries where the value is computed at database level.

---

## Report

- **Tool calls**: 4
- **Tools used**: Grep, Read
- **Files read**: 4
- **Files used**: 
  - `Pinnacle System/Project/src/domain/model/ContainerControl/Visit.cs`
  - `Pinnacle System/Project/src/domain/cm/AggregateModels/ContainerControl/ContainerControlService.cs`
  - `React Web Master/Project/src/domain/model/ContainerControl/Visit.cs`
- **Key findings**:
  - Primary implementation is a computed property in `Visit.cs:82` using expression-bodied member
  - Logic: `(GateOut - GateIn)` or `(Now - GateIn)` rounded with `MidpointRounding.AwayFromZero`
  - GateOut validation in `ContainerControlService` uses `+1` for inclusive day counting
  - SQL queries use `DATEDIFF(DAY, GateInDate, GETDATE())` for same calculation at DB level
