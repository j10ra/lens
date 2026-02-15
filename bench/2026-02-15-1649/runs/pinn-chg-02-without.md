Now I have a complete picture. Let me provide the summary.

Boss, here's the complete analysis of booking type definitions in the codebase:

## Booking Type Architecture Summary

### Core Pattern
Each booking type follows a **4-layer architecture**:
1. **Domain Model** (`Project/src/domain/model/`)
2. **Repository Interface** (`Project/src/domain/cm/AggregateModels/ContainerControl/`)
3. **Repository Implementation** (`Project/src/repository/dapper/cmdb/`)
4. **Service Layer** (Interface + Implementation)

---

### Files to Create for AIR Booking

| Layer | Path | Pattern File to Reference |
|-------|------|---------------------------|
| **Domain Model** | `Project/src/domain/model/AirBooking.cs` | `RailBooking.cs` |
| **Repository Interface** | `Project/src/domain/cm/AggregateModels/ContainerControl/IAirBookingRepository.cs` | `IRailBookingRepository.cs` |
| **Repository Impl** | `Project/src/repository/dapper/cmdb/AirBookingRepository.cs` | `RailBookingRepository.cs` |
| **Service Interface** | `Project/src/domain/cm/Interface/IAirBookingService.cs` | `IRailBookingService.cs` |
| **Service Impl** | `Project/src/domain/cm/AggregateModels/ContainerControl/AirBookingService.cs` | `RailBookingService.cs` |
| **API Model** | `Project/src/web apps/api/Models/AirBookingItem.cs` | `RailBookingItem.cs` |
| **SQL Migration** | `Project/src/sql/[TICKET].ContainerManagement.sql` | Create `AirBooking` table |

---

### Existing Booking Types Reference

**VesselBooking** (Bulk vessel discharge/load)
- `Project/src/domain/model/VesselBooking.cs:9`
- `Project/src/repository/dapper/cmdb/VesselBookingRepository.cs:18`
- `Project/src/domain/cm/Interface/IVesselBookingService.cs:8`

**VehicleBooking** (Truck pick-up/drop-off)
- `Project/src/domain/model/VehicleBooking.cs:9`
- `Project/src/repository/dapper/cmdb/VehicleBookingRepository.cs`
- `Project/src/domain/cm/Interface/IVehicleBookingService.cs`

**RailBooking** (Rail wagon transport)
- `Project/src/domain/model/RailBooking.cs:8`
- `Project/src/repository/dapper/cmdb/RailBookingRepository.cs`
- `Project/src/domain/cm/Interface/IRailBookingService.cs`

---

### Frontend Files

**React** (`react-web-external/src/app/`):
- Schema: `schema/AirBookingItem.ts` (reference `RailBookingItem.ts:1`)
- Services: `services/container-visit/useGetVisitAirBookings.ts`
- Screens: `main/logistics/air/air-in/` and `air-out/` (reference `rail/` structure)

**Angular** (`mypinnacle/src/app/`):
- Module: `main/apps/air-booking/air-booking.module.ts`
- Models: `core/models/air-booking/air-booking-item.ts`
- Services: `main/apps/air-booking/air.service.ts`

---

### Key Shared Components

- Movement types: `Project/src/core/common/constant/VehicleBookingMovementConstant.cs:5` (`PICKUP`, `DROP-OFF`)
- Booking status: `Project/src/core/common/constant/VehicleBookingStatusConstant.cs`
- Common FK: `ContainerVisitId (Guid)` links bookings to container visits

---

## Report

- **Tool calls**: 20
- **Files read**: 15
- **Key findings**:
  - Each booking type has 6 core files: Model, Repository (interface + impl), Service (interface + impl), API Model
  - VehicleBookingRepository handles truck bookings with carrier/driver details
  - RailBookingRepository handles rail wagon bookings with rail-specific fields (railService, railDestination, cutOffDateTime)
  - VesselBooking handles bulk vessel bookings with vessel ETA/reference
  - SQL tables are in `ContainerManagement` database with history tables (e.g., `VehicleBookingHistory`)
  - Frontend follows parallel structure: React schema + services + screens, Angular module + services + components
  - All booking types use `ContainerVisitId` as FK linking to container visits
  - MovementType constant (`PICKUP`/`DROP-OFF`) is shared across all booking types
