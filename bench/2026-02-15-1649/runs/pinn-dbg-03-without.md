Now I have a clear picture. The `ToBookingStatusShortCode` extension method in `StringExtension.cs` only handles 4 statuses:
- BOOKED → BKD
- CANCELLED → CLD  
- TRUCK-IN-YARD → TIY
- PENDING → PDG

But the `VehicleBookingStatusConstant.cs` shows there are **additional statuses** that are NOT mapped:
- GATED-IN
- GATED-OUT
- REQUEST

These statuses fall through to the default `return statusCode;` which returns the full status name instead of a short code.

## Report

- **Tool calls**: 4
- **Files read**: 5
- **Key findings**:
  - `ToBookingStatusShortCode` is defined in `Project/src/domain/model/Shared/StringExtension.cs:10-27`
  - It's an extension method that transforms booking status strings to short codes
  - Only 4 statuses are mapped: BOOKED→BKD, CANCELLED→CLD, TRUCK-IN-YARD→TIY, PENDING→PDG
  - Missing mappings for `GATED-IN`, `GATED-OUT`, and `REQUEST` - these return the full status unchanged
  - `RailBooking.StatusShort` (line 48) and `VehicleBooking.StatusShort` (line 76) both use this method
  - The `VehicleBookingStatusConstant.cs` defines 7 statuses total, but only 4 have short code mappings
