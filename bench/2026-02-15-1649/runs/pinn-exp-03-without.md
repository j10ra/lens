Boss, here's a comprehensive breakdown of the Pinnacle API authentication architecture:

## Authentication Architecture Overview

### Supported Authentication Schemes

The API supports **3 authentication schemes** configured in `Startup.cs`:

| Scheme | Name | Purpose |
|--------|------|---------|
| **Bearer** | `"Bearer"` | Custom JWT tokens (Pinnacle-generated) |
| **PinnBearer** | `"PinnBearer"` | Azure AD / Microsoft Identity Platform |
| **SAML2** | Okta SSO | SAML 2.0 via ITfoxtec library |

---

### 1. **Bearer** (Custom JWT)

**Configuration** (`Startup.cs:81-93` on-prem, `107-120` cloud):

```csharp
.AddJwtBearer("Bearer", cfg =>
{
    cfg.TokenValidationParameters = new TokenValidationParameters()
    {
        ValidIssuer = Configuration["Tokens:Issuer"],
        ValidAudience = Configuration["Tokens:Issuer"],
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(Configuration["Tokens:Key"])),
        ClockSkew = TimeSpan.Zero
    };
});
```

- **Issuer**: `app.pinnacle-corp.co.nz`
- **Signing**: HMAC-SHA256 symmetric key
- **Token lifetime**: 12 hours (access), 30 days (refresh)
- **Used by**: Internal MyPinnacle Angular app, React external app

---

### 2. **PinnBearer** (Azure AD)

**Configuration** (`Startup.cs:94`, `121`):

```csharp
.AddMicrosoftIdentityWebApi(Configuration, 
    configSectionName: "PinnAzureAd", 
    jwtBearerScheme: "PinnBearer");
```

- **Tenant**: `a9eeca95-eb15-4471-820d-863caa6a10ee` (pinnacle-corp.co.nz)
- **ClientId**: `df7c8b32-7dc4-41f3-9711-bbc7049d8b7d`
- **Scopes**: `access_as_user`
- **Used by**: Azure AD integrated clients

---

### 3. **Okta SAML 2.0** (SSO)

**Configuration** (`Startup.cs:137-154`):

```csharp
services.Configure<Saml2Configuration>(saml2Configuration =>
{
    saml2Configuration.Issuer = Configuration["Okta:Issuer"];
    saml2Configuration.SingleSignOnDestination = 
        new Uri(Configuration["Okta:SsoUrl"]);
    saml2Configuration.SignatureValidationCertificates.Add(oktaCertificate);
});
```

- **IdP**: `https://qube.okta.com`
- **Flow**: SAML POST binding → callback converts to internal JWT
- **Callback**: `POST v1/account/okta/callback`

---

### Controller Authorization Patterns

| Controller | Scheme | Notes |
|------------|--------|-------|
| `AccountV1Controller` | `PinnBearer,Bearer` | Dual scheme support |
| `GatewayV1Controller` | `PinnBearer,Bearer` | Dual scheme support |
| `ExternalV1Controller` | `Bearer` | External customers only |
| `JobV1Controller` | `JwtBearerDefaults` | Background jobs |
| `WebHookController` | `AllowAnonymous` | Custom header validation |
| Most others | `PinnBearer,Bearer` | Dual scheme support |

---

### Additional Security Layers

1. **Client Key Validation** (`x-client-key` header):
   - Validates against `Tokens:ClientKey` or `Tokens:ExternalClientKey`
   - Required on most endpoints (see `IsClientKeyValid()` in controllers)

2. **Device Token Validation**:
   - JWT signed with `DeviceSecretKey`
   - Used for mobile/field device authentication
   - IP whitelisting support (`IPWhiteListing` config)

3. **IP Whitelisting**:
   - Configured ranges bypass device validation
   - Format: `10.0.4.0:10.0.4.255`

---

### Environment Toggle

The `OnPrem:Enabled` setting determines deployment mode:

| Setting | On-Prem | Cloud |
|---------|---------|-------|
| HTTPS metadata | Not required | Required |
| OIDC discovery | Disabled | Enabled |
| SignalR | Local | Azure SignalR |
| HSTS | Disabled | Enabled |

---

## Report

- **Tool calls**: 8
- **Files read**: 7
- **Key findings**:
  - Three authentication schemes: custom JWT (Bearer), Azure AD (PinnBearer), Okta SAML2
  - Dual-scheme support allows both internal JWT and Azure AD tokens on same endpoints
  - Client key (`x-client-key`) provides secondary API key validation layer
  - Device tokens with IP whitelisting for mobile/field operations
  - Okta SAML flow converts SAML assertions to internal JWT tokens via callback endpoint
