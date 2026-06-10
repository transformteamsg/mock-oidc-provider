import { OAuth2Server } from 'oauth2-mock-server';

import type { ProviderConfig } from './config.js';

interface StartedProvider {
  issuer: string;
  stop: () => Promise<void>;
}

export function createProvider(config: ProviderConfig) {
  const server = new OAuth2Server(undefined, undefined, { endpoints: { jwks: '/discovery/v2.0/keys' } });

  server.service.on('beforeTokenSigning', (token) => {
    Object.assign(token.payload, config.claims);
  });

  async function start(): Promise<StartedProvider> {
    await server.issuer.keys.generate('RS256');
    await server.start(config.port, config.host);

    const issuerUrl = new URL(config.issuer);
    issuerUrl.port = String(server.address().port);
    const issuer = issuerUrl.toString().replace(/\/$/, '');
    server.issuer.url = issuer;

    return { issuer, stop };
  }

  async function stop(): Promise<void> {
    await server.stop();
  }

  return { start, stop };
}
