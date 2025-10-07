# MCP OAuth 2.1 Implementation

This implementation follows the [MCP Authorization specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) for OAuth 2.1 with PKCE, Authorization Server Metadata Discovery, and Dynamic Client Registration.

## OAuth 2.1 Flow Overview

The implementation follows the MCP specification exactly:

1. **Client Registration** - MCP clients register dynamically
2. **Authorization Server Metadata Discovery** - Clients discover OAuth endpoints
3. **Authorization Code Flow with PKCE** - Secure user authentication
4. **Token Exchange** - Authorization code for access token
5. **MCP Requests** - Authenticated MCP tool calls

## Endpoints

### 1. Authorization Server Metadata Discovery (RFC8414)

```
GET /.well-known/oauth-authorization-server
```

**Response:**

```json
{
  "issuer": "http://localhost:3000",
  "authorization_endpoint": "http://localhost:3000/authorize",
  "token_endpoint": "http://localhost:3000/token",
  "registration_endpoint": "http://localhost:3000/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "client_credentials"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_basic"],
  "scopes_supported": ["mcp_tools"],
  "mcp_protocol_version": "2025-03-26"
}
```

### 2. Dynamic Client Registration (RFC7591)

```
POST /register
Content-Type: application/json

{
  "client_name": "ChatGPT MCP Client",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code"],
  "response_types": ["code"]
}
```

**Response:**

```json
{
  "client_id": "uuid-generated-client-id",
  "client_secret": "generated-secret",
  "client_id_issued_at": 1640995200,
  "client_secret_expires_at": 0,
  "client_name": "ChatGPT MCP Client",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code"],
  "response_types": ["code"]
}
```

### 3. Authorization Endpoint

```
GET /authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=CALLBACK_URL&state=STATE&code_challenge=CHALLENGE&code_challenge_method=S256&serverId=SERVER_ID
```

**Parameters:**

- `response_type=code` (required)
- `client_id` (required) - From client registration
- `redirect_uri` (required) - Must match registered URI
- `state` (required) - CSRF protection
- `code_challenge` (required) - PKCE challenge
- `code_challenge_method=S256` (required) - PKCE method
- `serverId` (optional) - MCP server identifier

**Response:** Redirects to your website's OAuth login page

### 4. Token Endpoint

```
POST /token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "AUTHORIZATION_CODE",
  "client_id": "CLIENT_ID",
  "client_secret": "CLIENT_SECRET",
  "redirect_uri": "CALLBACK_URL",
  "code_verifier": "CODE_VERIFIER"
}
```

**Response:**

```json
{
  "access_token": "jwt-access-token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "jwt-refresh-token",
  "scope": "mcp_tools"
}
```

### 5. OAuth Callback (Your Website Integration)

```
POST /oauth/callback
Content-Type: application/json

{
  "auth_code": "AUTHORIZATION_CODE",
  "user_token": "USER_JWT_FROM_YOUR_WEBSITE",
  "serverId": "SERVER_ID"
}
```

**Response:**

```json
{
  "success": true,
  "message": "User token stored successfully"
}
```

### 6. OAuth-Protected MCP Endpoint

```
POST /mcp/:serverId
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {...}
}
```

## PKCE Implementation

The implementation uses OAuth 2.1 PKCE (Proof Key for Code Exchange) as required by the MCP specification:

### Client Side (MCP Client)

```javascript
// Generate code verifier
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// Generate code challenge
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Authorization request
const authUrl =
  `${baseUrl}/authorize?` +
  `response_type=code&` +
  `client_id=${clientId}&` +
  `redirect_uri=${redirectUri}&` +
  `state=${state}&` +
  `code_challenge=${codeChallenge}&` +
  `code_challenge_method=S256&` +
  `serverId=${serverId}`;

// Token exchange
const tokenResponse = await fetch(`${baseUrl}/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }),
});
```

### Server Side (Validation)

```javascript
// Validate PKCE code verifier
const codeChallenge = crypto
  .createHash('sha256')
  .update(code_verifier)
  .digest('base64url');

