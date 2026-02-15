## Report

- **Tool calls**: 16
- **Files read**: 12
- **Key findings**:
  - **StatusCode Source**: The `StatusCode` for `WorkPlanQueueItem` comes from `ShippingContainerStatus.Code` via an INNER JOIN in the SQL query at `FieldOpsRepository.cs:112` and `FieldOpsRepository.cs:263`
  - **Join Path**: `WorkPlanQueue` → `ContainerVisit` (on `ContainerVisitid`) → `ShippingContainerStatus` (on `ShippingContainerStatusId`)
  - **Data Flow**: 
    1. Backend SQL query joins `WorkPlanQueue` with `ContainerVisit` and `ShippingContainerStatus`
    2. `StatusCode` is selected as `ShippingContainerStatus.Code` 
    3. Returned via `WorkPlanQueueItem` model to API controller
    4. Angular frontend displays `statusCode` in workshop queue templates (line 81: `{{planQueue?.statusCode}}`)
  - **Potential Issue Location**: The status shown is the **ContainerVisit's status**, not a WorkPlanQueue-specific status. If workshop items show incorrect status, the issue is likely:
    1. `ContainerVisit.ShippingContainerStatusId` pointing to wrong status record
    2. Status not being updated when container moves through workflow
    3. Cached data in IndexedDB (`db.workshopItems`) not being refreshed
