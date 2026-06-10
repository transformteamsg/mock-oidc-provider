export interface ProviderConfig {
  host: string;
  port: number;
  issuer: string;
  clientId: string;
  redirectUris: string[];
  claims: Record<string, unknown>;
}

const defaultHost = '127.0.0.1';
const defaultPort = 4010;
const defaultClientId = 'mock-oidc-client';
const defaultClaims: Record<string, unknown> = {
  sub: 'mock-user',
  name: 'Mock User',
  email: 'mock.user@example.test',
};

export function parseArgs(args: string[]): ProviderConfig {
  let host = defaultHost;
  let port = defaultPort;
  let clientId = defaultClientId;
  let issuer: string | undefined;
  const redirectUris = ['http://localhost:3000/api/auth/callback/oidc'];
  const claims = { ...defaultClaims };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--host') {
      host = readValue(args, (index += 1), arg);
      continue;
    }

    if (arg === '--port') {
      port = parsePort(readValue(args, (index += 1), arg));
      continue;
    }

    if (arg === '--issuer') {
      issuer = normalizeIssuer(readValue(args, (index += 1), arg));
      assertRootIssuer(issuer);
      continue;
    }

    if (arg === '--client-id') {
      clientId = readValue(args, (index += 1), arg);
      continue;
    }

    if (arg === '--redirect-uri') {
      const redirectUri = readValue(args, (index += 1), arg);
      assertLocalRedirectUri(redirectUri);
      redirectUris.push(redirectUri);
      continue;
    }

    if (arg === '--claim') {
      const [key, value] = parseClaim(readValue(args, (index += 1), arg));
      claims[key] = value;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      throw new HelpRequested();
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  for (const redirectUri of redirectUris) {
    assertLocalRedirectUri(redirectUri);
  }

  return {
    host,
    port,
    issuer: issuer ?? `http://localhost:${port}`,
    clientId,
    redirectUris: [...new Set(redirectUris)],
    claims,
  };
}

export class HelpRequested extends Error {
  constructor() {
    super('Help requested');
  }
}

export function getHelpText(): string {
  return `mock-oidc-provider

Usage:
  mock-oidc-provider [options]

Options:
  --host <host>              Bind host. Default: ${defaultHost}
  --port <port>              Bind port. Default: ${defaultPort}
  --issuer <url>             Issuer URL. Default: http://localhost:<port>
  --client-id <id>           Client ID. Default: ${defaultClientId}
  --redirect-uri <uri>       Additional allowed localhost redirect URI.
  --claim <key=value>        Add or override an ID token claim. Repeatable.
  -h, --help                 Show help.

Example:
  mock-oidc-provider --claim preferred_username=test.user --claim name="Test User"
`;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function parseClaim(value: string): [string, unknown] {
  const equalsIndex = value.indexOf('=');
  if (equalsIndex <= 0) {
    throw new Error(`Claim must use key=value format: ${value}`);
  }

  const key = value.slice(0, equalsIndex).trim();
  const rawValue = value.slice(equalsIndex + 1);
  if (!key) {
    throw new Error(`Claim must use key=value format: ${value}`);
  }

  return [key, coerceClaimValue(rawValue)];
}

function coerceClaimValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, '');
}

function assertRootIssuer(value: string): void {
  const url = new URL(value);
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(`Issuer URL must not have a path component: ${value}`);
  }
}

function assertLocalRedirectUri(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Redirect URI must be a valid localhost URL: ${value}`);
  }

  const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (!isLocalHost) {
    throw new Error(`Redirect URI must use localhost or 127.0.0.1: ${value}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Redirect URI must use http or https: ${value}`);
  }
}
