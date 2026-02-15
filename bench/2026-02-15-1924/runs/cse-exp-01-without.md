Based on my analysis of the codebase, this GitHub App integrates with **4 Azure services**:

---

## Azure Service Integrations

### 1. **Azure SQL Database** (Required)
- **Purpose**: Stores survey response data collected from developers about their GitHub Copilot usage
- **Implementation**: Uses `mssql` npm package to connect and execute SQL queries
- **Table**: `SurveyResults` - stores enterprise/org/repo info, PR numbers, copilot usage flags, time savings percentages, usage frequency, and qualitative comments
- **Code location**: `index.js:243-301`

### 2. **Azure Cognitive Service for Language** (Optional)
- **Purpose**: Detects the language of pull request descriptions to serve surveys in the appropriate language (English, Spanish, Portuguese, or French)
- **Implementation**: Uses `@azure/ai-language-text` SDK with `TextAnalysisClient` for language detection
- **Fallback**: If not configured, defaults to English
- **Code location**: `index.js:43-71`

### 3. **Azure Application Insights** (Optional)
- **Purpose**: Monitoring and telemetry - tracks events, dependencies, and exceptions for observability
- **Implementation**: Uses `applicationinsights` npm package via custom `AppInsights` class
- **Tracked events**: PR closures, issue edits, comment creation, language detection API calls, exceptions
- **Code location**: `index.js:337-361`

### 4. **Azure App Service** (Hosting)
- **Purpose**: Hosts the Node.js Probot application as a Linux web app
- **Configuration**: Node 18 LTS, integrated with VNet for secure database connectivity
- **Deployment**: Defined in Bicep template with private endpoint connectivity to SQL Server
- **Code location**: `deployment/template.bicep:274-331`

---

## Report

- **Tool calls**: 4 (Grep x2, Read x2)
- **LENS calls**: 0
- **Files read**: 4
- **Key findings**:
  - 4 Azure services integrated: SQL Database (required), Cognitive Services Language (optional), Application Insights (optional), App Service (hosting)
  - SQL Database stores Copilot usage survey results with metrics on time savings and usage patterns
  - Language service enables multi-language survey support (EN/ES/PT/FR) based on PR description analysis
  - Application Insights provides telemetry for events, API dependencies, and exception tracking
