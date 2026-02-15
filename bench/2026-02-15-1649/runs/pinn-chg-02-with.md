Now I have a complete picture. Let me summarize the findings.

Boss, I've analyzed the codebase to identify all files that define the existing booking types (Vessel, Vehicle, Rail) and where you'd need to add the new **AIR** booking type.

## Architecture Overview

Each booking type follows a consistent layered pattern:

```
Frontend (React/Angular) → API Controller → Domain Service → Repository → SQL Database
```

## Files to Create/Modify for AIR Booking

### 1. Domain Model Layer
**Create:**
- `Project/src/domain/model/AirBooking.cs` — Entity model with `[Table("AirBooking")]`, implements `IAggregateRoot`

**Reference existing:**
- `Project/src/domain/model/VesselBooking.cs` — Vessel model
- `Project/src/domain/model/VehicleBooking.cs` — Vehicle model  
- `Project/src/domain/model/RailBooking.cs` — Rail model

### 2. Domain Service Layer
**Create:**
- `Project/src/domain/cm/Interface/IAirBookingService.cs` — Service interface
- `Project/src/domain/cm/AggregateModels/ContainerControl/AirBookingService.cs` — Service implementation
- `Project/src/domain/cm/AggregateModels/ContainerControl/IAirBookingRepository.cs` — Repository interface

**Reference existing:**
- `Project/src/domain/cm/Interface/IVesselBookingService.cs:8`
- `Project/src/domain/cm/Interface/IRailBookingService.cs:8`
- `Project/src/domain/cm/Interface/IVehicleBookingService.cs:9`
- `Project/src/domain/cm/AggregateModels/ContainerControl/VesselBookingService.cs:14`
- `Project/src/domain/cm/AggregateModels/ContainerControl/RailBookingService.cs:15`
- `Project/src/domain/cm/AggregateModels/ContainerControl/VehicleBookingService.cs:19`

### 3. Repository Layer
**Create:**
- `Project/src/repository/dapper/cmdb/AirBookingRepository.cs` — Dapper repository

**Reference existing:**
- `Project/src/repository/dapper/cmdb/VesselBookingRepository.cs:18`
- `Project/src/repository/dapper/cmdb/RailBookingRepository.cs:19`
- `Project/src/repository/dapper/cmdb/VehicleBookingRepository.cs:20`

### 4. API Layer
**Add endpoints in:**
- `Project/src/web apps/api/Controllers/v1/RestApiV1Controller.cs` — Add endpoints like `[HttpPost("air-booking")]`, `[HttpPost("air-bookings")]`, etc.

**Reference existing patterns at:**
- Lines 13023-13266 (vessel-booking endpoints)
- Lines 10017-10443 (rail-booking endpoints)

### 5. API Models
**Create:**
- `Project/src/web apps/api/Models/AirBookingItem.cs`
- `Project/src/web apps/api/Models/AirBookingSearchItem.cs` (if needed)

**Reference existing:**
- `Project/src/web apps/api/Models/VesselBookingItem.cs`
- `Project/src/web apps/api/Models/RailBookingItem.cs`
- `Project/src/web apps/api/Models/VehicleBookingItem.cs`

### 6. SignalR Hub Events
**Add in `RestApiV1Controller.cs`:**
- `air-booking-new`, `air-booking-update`, `air-booking-delete` events

**Reference existing at:**
- Lines 17768-17774 (rail-booking SignalR)
- Lines 18544-18550 (vessel-booking SignalR)

### 7. Constants (Optional)
**Modify:**
- `Project/src/core/common/constant/VehicleBookingStatusConstant.cs:6` — Statuses are shared across booking types; consider if AIR needs specific statuses

### 8. Frontend - React
**Create directory structure:**
```
Project/src/web apps/react-web-external/src/app/main/logistics/air/
├── air-in/
│   ├── AirInScreen.tsx
│   ├── AirInContent.tsx
│   ├── AirInHeader.tsx
│   ├── components/
│   │   ├── AirInColumnDef.ts
│   │   ├── AirInFilter.tsx
│   │   └── AirInTable.tsx
│   ├── dialogs/
│   │   └── AirInDetails.tsx
│   └── services/
│       ├── useAirBookings.tsx
│       ├── useAirInData.tsx
│       └── useAirBookingUpdate.tsx
└── air-out/
    └── (similar structure)
```

**Reference existing:**
- `Project/src/web apps/react-web-external/src/app/main/logistics/rail/rail-in/services/useRailBookings.tsx:28`

### 9. Frontend - Angular
**Create directory structure:**
```
Project/src/web apps/mypinnacle/src/app/main/apps/container-control/air/
├── air-in/
│   ├── air-in.component.ts
│   ├── air-in.component.html
│   └── air-in.component.scss
├── air-out/
└── air.service.ts
```

**Reference existing:**
- `Project/src/web apps/mypinnacle/src/app/main/apps/container-control/rail/rail-in/rail-in.component.ts:47`

### 10. DI Registration
**No changes needed** — Services auto-registered via assembly scanning:
- `Project/src/domain/cm/ServiceRegistrar.cs:9` — Services implementing `IService`
- `Project/src/repository/dapper/cmdb/ServiceRegistrar.cs:8` — Repositories implementing `IService`

### 11. Database Migration
**Create:**
- `Project/src/sql/[TICKET].ContainerManagement.sql` — CREATE TABLE AirBooking with similar columns to RailBooking/VehicleBooking

---

## Report

- **Tool calls**: 29
- **Files read**: 24
- **Key findings**:
  - Three booking types exist: Vessel, Vehicle, Rail — each follows identical layered architecture (Model → Service Interface → Service → Repository Interface → Repository → API Controller → Frontend)
  - DI registration uses assembly scanning (`ServiceRegistrar.cs`) — any new class implementing `IService` auto-registers
  - `VehicleBookingStatusConstant.cs` defines shared booking statuses (BOOKED, CANCELLED, GATED-IN, GATED-OUT, TRUCK-IN-YARD, PENDING)
  - `StringExtension.cs` contains `ToBookingTypeShortCode()` for PICKUP→PKP, DROP-OFF→DRP conversion
  - API endpoints follow RESTful pattern: `[HttpPost("xxx-booking")]`, `[HttpPost("xxx-bookings")]` for list queries
  - SignalR events follow pattern: `xxx-booking-new`, `xxx-booking-update`, `xxx-booking-delete`
