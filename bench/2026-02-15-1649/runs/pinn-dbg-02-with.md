Now I have a complete picture. Let me summarize the flow and identify the potential issue.

## Report

- **Tool calls**: 24
- **Files read**: 12
- **Key findings**:
  - **StatusCode Source**: The `StatusCode` displayed in workshop items comes from `ShippingContainerStatus.Code` joined via `ContainerVisit.ShippingContainerStatusId` in the SQL queries in `FieldOpsRepository.cs:112,263`.
  - **Data Flow**:
    1. **Backend**: `FieldOpsRepository.GetWorkshopWorkItems()` (line 108-143) and `GetWorkplanQueueDetails()` (line 259-278) query `WorkPlanQueue` joined with `ContainerVisit` and `ShippingContainerStatus` to get `StatusCode = ShippingContainerStatus.Code`.
    2. **Frontend API**: `workshop-container-data/{depotCode}` calls `GetWorkshopContainersByDepotAsync()` which returns `ContainerVisit` objects with nested `ShippingContainerStatus` object.
    3. **IndexedDB Storage**: Container visits stored in `workshopContainerVisitDetails` table with `shippingContainerStatus` nested object containing `code`.
    4. **Display**: Workshop queue components (`workshop-queue.component.html:81`, `work-plan-queues.component.html:63`) display `{{planQueue?.statusCode}}`.
  - **Potential Issue**: The `StatusCode` in `WorkPlanQueueItem` is populated at **query time** from the `ShippingContainerStatus` table via JOIN. If the container's status changes in the database (e.g., from `HLD` to `AV`), the `WorkPlanQueueItem.statusCode` is **not updated** in IndexedDB until a full data refresh occurs. The frontend stores `statusCode` statically when the workshop item is fetched/created, and there's no mechanism to update it when the container visit status changes in the backend.
  - **Root Cause**: `statusCode` is a snapshot from when data was fetched, not a live reference. The `WorkPlanQueue` table does not store `StatusCode` - it's computed via SQL JOIN at fetch time. The Angular app caches this in IndexedDB (`workshopItems` and `workshopItemUpdates` tables) but never refreshes the status unless the user manually triggers a data refresh.
