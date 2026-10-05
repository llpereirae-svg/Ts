export function resolveIssuerAuthorizationMock(ruc, {
  mode = '',
  notAuthorizedRuc = '',
  now = () => new Date(),
} = {}) {
  const normalizedMode = String(mode).trim().toLowerCase();
  const checkedAt = now().toISOString();

  if (normalizedMode === '1' || normalizedMode === 'authorized') {
    return { ruc, authorized: true, authorizationDate: null, checkedAt };
  }
  if (normalizedMode === 'not_authorized') {
    return { ruc, authorized: false, authorizationDate: null, checkedAt };
  }
  if (normalizedMode === 'by_ruc') {
    const deniedRuc = String(notAuthorizedRuc).trim();
    if (!/^\d{13}$/.test(deniedRuc)) return null;
    return { ruc, authorized: ruc !== deniedRuc, authorizationDate: null, checkedAt };
  }
  return null;
}
