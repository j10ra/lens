## Report

- **Tool calls**: 3
- **Files read**: 2
- **Key findings**:
  - **Interface**: `IBillingRepository` at `Project/src/domain/cm/AggregateModels/Billing/IBillingRepository.cs` — 112 methods covering billing CRUD, customer invoices, transactions, FAF rates, billing type schedules, customer rates, and financial account codes
  - **Implementation**: `BillingRepository` at `Project/src/repository/dapper/cmdb/BillingRepository.cs` — implements `IBillingRepository`, extends `BaseDapper`, uses Dapper + Dapper.Contrib for SQL Server data access
  - **Core operations**: Container visit billing items, customer account transactions, billing type schedules, customer rates with add-ons/emails, FAF rates, invoice summaries/details, and financial account codes
