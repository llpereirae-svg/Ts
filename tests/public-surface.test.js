import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRequestPath, publicSurface, resolvePublicFile } from '../server/public-surface.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('allowlist publica solo raíz aprobada y assets web', async () => {
  for (const pathname of ['/', '/index.html', '/Terminos-y-Condiciones.txt', '/Politica-de-Privacidad.txt', '/Politica-de-Cookies.txt']) {
    assert.equal((await resolvePublicFile(ROOT, pathname)).allowed, true, pathname);
  }
  for (const pathname of ['/assets/bootstrap.js', '/assets/styles.css', '/assets/Logo%20TributaSoft.png', '/assets/node-forge-1.3.1.min.js', '/assets/fonts/RobotoCondensed-Regular.ttf']) {
    assert.equal((await resolvePublicFile(ROOT, pathname)).allowed, true, pathname);
  }
});

test('archivos internos quedan fuera aunque existan', async () => {
  for (const pathname of [
    '/.git/HEAD', '/.git/config', '/.gitignore', '/.env', '/.env.local', '/node_modules/pkg/index.js',
    '/tests/flow.test.js', '/docs/V2-BACKEND-HANDOFF.md', '/server/dev-server.js', '/scripts/task.js',
    '/README.md', '/package.json', '/DEV-LOCAL.md', '/SECURITY-AUDIT.md', '/dump.sql', '/app.log', '/key.pem', '/certificate.p12',
    '/assets/.git/hooks/x.js', '/assets/node_modules/pkg/index.js', '/assets/tests/hidden.js', '/assets/docs/hidden.js',
    '/assets/server/hidden.js', '/assets/scripts/build.js', '/assets/logs/debug.js', '/assets/dumps/data.js',
    '/assets/private/config.js', '/assets/unknown.js',
  ]) assert.equal(publicSurface(pathname).allowed, false, pathname);
});

test('traversal, codificación repetida, separadores Windows y rutas absolutas fallan cerrado', () => {
  for (const pathname of [
    '/../README.md', '/assets/../server/dev-server.js', '/%2e%2e/README.md', '/assets/%2e%2e/server/dev-server.js',
    '/%252e%252e/README.md', '/%25252e%25252e/README.md', '/assets%2f..%2fserver%2fdev-server.js',
    '/assets\\..\\server\\dev-server.js', '/assets/%5c..%5cserver%5cdev-server.js',
    '//server/share/file.js', '/C:/Windows/win.ini', '/%43%3a/Windows/win.ini', '/%E0%A4%A',
  ]) assert.equal(decodeRequestPath(pathname).allowed, false, pathname);
});

test('query no cambia la decisión y una extensión no pública dentro de assets se bloquea', () => {
  assert.deepEqual(decodeRequestPath('/assets/bootstrap.js?v=1'), { allowed: true, pathname: '/assets/bootstrap.js' });
  assert.equal(publicSurface('/assets/private.env').allowed, false);
  assert.equal(publicSurface('/assets/archive.zip').allowed, false);
});

test('symlink o junction dentro de assets no amplía la superficie pública', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'tributasoft-public-surface-'));
  assert.ok(resolve(base).startsWith(resolve(tmpdir())));
  try {
    const root = join(base, 'root');
    const outside = join(base, 'outside');
    await mkdir(join(root, 'assets', 'utils'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, 'index.html'), '<!doctype html>');
    await writeFile(join(outside, 'secret.js'), 'secret');
    try {
      await symlink(outside, join(root, 'assets', 'utils', 'linked'), 'junction');
    } catch (error) {
      if (error?.code === 'EPERM') { t.skip('El host no permite crear junctions de prueba'); return; }
      throw error;
    }
    const result = await resolvePublicFile(root, '/assets/utils/linked/secret.js');
    assert.equal(result.allowed, false);
    assert.equal(result.code, 'SYMLINK_BLOCKED');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
