## Report

- **Tool calls**: 4 (2 Grep/Glob searches + 2 file reads)
- **Files read**: 2
- **Key findings**:
  - **Interface**: `IBillingRepository` located at `Project/src/domain/cm/AggregateModels/Billing/IBillingRepository.cs` - contains 97+ method signatures for billing operations
  - **Implementation**: `BillingRepository` at `Project/src/repository/dapper/cmdb/BillingRepository.cs` - extends `BaseDapper`, implements `IBillingRepository` and `IService`
  - **Key capabilities**: CRUD for billing items, customer account transactions, invoice summaries, billing type schedules, customer rates, FAF rates, GST configuration, rate codes/groups
  - **Database**: Uses `ContainerManagement` DB (cmdb) - tables include `ContainerVisitBillingItem`, `BillingType`, `CustomerAccountTransactions`, `CustomerInvoiceSummary`
