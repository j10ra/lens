Based on my analysis of the codebase, here are the Azure services this GitHub App integrates with:

## Azure Services Integrated

### 1. **Azure SQL Database** (Required)
- **Package**: `mssql` (npm)
- **Purpose**: Persistent storage for survey responses
- **Implementation**: `index.js:233-316`
  - Stores survey results in `SurveyResults` table
  - Auto-creates table if not exists
  - Tracks: enterprise/org/repo names, PR numbers, Copilot usage, time savings percentages, usage frequency, and comments
  - Uses private endpoint for secure connectivity (VNet integration)

### 2. **Azure Cognitive Service for Language** (Optional)
- **Package**: `@azure/ai-language-text` (npm)
- **Purpose**: Language detection on PR descriptions
- **Implementation**: `index.js:43-71`
  - Detects language of pull request body text
  - Supports English, Spanish, Portuguese, and French
  - Selects appropriate survey template based on detected language (`copilot-usage-{lang}.md`)
  - Falls back to English if detection fails or service unavailable

### 3. **Azure Application Insights** (Optional)
- **Package**: `applicationinsights` (npm)
- **Purpose**: Monitoring, telemetry, and diagnostics
- **Implementation**: `index.js:337-362`
  - Tracks events: PR close, issue edits, comment creation
  - Tracks dependencies: API call duration for language detection
  - Tracks exceptions: Database errors, API failures
  - Provides observability into app performance and errors

### Supporting Azure Infrastructure (from ARM template):
- **Azure App Service** - Hosts the Node.js application (Linux, Node 18)
- **Azure Virtual Network** - Network isolation with subnets for App Service and SQL
- **Private Endpoint** - Secure private connectivity to SQL Database
- **Log Analytics Workspace** - Backend storage for Application Insights data

## Data Flow
1. PR closed → Language detection (Azure Cognitive Services) → Survey issue created
2. Survey answered → Data stored (Azure SQL) → Telemetry sent (Application Insights)

---

## Report

- **Tool calls**: 5
- **LENS calls**: 0
- **Files read**: 4
- **Key findings**:
  - 3 Azure service integrations: SQL Database (required), Cognitive Services Language (optional), Application Insights (optional)
  - SQL Database stores all survey response data in auto-created `SurveyResults` table
  - Cognitive Services performs language detection to localize survey templates (en/es/pt/fr)
  - Application Insights provides full observability: events, dependencies, exceptions
  - Infrastructure uses VNet with private endpoints for secure SQL connectivity
