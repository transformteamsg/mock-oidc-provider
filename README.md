# @transformteamsg/mock-oidc-provider

Generic local OIDC provider for development and testing.

Built on [oauth2-mock-server](https://github.com/axa-group/oauth2-mock-server). It is
intended to let local applications exercise their normal OIDC authorization-code callback
flow without depending on a real identity provider account.

It is not a production identity provider and must not be deployed as one.

## Usage

Run the provider in one terminal without installing:

```bash
pnpm dlx @transformteamsg/mock-oidc-provider \
  --redirect-uri http://localhost:3000/api/auth/callback/oidc \
  --claim customClaim1=value1 \
  --claim customClaim2=value2
# or
npx @transformteamsg/mock-oidc-provider \
  --redirect-uri http://localhost:3000/api/auth/callback/oidc \
  --claim customClaim1=value1 \
  --claim customClaim2=value2
```

Or, after installing the package, run the binary directly:

```bash
mock-oidc-provider --redirect-uri http://localhost:3000/api/auth/callback/oidc --claim customClaim1=value1 --claim customClaim2=value2
```

Run the client application in another terminal.

By default the provider uses:

```text
host: 127.0.0.1
port: 4010
issuer: http://localhost:4010
clientId: mock-oidc-client
```

The provider prints copy-pasteable client application configuration on startup.

## Azure AD / MSAL

Use `--preset azure-ad` when the consuming app uses `@azure/msal-node` or any MSAL-based client. The preset configures the provider to look like Azure AD so MSAL can talk to it without any custom code in the consuming app.

```bash
pnpm dlx @transformteamsg/mock-oidc-provider \
  --preset azure-ad \
  --client-id mock-oidc-client \
  --redirect-uri http://localhost:3000/api/auth/callback/mims \
  --claim customClaim1=value1
```

What `--preset azure-ad` does:

- Serves an Azure AD-compatible discovery endpoint at `/{tenantId}/v2.0/.well-known/openid-configuration`
- Injects `tid`, `oid`, and `preferred_username` default claims automatically
- Serves HTTPS using a bundled self-signed localhost certificate — required because MSAL unconditionally rejects non-HTTPS authority URIs
- On startup, prints the exact env vars to copy into your consuming app (`OIDC_ISSUER` and `MOCK_OIDC_ENABLED`)

### Configuring MSAL

When your app uses `@azure/msal-node` with `ConfidentialClientApplication`, branch the config on a `MOCK_OIDC_ENABLED` env flag:

```typescript
import { ConfidentialClientApplication, ProtocolMode } from '@azure/msal-node';

if (process.env.MOCK_OIDC_ENABLED === 'true') {
  msalInstance = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.CLIENT_ID,
      authority: process.env.OIDC_ISSUER,
      knownAuthorities: [new URL(process.env.OIDC_ISSUER!).host], // skip instance discovery for non-Azure host
      clientSecret: 'mock-secret',
      protocolMode: ProtocolMode.OIDC, // read expected issuer from discovery doc instead of MSAL's hardcoded login.microsoftonline.com
    },
  });
} else {
  // production: certificate-based auth
  msalInstance = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.CLIENT_ID,
      authority: process.env.OIDC_ISSUER,
      clientCertificate: {
        thumbprintSha256: process.env.CERT_THUMBPRINT,
        privateKey: Buffer.from(process.env.PRIVATE_KEY!, 'base64').toString('utf-8'),
      },
    },
  });
}
```

Two non-obvious options are required for the mock to work:

- **`knownAuthorities`** — bypasses MSAL's Azure AD instance discovery, which would otherwise reject a `localhost` authority as untrusted
- **`protocolMode: ProtocolMode.OIDC`** — makes MSAL read the expected `issuer` from the discovery document; without this, MSAL constructs it internally from `login.microsoftonline.com`, which won't match the `iss` claim in mock tokens

Your app also needs to trust the bundled self-signed cert. The simplest approach for local dev is `NODE_TLS_REJECT_UNAUTHORIZED=0` in your `.env` (safe because this only runs locally).

## Options

```text
--host <host>              Bind host. Default: 127.0.0.1
--port <port>              Bind port. Default: 4010
--issuer <url>             Issuer URL. Default: http://localhost:<port>
--client-id <id>           Client ID. Default: mock-oidc-client
--redirect-uri <uri>       Additional allowed localhost redirect URI.
--claim <key=value>        Add or override an ID token claim. Repeatable.
--preset <name>            Apply a provider preset. Supported: azure-ad.
--tenant-id <id>           Tenant ID for --preset azure-ad. Default: mock-tenant
-h, --help                 Show help.
```

The authorization code flow supports optional PKCE with `code_challenge_method=plain`
or `code_challenge_method=S256`. Non-PKCE local clients continue to work.

## Safety defaults

- Runs in the foreground.
- Allows only localhost or 127.0.0.1 redirect URIs.
- Uses fake local issuer and client defaults.
- Does not set cookies or sessions in consuming applications.
- Does not store or dictate where client applications store tokens.