if (codeChallenge !== decoded.code_challenge) {
  return res.status(400).json({
    error: 'invalid_grant',
    error_description: 'Invalid code verifier',
  });
}
```

## ChatGPT MCP Configuration

For ChatGPT, configure your MCP server:

```json
{
  "mcpServers": {
    "sloot-oauth": {
      "command": "node",
      "args": ["mcp-client.js"],
      "env": {
        "MCP_SERVER_URL": "http://localhost:3000/mcp/your-server-id",
        "OAUTH_METADATA_URL": "http://localhost:3000/.well-known/oauth-authorization-server",
        "OAUTH_REGISTRATION_URL": "http://localhost:3000/register",
        "OAUTH_AUTHORIZATION_URL": "http://localhost:3000/authorize",
        "OAUTH_TOKEN_URL": "http://localhost:3000/token"
      }
    }
  }
}
```

## Frontend Integration

Your website needs to handle the OAuth flow:

### 1. OAuth Login Page (`/oauth/login`)

```javascript
// Extract OAuth parameters from URL
const urlParams = new URLSearchParams(window.location.search);
const auth_code = urlParams.get('auth_code');
const client_id = urlParams.get('client_id');
const redirect_uri = urlParams.get('redirect_uri');
const state = urlParams.get('state');
const serverId = urlParams.get('serverId');

// When user clicks "Authorize"
async function authorizeUser() {
  const userToken = localStorage.getItem('userToken'); // Get user's JWT

  // Store user token with MCP server
  await fetch('http://localhost:3000/oauth/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_code,
      user_token: userToken,
      serverId,
    }),
  });

  // Redirect back to ChatGPT with authorization code
  window.location.href = `${redirect_uri}?code=${auth_code}&state=${state}`;
}
```

## Security Features

- ✅ **OAuth 2.1 Compliance** - Latest OAuth standard
- ✅ **PKCE Required** - Prevents authorization code interception
- ✅ **Authorization Server Metadata Discovery** - RFC8414 compliant
- ✅ **Dynamic Client Registration** - RFC7591 compliant
- ✅ **JWT Token Security** - All tokens are JWT-based
- ✅ **User Isolation** - Users only access their own servers
- ✅ **Token Expiration** - Access tokens expire in 1 hour
- ✅ **Refresh Tokens** - 30-day refresh token support
- ✅ **State Parameter** - CSRF protection
- ✅ **Client Validation** - Client ID and secret verification
- ✅ **HTTPS Required** - All endpoints must use HTTPS in production

## Error Handling

The implementation follows OAuth 2.1 error handling:

### Common Error Responses

```json
// Missing parameters
{
  "error": "invalid_request",
  "error_description": "Missing required parameters"
}

// Invalid client
{
  "error": "invalid_client",
  "error_description": "Invalid client credentials"
}

// Invalid token
{
  "error": "invalid_token",
  "error_description": "Invalid token type"
}

// Invalid grant
{
  "error": "invalid_grant",
  "error_description": "Invalid authorization code"
}

// PKCE validation failed
{
  "error": "invalid_grant",
  "error_description": "Invalid code verifier"
}
```

## Testing the Implementation

### 1. Test Metadata Discovery

```bash
curl http://localhost:3000/.well-known/oauth-authorization-server
```

### 2. Test Client Registration

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["http://localhost:3000/callback"],
    "grant_types": ["authorization_code"],
    "response_types": ["code"]
  }'
```

### 3. Test Authorization Flow

```bash
# Generate PKCE parameters
code_verifier=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-43)
code_challenge=$(echo -n "$code_verifier" | openssl dgst -binary -sha256 | openssl base64 | tr -d "=+/" | cut -c1-43)

# Authorization request
curl "http://localhost:3000/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=http://localhost:3000/callback&state=test123&code_challenge=$code_challenge&code_challenge_method=S256&serverId=123"
```

### 4. Test Token Exchange

```bash
curl -X POST http://localhost:3000/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTHORIZATION_CODE",
    "client_id": "CLIENT_ID",
    "client_secret": "CLIENT_SECRET",
    "redirect_uri": "http://localhost:3000/callback",
    "code_verifier": "CODE_VERIFIER"
  }'
```

### 5. Test MCP with OAuth

```bash
curl -X POST http://localhost:3000/mcp/123 \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1,
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

## Production Considerations

1. **Use HTTPS** - All endpoints must use HTTPS in production
2. **Store tokens in database** - Replace in-memory storage with persistent storage
3. **Implement rate limiting** - Add rate limiting to OAuth endpoints
4. **Add proper logging** - Implement comprehensive logging for security monitoring
5. **Use environment-specific URLs** - Configure proper frontend redirect URLs
6. **Implement token revocation** - Add token revocation endpoint
7. **Add CORS configuration** - Configure CORS for your frontend domain
8. **Implement token rotation** - Add automatic token refresh
9. **Add monitoring** - Monitor OAuth flow success/failure rates
10. **Security audits** - Regular security audits of OAuth implementation

This implementation provides a complete, standards-compliant OAuth 2.1 flow that works with ChatGPT's MCP connector system and follows the MCP authorization specification exactly.
