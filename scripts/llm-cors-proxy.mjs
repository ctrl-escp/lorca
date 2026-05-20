#!/usr/bin/env node
/**
 * llm-cors-proxy — transparent proxy that adds CORS headers and handles
 * OPTIONS preflight locally. Supports both HTTP and HTTPS.
 *
 * Usage (HTTP):
 *   node scripts/llm-cors-proxy.mjs -e http://localhost:11434 -p 11435
 *
 * Usage (HTTPS — auto-generates a self-signed cert on first run):
 *   node scripts/llm-cors-proxy.mjs -e http://localhost:11434 -p 11435 --https --domain localhost
 *   node scripts/llm-cors-proxy.mjs -e http://localhost:11434 -p 11435 --https --domain mybox.local
 *
 * Options:
 *   -e, --endpoint <url>     Upstream LLM base URL (required)
 *   -p, --port <number>      Port to listen on (required)
 *   -o, --origin <origin>    Allowed CORS origin (default: *)
 *       --https              Enable TLS
 *       --domain <name>      Domain / CN for the certificate (required with --https)
 *       --cert <path>        Path to existing PEM cert (skips generation)
 *       --key  <path>        Path to existing PEM key  (skips generation)
 *       --cert-dir <path>    Directory for generated certs (default: ~/.llm-cors-proxy)
 */

import http   from 'node:http';
import https  from 'node:https';
import fs     from 'node:fs';
import path   from 'node:path';
import cp     from 'node:child_process';
import { URL } from 'node:url';

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(short, long) {
  const i = args.findIndex(a => a === short || a === long);
  return i !== -1 ? args[i + 1] ?? null : null;
}
function boolFlag(name) {
  return args.includes(name);
}

const endpoint  = flag('-e', '--endpoint');
const portArg   = flag('-p', '--port');
const origin    = flag('-o', '--origin') ?? '*';
const useTls    = boolFlag('--https');
const domain    = flag('--domain', '--domain');
const certArg   = flag('--cert', '--cert');
const keyArg    = flag('--key',  '--key');
const certDir   = flag('--cert-dir', '--cert-dir') ?? path.dirname(new URL(import.meta.url).pathname);

if (!endpoint || !portArg) {
  console.error(
    'Usage: llm-cors-proxy.mjs -e <upstream-url> -p <port> [--origin <origin>]\n' +
    '                           [--https --domain <name>] [--cert <pem>] [--key <pem>]\n' +
    '                           [--cert-dir <dir>]'
  );
  process.exit(1);
}

if (useTls && !domain && !certArg) {
  console.error('--https requires --domain <name> (or supply --cert / --key directly)');
  process.exit(1);
}

const upstreamBase = new URL(endpoint);
const proxyPort    = parseInt(portArg, 10);

if (isNaN(proxyPort) || proxyPort < 1 || proxyPort > 65535) {
  console.error(`Invalid port: ${portArg}`);
  process.exit(1);
}

// ── Certificate helpers ───────────────────────────────────────────────────────

function ensureCerts(dom, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const certPath = path.join(dir, `${dom}.crt`);
  const keyPath  = path.join(dir, `${dom}.key`);

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log(`Reusing existing certificates in ${dir}`);
    return { certPath, keyPath };
  }

  console.log(`Generating self-signed certificate for "${dom}" …`);

  // Write a minimal OpenSSL config that includes Subject Alternative Names so
  // modern browsers accept the cert (CN alone is ignored since Chrome 58).
  const confPath = path.join(dir, `${dom}.cnf`);
  const conf = [
    '[req]',
    'prompt             = no',
    'distinguished_name = dn',
    'x509_extensions    = v3_req',
    '[dn]',
    `CN = ${dom}`,
    '[v3_req]',
    'subjectAltName = @alt',
    'keyUsage       = digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    '[alt]',
    `DNS.1 = ${dom}`,
    'DNS.2 = localhost',
    'IP.1  = 127.0.0.1',
  ].join('\n');

  fs.writeFileSync(confPath, conf);

  const cmd = [
    'openssl', 'req', '-x509',
    '-newkey', 'rsa:2048',
    '-keyout', keyPath,
    '-out',    certPath,
    '-days',   '825',   // max accepted by iOS/macOS keychain
    '-nodes',
    '-config', confPath,
  ].join(' ');

  try {
    cp.execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    console.error('openssl failed:', err.stderr?.toString() ?? err.message);
    process.exit(1);
  }

  console.log(`  cert → ${certPath}`);
  console.log(`  key  → ${keyPath}`);
  console.log('');
  console.log('  To trust this certificate on macOS:');
  console.log(`    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`);
  console.log('');

  return { certPath, keyPath };
}

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':      origin,
  'Access-Control-Allow-Methods':     'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':     'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age':           '86400',
};

// ── Request handler ───────────────────────────────────────────────────────────

const upstreamTransport = upstreamBase.protocol === 'https:' ? https : http;

function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const target = new URL(req.url, upstreamBase);

  // Strip browser-supplied origin/referer so upstream servers (e.g. Ollama)
  // don't reject the request based on their own origin allowlist.
  const { origin: _o, referer: _r, ...forwardHeaders } = req.headers;

  const options = {
    hostname: upstreamBase.hostname,
    port:     upstreamBase.port || (upstreamBase.protocol === 'https:' ? 443 : 80),
    path:     target.pathname + target.search,
    method:   req.method,
    headers:  { ...forwardHeaders, host: upstreamBase.host },
  };

  const proxyReq = upstreamTransport.request(options, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers, ...CORS_HEADERS };
    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`Upstream error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ error: 'Bad Gateway', detail: err.message }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

// ── Server startup ────────────────────────────────────────────────────────────

let server;

if (useTls) {
  const { certPath, keyPath } = certArg
    ? { certPath: certArg, keyPath: keyArg }
    : ensureCerts(domain, certDir);

  const tlsOptions = {
    cert: fs.readFileSync(certPath),
    key:  fs.readFileSync(keyPath),
  };

  server = https.createServer(tlsOptions, handleRequest);
} else {
  server = http.createServer(handleRequest);
}

server.on('error', (err) => {
  console.error(`Proxy server error: ${err.message}`);
  process.exit(1);
});

server.listen(proxyPort, () => {
  const scheme = useTls ? 'https' : 'http';
  const host   = useTls ? (domain ?? 'localhost') : 'localhost';
  console.log(`llm-cors-proxy listening on ${scheme}://${host}:${proxyPort}`);
  console.log(`  → upstream    : ${endpoint}`);
  console.log(`  → CORS origin : ${origin}`);
  console.log('Press Ctrl+C to stop.');
});
