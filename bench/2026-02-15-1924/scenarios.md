#### cse-exp-01
- **Category**: Exploratory
- **Prompt**:
  `What Azure services does this GitHub App integrate with and what is the purpose of each integration?`
- **Judge Criteria**:
  1. The app uses Azure SQL Database (via `mssql` package) to store survey results in a table named `SurveyResults` (index.js:246-276)
  2. Azure Cognitive Service for Language is used for language detection via `@azure/ai-language-text` with `TextAnalysisClient` (index.js:44-47)
  3. Azure Application Insights is conditionally initialized for telemetry via `applicationinsights` package (index.js:337-345)

#### cse-dbg-01
- **Category**: Debug
- **Prompt**:
  `When a pull request is closed and VALIDATE_SEAT_ASSIGNMENT is set to YES, the issue is not being created even for valid Copilot seat holders. What could be causing this?`
- **Judge Criteria**:
  1. The condition at index.js:104 uses `==` for string comparison instead of `===`, which may cause type coercion issues
  2. The Copilot seat validation checks `copilotSeatUsers.some(user => user.assignee.login == pr_author)` at index.js:104
  3. The API call at index.js:92-100 fetches seats from `/orgs/{org}/copilot/billing/seats` endpoint with GitHub API version `2022-11-28`
