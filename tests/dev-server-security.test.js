import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { validarRUC } from '../assets/utils/ruc-validation.js';

const syntheticRuc = Array.from({ length: 1000 }, (_, n) => `010${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);

test('servidor HTTP aplica allowlist y conserva endpoints autorizados', async t => {
  const child = spawn(process.execPath, ['server/dev-server.js'], {
    cwd: new URL('../', import.meta.url),
    env: {
      ...process.env,
      PORT: '0',
      NODE_ENV: 'development',
      DEV_CLIENT_LOOKUP_MOCK: '1',
      DEV_CLIENT_LOOKUP_EXISTING_RUC: syntheticRuc,
      DEV_REGISTRATION_MOCK: '1',
      DEV_ALLOWED_ORIGIN: '',
      DEV_BIND_HOST: '127.0.0.1',
      SRI_RUC_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const port = await waitForPort(child);

  for (const pathname of ['/', '/index.html', '/assets/bootstrap.js', '/assets/styles.css', '/assets/Logo%20TributaSoft.png']) {
    assert.equal((await call(port, pathname)).status, 200, pathname);
  }

  for (const pathname of ['/.git/HEAD', '/.git/config', '/server/dev-server.js', '/tests/flow.test.js', '/docs/V2-BACKEND-HANDOFF.md', '/README.md']) {
    const response = await call(port, pathname);
    assert.equal(response.status, 404, pathname);
    assert.doesNotMatch(response.body, /[A-Z]:\\|\/Users\/|\/home\//i);
  }

  for (const pathname of ['/../README.md', '/%2e%2e/README.md', '/%252e%252e/README.md', '/assets%2f..%2fserver%2fdev-server.js', '/assets/%5c..%5cserver%5cdev-server.js']) {
    assert.equal((await call(port, pathname)).status, 400, pathname);
  }

  const headers = { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` };
  assert.equal((await call(port, '/api/registro/verificar-cliente', {
    method: 'POST', headers, body: JSON.stringify({ ruc: syntheticRuc }),
  })).status, 200);
  assert.equal((await call(port, '/api/registro', {
    method: 'POST', headers, body: JSON.stringify({ ruc: syntheticRuc, firma: { ruc: syntheticRuc }, facturacion: { documentos: [{ tipo_documento: 'factura' }] } }),
  })).status, 201);
  assert.equal((await call(port, `/api/ruc/${syntheticRuc}`)).status, 503);
  assert.equal(child.exitCode, null);
});

function waitForPort(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor de prueba no inició a tiempo.')), 5_000);
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
    const match = output.match(/(?:localhost|127\.0\.0\.1|\[::1\]):(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`El servidor terminó antes de iniciar: ${code}`)); });
    child.stderr.on('data', chunk => { output += chunk; });
  });
}

function call(port, path, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
