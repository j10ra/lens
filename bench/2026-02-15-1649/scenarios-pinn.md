#### pinn-exp-01
- **Category**: Exploratory
- **Prompt**:
  `What is the data flow when a container is gated in? Trace the flow from the API endpoint through the service layer to the database repository.`
- **Judge Criteria**:
  1. API endpoint is in `Project/src/web apps/api/Controllers/v1/GatewayV1Controller.cs` or `RestApiV1Controller.cs`
  2. Service method is `GateInUnitAsync` in `ContainerControlService.cs` at `Project/src/domain/cm/AggregateModels/ContainerControl/ContainerControlService.cs`
  3. Repository is `IContainerControlRepository` at `Project/src/repository/dapper/cmdb/ContainerControlRepository.cs`
  4. `ContainerVisit` model has `GateInDate` property at `Project/src/domain/model/cm/ContainerVisit.cs`
  5. Interface `IContainerControlService` defines `GateInUnitAsync` at `Project/src/domain/cm/Interface/IContainerControlService.cs`

#### pinn-exp-02
- **Category**: Exploratory
- **Prompt**:
  `How do estimates relate to container visits? Show me the relationship between DepotInspections, Maersk_Inspections, Hapag_Inspections and the ContainerVisit entity.`
- **Judge Criteria**:
  1. `EstimateService` is at `Project/src/domain/cm/AggregateModels/Estimate/EstimateService.cs`
  2. `IEstimateRepository` interface at `Project/src/domain/cm/AggregateModels/Estimate/IEstimateRepository.cs`
  3. Repository queries tables `DepotInspections`, `Maersk_Inspections`, `Hapag_Inspections` via `ContainerVisitId`
  4. Methods `GetCedexContainerEstimatesByVisitAsync`, `GetMskContainerEstimatesByVisitAsync`, `GetHapagContainerEstimatesByVisitAsync` accept `Guid visitId`
  5. SQL query in `EstimateRepository.cs` at `Project/src/repository/dapper/cmdb/EstimateRepository.cs` joins `ContainerVisitId`

#### pinn-exp-03
- **Category**: Exploratory
- **Prompt**:
  `Explain the authentication architecture of the API. What authentication schemes are supported and how are they configured?`
- **Judge Criteria**:
  1. `Startup.cs` at `Project/src/web apps/api/Startup.cs` configures authentication
  2. Two JWT bearer schemes: `"Bearer"` and `"PinnBearer"`
  3. Azure AD integration via `AddMicrosoftIdentityWebApi` with config section `"PinnAzureAd"`
  4. Okta SAML2 configuration using `ITfoxtec.Identity.Saml2`
  5. Controllers use `[Authorize(AuthenticationSchemes = "PinnBearer,Bearer")]` attribute

#### pinn-dbg-01
- **Category**: Debug
- **Prompt**:
  `A container's damage is being categorized incorrectly. Where is the logic that determines whether damage is "Structural" or "Machinery" based on the damage type code?`
- **Judge Criteria**:
  1. Model `ContainerDamage` at `Project/src/domain/model/cm/ContainerDamage.cs`
  2. Property `DamageTypeShort` returns `"Machinery"` when `DamageType == "18"` else `"Structural"`
  3. `DamageType` property stores the code ("02" for Structural, "18" for Machinery)
  4. Table attribute `[Table("ContainerDamage")]`
  5. FK `ContainerVisitId` links damage to visit

#### pinn-dbg-02
- **Category**: Debug
- **Prompt**:
  `Workshop items are not showing the correct status. Trace how the WorkPlanQueue status is determined and where the StatusCode comes from.`
- **Judge Criteria**:
  1. Model `WorkPlanQueueItem` at `Project/src/domain/model/FieldOps/WorkPlanQueueItem.cs`
  2. Property `StatusCode` on line 11
  3. Repository `FieldOpsRepository` at `Project/src/repository/dapper/cmdb/FieldOpsRepository.cs`
  4. Method `GetWorkshopWorkItems` queries work plan queue data
  5. `ContainerVisitid` (note lowercase 'd') links to container visit

#### pinn-dbg-03
- **Category**: Debug
- **Prompt**:
  `Rail bookings are showing the wrong short status code. Find where ToBookingStatusShortCode is defined and how it transforms booking status.`
