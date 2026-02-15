The damage type code logic is distributed across multiple layers. Here's the complete picture:

## Core Logic Locations

### 1. Constants Definition
**`Project/src/core/common/constant/DamageTypeConstant.cs:7-8`**
```csharp
public const string MACHINERY = "18";
public const string STRUCTURAL = "02";
```

### 2. Domain Model Computed Properties
**`Project/src/domain/model/cm/ContainerDamage.cs:54`**
```csharp
public string DamageTypeShort => DamageType == "18" ? "Machinery" : "Structural";
```

**`Project/src/domain/model/ContainerControl/VisitDamage.cs:21`**
```csharp
public string DamageTypeCode => DamageType == "02" ? "CON" : "REF";
```

### 3. Angular Frontend (Repairer Module)
**`Project/src/web apps/mypinnacle/src/app/main/apps/repairer/constants.ts:1`**
```typescript
export const STRUCTURAL_DAMAGE_CODE = '02';
```

Used in **`add-to-workshop.component.ts:212-228`** to filter structural damages only - **note: this only handles '02', ignores '18' (machinery)**.

### 4. Frontend Display Logic
Multiple Angular/React files use inline ternary:
```typescript
damageType == '02' ? 'Structural' : 'Machinery'
```

Found in: `visit-main-info.component.ts:1821`, `movement-main-info.component.ts:1715`, `container-visit-main-info.component.ts:1770`

### 5. Backend Service Usage
**`ContainerControlService.cs`** uses `DamageTypeConstant.MACHINERY` and `DamageTypeConstant.STRUCTURAL` for filtering.

---

## Report

- **Tool calls**: 6
- **Files read**: 4
- **Key findings**:
  - **Damage type codes**: `"02"` = Structural, `"18"` = Machinery (reefer)
  - **Core constant**: `Project/src/core/common/constant/DamageTypeConstant.cs`
  - **Model computed property**: `ContainerDamage.cs:54` - `DamageTypeShort` uses ternary `DamageType == "18" ? "Machinery" : "Structural"` - **this is the categorization logic**
  - **Workshop filter only handles Structural ('02')**: `add-to-workshop.component.ts:216` filters by `STRUCTURAL_DAMAGE_CODE` but has no equivalent `MACHINERY_DAMAGE_CODE` constant or logic - machinery damages are excluded from the repair list
  - **BillingService sets damage type based on template**: `BillingService.cs:2667` - `DamageType = summary.TemplateCode == InvoiceTemplateConstant.REEFER ? "18" : "02"`
