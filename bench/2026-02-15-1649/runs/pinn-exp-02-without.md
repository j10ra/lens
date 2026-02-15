Now I have the full picture. Here's the relationship diagram:

## Estimate → ContainerVisit Relationship

```
ContainerVisit (Guid Id)
    │
    ├── DepotInspection (Guid ContainerVisitId FK)
    │       └── DepotInspectionsLines (Guid DepotInspectionsId FK)
    │
    ├── Maersk_Inspections (Guid ContainerVisitId FK)
    │       └── Maersk_Lines (Guid MaerskInspectionsId FK)
    │
    └── Hapag_Inspections (Guid ContainerVisitId FK)
            └── Hapag_Lines (long Inspect FK → HapagInspections.id)
```

### Key Relationship Details

| Entity | PK | FK to ContainerVisit | Table |
|--------|-----|---------------------|-------|
| **ContainerVisit** | `Guid Id` | — | `ContainerVisit` |
| **DepotInspection** | `Guid id` | `ContainerVisitId` | `DepotInspections` |
| **MaerskInspections** | `Guid id` | `ContainerVisitId` | `Maersk_Inspections` |
| **HapagInspections** | `long id` | `ContainerVisitId` | `Hapag_Inspections` |

### Purpose by Type

| Inspection Type | Customer | Use Case |
|-----------------|----------|----------|
| **DepotInspection** | Generic/All | Standard depot surveys, EDI integrations |
| **MaerskInspections** | Maersk Line | Maersk-specific workflow, EDI format |
| **HapagInspections** | Hapag-Lloyd | Hapag-specific workflow, uses `long` PK |

### Line Items (Estimate Details)

Each inspection type has its own line items table:

| Parent | Lines Table | FK Column |
|--------|-------------|-----------|
| DepotInspection | `DepotInspectionsLines` | `DepotInspectionsId` |
| MaerskInspections | `Maersk_Lines` | `MaerskInspectionsId` |
| HapagInspections | `Hapag_Lines` | `Inspect` (references `Hapag_Inspections.id`) |

### Common Estimate Fields

All three share similar structure:
- **Status tracking**: `status`, dates (surveyed, approved, repaired, EDI sent)
- **Financials**: `StructuralTotal`, `MachineryTotal`, approved totals
- **Machinery/Reefer**: `MachineryType`, `MCStatus`, `PTIDate`, `Engineer`
- **Workflow flags**: `Supplementary`, `NAR`, `AVXSurvey`, `ExteriorCheck`

The `ContainerVisitId` is the central FK linking all estimate types back to the container visit record, enabling multiple estimate workflows per visit depending on customer requirements.

## Report

- **Tool calls**: 6
- **Files read**: 6
- **Key findings**:
  - All three inspection types (Depot, Maersk, Hapag) link to `ContainerVisit` via `ContainerVisitId` FK
  - Each inspection type has its own line items table with component/damage/repair codes
  - Hapag uses `long` PK while Depot and Maersk use `Guid` PKs
  - Inspection types are customer-specific: generic depot vs Maersk vs Hapag-Lloyd workflows