- **Judge Criteria**:
  1. Model `RailBooking` at `Project/src/domain/model/RailBooking.cs`
  2. Property `StatusShort` uses `BookingStatus.ToBookingStatusShortCode()` on line 48
  3. Property `TypeShort` uses `MovementType.ToBookingTypeShortCode()` on line 50
  4. `BookingStatus` property stores the full status string
  5. Extension method likely in `pinnacle.core.enumeration` or similar namespace

#### pinn-chg-01
- **Category**: Change-Impact
- **Prompt**:
  `We need to add a new property "EstimatedRepairHours" to container damage records. List all files that would need to be modified.`
- **Judge Criteria**:
  1. Model: `Project/src/domain/model/cm/ContainerDamage.cs` - add property
  2. Repository: `Project/src/repository/dapper/cmdb/ContainerControlRepository.cs` - update SQL queries
  3. Repository: `Project/src/repository/dapper/cmdb/FieldOpsRepository.cs` - if damage appears in work items
  4. Service: `Project/src/domain/cm/AggregateModels/ContainerControl/ContainerControlService.cs` - if business logic needed
  5. SQL migration file in `Project/src/sql/` for database schema change

#### pinn-chg-02
- **Category**: Change-Impact
- **Prompt**:
  `We want to add a new booking type "AIR" alongside Vessel, Vehicle, and Rail bookings. What files define the existing booking types and where would we add the new one?`
- **Judge Criteria**:
  1. `RailBooking` model at `Project/src/domain/model/RailBooking.cs`
  2. `VehicleBooking` model at `Project/src/domain/model/VehicleBooking.cs`
  3. `VesselBooking` referenced in `ContainerControlService.cs` via `IVesselBookingRepository`
  4. Repository interfaces at `Project/src/domain/cm/AggregateModels/ContainerControl/IVesselBookingRepository.cs`
  5. `RailBookingRepository` at `Project/src/repository/dapper/cmdb/RailBookingRepository.cs` as pattern

#### pinn-chg-03
- **Category**: Change-Impact
- **Prompt**:
  `We need to add a new container status "QUARANTINE" (QT) to the system. Map out all locations where container statuses are defined and used.`
- **Judge Criteria**:
  1. `ContainerVisit.cs` references `ShippingContainerStatusId` at line 16
  2. `ShippingContainerStatus` model referenced in `ContainerVisit` navigation property
  3. Status codes like "HLD", "AAR", "AA", "AV", "ACC", "SCP", "DEL" used in `ContainerControlRepository.cs`
  4. `IContainerControlService.GetShippingContainerStatusesAsync()` method
  5. `ContainerStatusItem` at `Project/src/domain/model/Shared/ContainerStatusItem.cs`

#### pinn-tgt-01
- **Category**: Targeted
- **Prompt**:
  `Find the React hook or component that handles container visit searching in the external web app.`
- **Judge Criteria**:
  1. `ContainerVisitScreen.tsx` at `Project/src/web apps/react-web-external/src/app/main/external/admin/container-visit/visit/ContainerVisitScreen.tsx`
  2. Uses `usePageSideBar` hook with key `'sidebar:admin:containervisit'`
  3. Renders `ContainerSearchHeader`, `ContainerSearchContent`, and `FormFilter` components
  4. Located under `Project/src/web apps/react-web-external/src/app/main/external/admin/container-visit/`

#### pinn-tgt-02
- **Category**: Targeted
- **Prompt**:
  `Where is the TanStack Query client configured in the React external app?`
- **Judge Criteria**:
  1. `TanstackQueryProvider.tsx` at `Project/src/web apps/react-web-external/src/app/shared-components/TanstackQueryProvider.tsx`
  2. Uses `QueryClient` from `@tanstack/react-query`
  3. Default options: `refetchOnWindowFocus: true`, `retry: false`
  4. Exposes `window.ToggleDevTools` function for devtools
  5. Wraps children with `QueryClientProvider`

#### pinn-tgt-03
- **Category**: Targeted
- **Prompt**:
  `Find the billing repository interface and its implementation in the Dapper layer.`
- **Judge Criteria**:
  1. Interface `IBillingRepository` at `Project/src/domain/cm/AggregateModels/Billing/IBillingRepository.cs`
  2. Service `BillingService` at `Project/src/domain/cm/AggregateModels/Billing/BillingService.cs`
  3. Repository `BillingRepository` at `Project/src/repository/dapper/cmdb/BillingRepository.cs`
  4. Invoice repository at `Project/src/repository/dapper/billingdb/InvoiceRepository.cs`
  5. Interface `IBillingService` at `Project/src/domain/cm/Interface/IBillingService.cs`
