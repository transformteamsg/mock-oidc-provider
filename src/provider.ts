import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { Server } from 'node:net';

import { OAuth2Issuer, OAuth2Service } from 'oauth2-mock-server';

import type { ProviderConfig } from './config.js';
import { LOCALHOST_CERT, LOCALHOST_KEY } from './tls.js';

interface StartedProvider {
  issuer: string;
  stop: () => Promise<void>;
}

export function createProvider(config: ProviderConfig) {
  const issuerInstance = new OAuth2Issuer();
  const service = new OAuth2Service(issuerInstance, { jwks: '/discovery/v2.0/keys' });

  service.on('beforeTokenSigning', (token) => {
    Object.assign(token.payload, config.claims);
    if (config.preset === 'azure-ad') {
      // MSAL validates token iss against the discovery doc's issuer field.
      // The discovery doc reports the tenant-shaped issuer, so we must match it here.
      token.payload.iss = `${issuerInstance.url}/${config.tenantId!}/v2.0`;
    }
  });

  let httpServer: Server | undefined;

  async function start(): Promise<StartedProvider> {
    await issuerInstance.keys.generate('RS256');

    const requestHandler =
      config.preset === 'azure-ad'
        ? buildAzureAdHandler(service, config.tenantId!)
        : service.requestHandler;

    if (config.preset === 'azure-ad') {
      httpServer = createHttpsServer({ cert: LOCALHOST_CERT, key: LOCALHOST_KEY }, requestHandler);
    } else {
      httpServer = createHttpServer(requestHandler);
    }

    await new Promise<void>((resolve, reject) => {
      httpServer!.listen(config.port, config.host).on('listening', resolve).on('error', reject);
    });

    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Server address unavailable');
    const { port } = addr;
    const baseUrl = toBaseUrl(config.host, port, config.preset === 'azure-ad');

    if (config.preset === 'azure-ad') {
      issuerInstance.url = baseUrl;
      const issuer = `${baseUrl}/${config.tenantId!}/v2.0`;
      return { issuer, stop };
    }

    const issuerUrl = new URL(config.issuer);
    issuerUrl.port = String(port);
    const issuer = issuerUrl.toString().replace(/\/$/, '');
    issuerInstance.url = issuer;
    return { issuer, stop };
  }

  async function stop(): Promise<void> {
    if (!httpServer) return;
    return new Promise<void>((resolve, reject) => {
      httpServer!.close((err) => (err ? reject(err) : resolve()));
    });
  }

  return { start, stop };
}

function buildAzureAdHandler(service: OAuth2Service, tenantId: string) {
  const discoveryPath = `/${tenantId}/v2.0/.well-known/openid-configuration`;
  const jwksPath = `/${tenantId}/discovery/v2.0/keys`;

  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === discoveryPath) {
      const baseUrl = service.issuer.url ?? 'http://localhost';
      const issuer = `${baseUrl}/${tenantId}/v2.0`;
      const doc = {
        issuer,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        jwks_uri: `${baseUrl}/${tenantId}/discovery/v2.0/keys`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'profile', 'email'],
        code_challenge_methods_supported: ['S256', 'plain'],
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(doc));
      return;
    }

    if (req.url === jwksPath) {
      req.url = '/discovery/v2.0/keys';
      service.requestHandler(req, res);
      return;
    }

    service.requestHandler(req, res);
  };
}

function toBaseUrl(host: string, port: number, secure = false): string {
  const h = host === '0.0.0.0' || host === '127.0.0.1' || host === '::1' ? 'localhost' : host;
  const formatted = h.includes(':') ? `[${h}]` : h;
  return `${secure ? 'https' : 'http'}://${formatted}:${port}`;
}
