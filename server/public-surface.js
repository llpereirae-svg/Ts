import { lstat, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PUBLIC_ROOT_FILES = Object.freeze([
  'index.html',
  'Terminos-y-Condiciones.txt',
  'Politica-de-Privacidad.txt',
  'Politica-de-Cookies.txt',
]);

export const PUBLIC_ASSET_EXTENSIONS = Object.freeze([
  '.css', '.js', '.otf', '.png', '.svg', '.ttf',
]);

export const PUBLIC_ASSET_ROOT_FILES = Object.freeze([
  'app.js', 'Avenida.otf', 'bootstrap.js', 'Logo TributaSoft.png',
  'logo.svg', 'node-forge-1.3.1.min.js', 'styles.css', 'wizard.css', 'wizard.js',
]);

export const PUBLIC_ASSET_DIRECTORIES = Object.freeze([
  'fonts', 'manual', 'parsers', 'screens', 'services', 'utils',
]);

const ROOT_FILES = new Set(PUBLIC_ROOT_FILES);
const ASSET_EXTENSIONS = new Set(PUBLIC_ASSET_EXTENSIONS);
const ASSET_ROOT_FILES = new Set(PUBLIC_ASSET_ROOT_FILES);
const ASSET_DIRECTORIES = new Set(PUBLIC_ASSET_DIRECTORIES);
const NEVER_PUBLIC_SEGMENTS = new Set(['node_modules', 'tests', 'docs', 'server', 'scripts', 'logs', 'dumps']);
const ENCODED_BYTE = /%[0-9a-f]{2}/i;

export function decodeRequestPath(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/') || rawUrl.startsWith('//')) {
    return denied('INVALID_TARGET');
  }
  const query = rawUrl.indexOf('?');
  let pathname = query === -1 ? rawUrl : rawUrl.slice(0, query);
  for (let depth = 0; depth < 5; depth += 1) {
    const unsafe = unsafePath(pathname);
    if (unsafe) return denied(unsafe);
    if (!ENCODED_BYTE.test(pathname)) return { allowed: true, pathname };
    try {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) return { allowed: true, pathname };
      pathname = decoded;
    } catch {
      return denied('MALFORMED_ENCODING');
    }
  }
  return denied('ENCODING_DEPTH');
}

export function publicSurface(pathname) {
  const checked = decodeRequestPath(pathname);
  if (!checked.allowed) return checked;
  const normalized = checked.pathname === '/' ? 'index.html' : checked.pathname.slice(1);
  if (ROOT_FILES.has(normalized)) return { allowed: true, relativePath: normalized, kind: 'root' };
  if (!normalized.startsWith('assets/')) return denied('NOT_PUBLIC');
  const assetPath = normalized.slice('assets/'.length);
  const segments = assetPath.split('/');
  if (!assetPath || segments.some(segment => !segment || segment.startsWith('.') || NEVER_PUBLIC_SEGMENTS.has(segment.toLowerCase()))) {
    return denied('ASSET_PATH_NOT_PUBLIC');
  }
  if (segments.length === 1 ? !ASSET_ROOT_FILES.has(segments[0]) : !ASSET_DIRECTORIES.has(segments[0])) {
    return denied('ASSET_PATH_NOT_PUBLIC');
  }
  if (!ASSET_EXTENSIONS.has(extname(normalized).toLowerCase())) return denied('ASSET_TYPE_NOT_PUBLIC');
  return { allowed: true, relativePath: normalized, kind: 'asset' };
}

export async function resolvePublicFile(root, pathname) {
  const surface = publicSurface(pathname);
  if (!surface.allowed) return surface;
  try {
    const rootPath = resolve(root);
    const candidate = resolve(rootPath, surface.relativePath);
    if (!isWithin(rootPath, candidate)) return denied('OUTSIDE_ROOT');

    let current = rootPath;
    for (const segment of surface.relativePath.split('/')) {
      current = join(current, segment);
      if ((await lstat(current)).isSymbolicLink()) return denied('SYMLINK_BLOCKED');
    }

    const realRoot = await realpath(rootPath);
    const realCandidate = await realpath(candidate);
    const allowedBase = surface.kind === 'asset' ? await realpath(join(rootPath, 'assets')) : realRoot;
    if (!isWithin(allowedBase, realCandidate)) return denied('OUTSIDE_PUBLIC_ROOT');
    if (!(await stat(realCandidate)).isFile()) return denied('NOT_A_FILE');
    return { allowed: true, filePath: realCandidate };
  } catch {
    return denied('NOT_FOUND');
  }
}

function unsafePath(pathname) {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return 'INVALID_TARGET';
  if (pathname.includes('\\') || /[\u0000-\u001f\u007f]/.test(pathname)) return 'INVALID_SEPARATOR';
  const segments = pathname.split('/');
  if (segments.some(segment => segment === '.' || segment === '..')) return 'PATH_TRAVERSAL';
  if (segments.some(segment => segment.includes(':'))) return 'ABSOLUTE_PATH';
  return '';
}

function isWithin(base, target) {
  const child = relative(base, target);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`));
}

function denied(code) {
  return { allowed: false, code };
}
