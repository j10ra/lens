Based on my analysis, I have a comprehensive understanding of the codebase structure. This is a container management system (Pinnacle) with:
- Backend: ASP.NET Core API with Dapper ORM and SQL Server
- Frontend: Angular (mypinnacle) and React (react-web-external) apps
- Domain layers for container control, estimates, billing, transport, and events

#### pinn-exp-01
- **Category**: Exploratory
- **Prompt**:
  `How does the estimate workflow handle the three different inspection types (CEDEX, Maersk, Hapag) from data retrieval through the API? Trace the flow from when an estimate ID is requested at the API endpoint to the database query execution.`
- **Judge Criteria**:
  1. Must mention `EstimateV1Controller` at path `Project/src/web apps/api/Controllers/v1/EstimateV1Controller.cs` with route `v1/estimate`
  2. Must reference `IEstimateService` methods: `GetCedexContainerEstimateAsync`, `GetMskContainerEstimateAsync`, `GetHapagContainerEstimateAsync`
  3. Must identify `EstimateRepository` at `Project/src/repository/dapper/cmdb/EstimateRepository.cs` containing SQL queries for all three inspection tables: `DepotInspections`, `Maersk_Inspections`, `Hapag_Inspections`
  4. Must note that CEDEX/Maersk use GUID ids while Hapag uses `long` (checked via `Guid.TryParse` in controller line ~87)
  5. Must mention the authentication scheme `"PinnBearer,Bearer"` used by the estimate controller
