import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

for (const hostname of ['localhost', '127.0.0.1', 'tributasoft.com.ec']) {
  test(`correo ${hostname}: mock local sin alterar producción`, () => {
    const script = `
      import assert from 'node:assert/strict';
      globalThis.window = { location: { hostname: ${JSON.stringify(hostname)} } };
      let calls = 0;
      globalThis.fetch = async () => { calls++; throw new Error('backend ausente'); };
      const config = await import('./assets/services/config.js?v=20261004a');
      const { generarYEnviarToken, verificarToken } = await import('./assets/services/token-service.js');
      if (config.ENV === 'development') {
        assert.equal(config.USE_MOCKS, false);
        const result = await generarYEnviarToken({ canal: 'email', destino: 'prueba@example.com' });
        assert.match(result.token, /^\\d{6}$/);
        const base = { canal: 'email', destino: 'prueba@example.com', tokenEsperado: result.token, expiraEn: result.expiraEn };
        assert.equal((await verificarToken({ ...base, codigo: result.token })).valid, true);
        const wrong = result.token === '000000' ? '000001' : '000000';
        assert.equal((await verificarToken({ ...base, codigo: wrong })).valid, false);
        assert.equal((await verificarToken({ ...base, codigo: result.token, expiraEn: new Date(0) })).error, 'EXPIRADO');
        assert.equal(calls, 0);
      } else {
        assert.equal(config.DEV_EMAIL_TOKEN_MOCK, false);
        await assert.rejects(generarYEnviarToken({ canal: 'email', destino: 'prueba@example.com' }));
        assert.equal((await verificarToken({ canal: 'email', destino: 'prueba@example.com', codigo: '123456', tokenEsperado: '123456' })).valid, false);
        assert.equal(calls, 2);
      }
    `;
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('../', import.meta.url), stdio: 'pipe' }));
  });
}

test('producción acepta únicamente booleano estricto al verificar correo', () => {
  const script = `
    import assert from 'node:assert/strict';
    globalThis.window = { location: { hostname: 'tributasoft.com.ec' } };
    const responses = [{ valid: true }, { valid: false }, { valid: 'false' }, {}, null, []];
    const { verificarToken } = await import('./assets/services/token-service.js');
    for (const body of responses) {
      globalThis.fetch = async () => ({ ok: true, json: async () => body });
      const result = await verificarToken({ canal: 'email', destino: 'prueba@example.com', codigo: '123456' });
      assert.equal(result.valid, body?.valid === true && typeof body.valid === 'boolean');
      if (typeof body?.valid !== 'boolean') assert.equal(result.error, 'SERVICIO');
    }
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('../', import.meta.url), stdio: 'pipe' }));
});
