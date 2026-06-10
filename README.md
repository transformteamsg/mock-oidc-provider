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

## Options

```text
--host <host>              Bind host. Default: 127.0.0.1
--port <port>              Bind port. Default: 4010
--issuer <url>             Issuer URL. Default: http://localhost:<port>
--client-id <id>           Client ID. Default: mock-oidc-client
--redirect-uri <uri>       Additional allowed localhost redirect URI.
--claim <key=value>        Add or override an ID token claim. Repeatable.
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
