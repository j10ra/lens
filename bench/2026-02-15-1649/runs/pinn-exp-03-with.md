Boss, here's the authentication architecture breakdown:

## Authentication Schemes

The API supports **three authentication schemes**:

### 1. **Bearer** (Custom JWT)
- Self-issued JWT tokens using symmetric key signing
- Configured in `Startup.cs:82-93` (on-prem) or `Startup.cs:108-120` (cloud)
- Uses `Tokens:Key` from config for signing
- Validates issuer (`app.pinnacle-corp.co.nz`) and audience
- Cloud mode also validates Microsoft OIDC signing keys

### 2. **PinnBearer** (Azure AD / Microsoft Identity)
- Azure AD integration via `Microsoft.Identity.Web`
- Configured in `Startup.cs:94` and `Startup.cs:121`
- Reads config from `PinnAzureAd` section:
  - Tenant: `pinnacle-corp.co.nz`
  - ClientId: `df7c8b32-7dc4-41f3-9711-bbc7049d8b7d`
- Requires `access_as_user` scope (`[RequiredScope]` attribute)

### 3. **SAML2** (Okta)
- Okta SSO via `ITfoxtec.Identity.Saml2`
- Configured in `Startup.cs:137-154`
- Uses certificate-based signature validation
- SSO URL: `https://qube.okta.com/app/.../sso/saml`

## Configuration Pattern

Two modes controlled by `OnPrem:Enabled` flag:

| Mode | Bearer | PinnBearer | SignalR |
|------|--------|------------|---------|
| On-Prem | Local issuer validation | Azure AD | Local |
| Cloud | Multi-issuer + OIDC keys | Azure AD | Azure SignalR |

## Controller Authorization

Controllers use scheme composition:
```csharp
[Authorize(AuthenticationSchemes = "PinnBearer,Bearer")]
```

This allows **either** Azure AD **or** custom JWT tokens. Select endpoints use `[AllowAnonymous]` for public access (login, webhooks, health checks).

## Claim Extraction (`BaseController.cs:203-257`)

User identity resolved from multiple claim sources:
- `ClaimTypes.Name` / `"name"` → `CurrentUser`
- `ClaimTypes.NameIdentifier` / `"preferred_username"` → `CurrentUserId`
- `"user_name"` claim → `CurrentUsername`
- `ClaimTypes.Email` / `"preferred_username"` → `CurrentUserEmailAddress`

## Report

- **Tool calls**: 6
- **Files read**: 5
- **Key findings**:
  - Three auth schemes: Bearer (custom JWT), PinnBearer (Azure AD), SAML2 (Okta)
  - Controllers accept either Azure AD or custom JWT via `[Authorize(AuthenticationSchemes = "PinnBearer,Bearer")]`
  - On-prem vs cloud deployment mode toggles token validation behavior
  - Claim extraction handles both custom JWT claims and Azure AD standard claims
