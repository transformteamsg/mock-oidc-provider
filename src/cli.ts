#!/usr/bin/env node
import { getHelpText, HelpRequested, parseArgs } from './config.js';
import { createProvider } from './provider.js';

async function main(): Promise<void> {
  let config;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(getHelpText());
      return;
    }

    console.error(error instanceof Error ? error.message : error);
    console.error('');
    console.error(getHelpText());
    process.exitCode = 1;
    return;
  }

  const provider = createProvider(config);
  if (config.preset === 'azure-ad') {
    // The azure-ad preset serves HTTPS with a bundled self-signed cert.
    // Disable cert verification so this process can fetch its own discovery doc.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  const started = await provider.start();
  const metadata = await fetch(`${started.issuer}/.well-known/openid-configuration`).then((res) => res.json() as Promise<Record<string, string>>);

  console.log('mock-oidc-provider is running');
  console.log('');
  console.log(`Issuer:       ${started.issuer}`);
  console.log(`Client ID:    ${config.clientId}`);
  console.log(`Authorize:    ${metadata['authorization_endpoint']}`);
  console.log(`Token:        ${metadata['token_endpoint']}`);
  console.log(`JWKS:         ${metadata['jwks_uri']}`);
  console.log('');
  console.log('Example client app env:');
  if (config.preset === 'azure-ad') {
    console.log(`MIMS_ISSUER=${started.issuer}`);
    console.log(`MOCK_MIMS_ENABLED=true`);
  } else {
    console.log(`OIDC_MOCK_ISSUER=${started.issuer}`);
  }
  console.log(`OIDC_CLIENT_ID=${config.clientId}`);
  console.log('');
  console.log('Configured claims:');
  console.log(JSON.stringify(config.claims, null, 2));
  console.log('');
  console.log('Press Ctrl+C to stop.');

  const shutdown = async () => {
    await provider.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
