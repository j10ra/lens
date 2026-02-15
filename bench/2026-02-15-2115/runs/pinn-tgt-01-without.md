The `DaysInYard` property is defined as an expression-bodied readonly property (calculated on access) in the `Visit` domain model class.

## How It Works

**Location**: `pinnacle.domain.model.ContainerControl/Visit.cs` (line 82)

**Implementation**:
```csharp
public int DaysInYard => (int)Math.Round(
    (GateOut.HasValue 
        ? GateOut.Value.Subtract(GateIn).TotalDays 
        : DateTime.Now.Subtract(GateIn).TotalDays), 
    MidpointRounding.AwayFromZero);
```

**Logic**:
1. **If container has gated out** (`GateOut.HasValue == true`): Calculates days between `GateIn` and `GateOut`
2. **If container is still in yard** (`GateOut` is null): Calculates days between `GateIn` and current time (`DateTime.Now`)
3. Uses `MidpointRounding.AwayFromZero` - so 2.5 days rounds to 3, not 2
4. Returns an `int` (whole number of days)

**Key dependencies**:
- `GateIn` (DateTime) - required, the entry timestamp
- `GateOut` (DateTime?) - nullable, the exit timestamp

Both `Pinnacle System` and `React Web Master` projects have identical implementations.

---

## Report

- **Tool calls**: 6
- **Tools used**: Grep, Read, Glob
- **Files read**: 1
- **Files used**: 
  - `/Volumes/Drive/__x/Pinnacle/React Web Master/Project/src/domain/model/ContainerControl/Visit.cs`,
  - `/Volumes/Drive/__x/Pinnacle/Pinnacle System/Project/src/domain/model/ContainerControl/Visit.cs`
- **Key findings**:
  - `DaysInYard` is a computed property (expression-bodied member) in the `Visit` domain model
  - Calculates days from `GateIn` to either `GateOut` (if exists) or `DateTime.Now`
  - Uses `MidpointRounding.AwayFromZero` for rounding (0.5 rounds up)
  - Both Pinnacle System and React Web Master have identical implementations at line 82
