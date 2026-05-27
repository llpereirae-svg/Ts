#!/usr/bin/env python3
"""
smoke-test.py — Validaciones que corren en CI antes del deploy a Pages.

Detecta los errores más comunes que harían que la página se rompa en
producción:

  1. CSP estricto vs <script>...</script> inline sin contenido vacío.
     (Este es el bug que rompió la web el 2026-05-20: el CSP no incluía
     'unsafe-inline' en script-src, pero index.html tenía un módulo inline.)

  2. CSP estricto vs <style>...</style> inline sin 'unsafe-inline' en style-src.

  3. URLs externas referenciadas que NO están en la allowlist del CSP.

  4. Scripts/links con src/href que apuntan a archivos que no existen
     en el repo (404 garantizado en producción).

  5. Versionado de cache buster inconsistente entre archivos.

  6. Imports relativos en .js que apuntan a archivos inexistentes.

Si CUALQUIER chequeo falla, exit code 1 ->el workflow de Pages aborta
y no despliega. Esto evita publicar una versión rota.

Uso: python .github/smoke-test.py
"""

import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

errors = []
warnings = []

def err(msg):
    errors.append(msg)
    print(f"[FAIL] {msg}")

def warn(msg):
    warnings.append(msg)
    print(f"[WARN] {msg}")

def info(msg):
    print(f"[ OK ] {msg}")

# =========================================================================
# 1. Leer y parsear index.html + CSP
# =========================================================================

index_path = ROOT / 'index.html'
if not index_path.exists():
    err("index.html no existe — fallback total.")
    sys.exit(1)

html_raw = index_path.read_text(encoding='utf-8')

# Quitar comentarios HTML <!-- ... --> antes de buscar scripts/styles inline,
# para que las menciones a "<script>" dentro de un comentario no generen
# falsos positivos. NOTA: usamos html_raw para line numbers correctos cuando
# buscamos referencias, pero usamos `html` (sin comentarios) para el match.
html = re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), html_raw, flags=re.DOTALL)

# Extraer la directiva CSP.
# OJO: el content puede tener apóstrofes adentro (ej. 'self', 'unsafe-inline'),
# por eso usamos una back-reference \1 para que el cierre coincida con la
# apertura ("..." o '...'), en vez del simplista [^"'].
csp_match = re.search(
    r'<meta\s+http-equiv=["\']Content-Security-Policy["\']\s+content=(["\'])(.+?)\1',
    html, re.IGNORECASE | re.DOTALL,
)

csp_directives = {}
if csp_match:
    csp_raw = csp_match.group(2)
    # Parsear "key val val; key val val" ->dict
    for clause in csp_raw.split(';'):
        clause = clause.strip()
        if not clause:
            continue
        parts = clause.split()
        if parts:
            csp_directives[parts[0]] = parts[1:]
    info(f"CSP detectado con {len(csp_directives)} directivas")
else:
    warn("No se encontró meta CSP en index.html (no es bloqueante, pero recomendado)")

# =========================================================================
# 2. CSP vs scripts inline (el bug del 2026-05-20)
# =========================================================================

script_src = csp_directives.get('script-src', csp_directives.get('default-src', []))
script_allows_inline = "'unsafe-inline'" in script_src or any(
    s.startswith("'nonce-") or s.startswith("'sha") for s in script_src
)

# Buscar <script>...contenido...</script> (inline, NO con src=...)
# Patrón: <script ...> NO_SRC ... </script> con contenido no vacío entre tags
inline_script_pattern = re.compile(
    r'<script(?![^>]*\bsrc\s*=)[^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)

inline_scripts_con_contenido = []
for m in inline_script_pattern.finditer(html):
    contenido = m.group(1).strip()
    if contenido:  # Solo si tiene código adentro
        # Calcular número de línea aproximado
        linea = html[:m.start()].count('\n') + 1
        inline_scripts_con_contenido.append((linea, contenido[:60]))

if inline_scripts_con_contenido and not script_allows_inline and script_src:
    for linea, snippet in inline_scripts_con_contenido:
        err(f"<script> inline en línea {linea} sería bloqueado por CSP (script-src no tiene 'unsafe-inline' ni nonce). Mueve el código a un archivo externo. Snippet: {snippet!r}")
else:
    info(f"Inline scripts vs CSP: OK ({len(inline_scripts_con_contenido)} inline scripts, allow-inline={script_allows_inline})")

# =========================================================================
# 3. CSP vs styles inline
# =========================================================================

style_src = csp_directives.get('style-src', csp_directives.get('default-src', []))
style_allows_inline = "'unsafe-inline'" in style_src or any(
    s.startswith("'nonce-") or s.startswith("'sha") for s in style_src
)

inline_style_pattern = re.compile(r'<style[^>]*>(.*?)</style>', re.IGNORECASE | re.DOTALL)
inline_styles = [m for m in inline_style_pattern.finditer(html) if m.group(1).strip()]

if inline_styles and not style_allows_inline and style_src:
    err(f"{len(inline_styles)} bloque(s) <style> inline sin 'unsafe-inline' ni nonce en style-src.")
else:
    info(f"Inline styles vs CSP: OK ({len(inline_styles)} bloques, allow-inline={style_allows_inline})")

# También style="..." inline en atributos (más permisivo: solo warning)
inline_style_attr = re.findall(r'\sstyle\s*=\s*["\']', html)
if inline_style_attr and not style_allows_inline and style_src:
    warn(f"{len(inline_style_attr)} atributo(s) style=\"...\" inline — necesitan 'unsafe-inline' en style-src.")

# =========================================================================
# 4. Scripts y links con src/href que apuntan a archivos locales inexistentes
# =========================================================================

# Buscar atributos src/href que sean relativos (./ o ../)
local_refs = re.findall(
    r'(?:src|href)\s*=\s*["\'](\.\.?/[^"\']+)["\']',
    html,
)

for ref in local_refs:
    # Quitar query string del cache buster, y URL-decodificar (porque los nombres
    # de archivo con espacios aparecen como %20 en el HTML).
    clean = urllib.parse.unquote(ref.split('?')[0].split('#')[0])
    full = (ROOT / clean).resolve()
    # Verificar que esté dentro del repo y exista
    try:
        full.relative_to(ROOT)
    except ValueError:
        err(f"Referencia escapa del repo: {ref}")
        continue
    if not full.exists():
        err(f"Referencia rota en index.html: {ref} ->{full} no existe")

if not any('Referencia rota' in e for e in errors):
    info(f"Referencias locales en index.html: {len(local_refs)} todas OK")

# =========================================================================
# 5. URLs externas referenciadas vs allowlist del CSP
# =========================================================================

external_urls = set(re.findall(r'https://([a-zA-Z0-9.-]+)/', html))
# Filtrar las del propio dominio para no levantar falso positivo
external_urls = {u for u in external_urls if u not in ('llpereirae-svg.github.io', 'tributasoft.com.ec')}

allowed_hosts = set()
for src in [script_src, style_src, csp_directives.get('font-src', []),
            csp_directives.get('img-src', []), csp_directives.get('connect-src', [])]:
    for entry in src:
        m = re.match(r'https://([a-zA-Z0-9.-]+)', entry)
        if m:
            allowed_hosts.add(m.group(1))

# URLs como wa.me y mailto: no son script-loaded, las ignoramos.
ignore_hosts = {'wa.me', 'tbc.tributasoft.ec', 'github.com'}
to_check = external_urls - ignore_hosts

for host in to_check:
    if host not in allowed_hosts:
        warn(f"URL externa referenciada que NO está en CSP allowlist: {host}")

if not any(host not in allowed_hosts for host in to_check):
    info(f"URLs externas vs CSP allowlist: OK ({len(to_check)} externos verificados)")

# =========================================================================
# 6. Imports relativos en .js apuntan a archivos existentes
# =========================================================================

js_files = list((ROOT / 'assets').rglob('*.js'))
broken_imports = []
total_imports = 0

import_pattern = re.compile(
    r'''(?:^|\s)(?:import|export)\s+(?:[^'"]*?from\s+)?['"](\.\.?/[^'"]+?)['"]''',
    re.MULTILINE,
)
dynamic_import_pattern = re.compile(r'''import\s*\(\s*['"`](\.\.?/[^'"`]+?)['"`]''')
# Imports con template strings (backticks): saltamos validación porque pueden ser dinámicos.

for js_file in js_files:
    text = js_file.read_text(encoding='utf-8')
    for pat in (import_pattern, dynamic_import_pattern):
        for m in pat.finditer(text):
            ref = m.group(1).split('?')[0]
            total_imports += 1
            target = (js_file.parent / ref).resolve()
            try:
                target.relative_to(ROOT)
            except ValueError:
                broken_imports.append(f"{js_file.relative_to(ROOT)}: import escapa del repo: {ref}")
                continue
            if not target.exists():
                broken_imports.append(f"{js_file.relative_to(ROOT)}: import roto: {ref} ->{target.relative_to(ROOT)} no existe")

for b in broken_imports:
    err(b)

if not broken_imports:
    info(f"Imports relativos en JS: OK ({total_imports} verificados en {len(js_files)} archivos)")

# =========================================================================
# 7. Cache buster consistente
# =========================================================================

ver_pattern = re.compile(r'\?v=(20\d{6}[a-z]?)')
all_versions = set()
for f in list(ROOT.rglob('*.js')) + list(ROOT.rglob('*.html')) + list(ROOT.rglob('*.css')):
    if '.git' in f.parts or '_stitch_ref' in f.parts:
        continue
    if 'node_modules' in f.parts:
        continue
    txt = f.read_text(encoding='utf-8')
    all_versions.update(ver_pattern.findall(txt))

if len(all_versions) > 1:
    err(f"Versiones de cache buster inconsistentes: {sorted(all_versions)} — bumpea todos a la última")
elif len(all_versions) == 1:
    info(f"Cache buster: {all_versions.pop()} (consistente en todo el repo)")

# =========================================================================
# Resultado final
# =========================================================================

print()
print(f"=== RESULTADO ===")
print(f"Errores: {len(errors)}")
print(f"Warnings: {len(warnings)}")

if errors:
    print()
    print("DEPLOY ABORTADO — corrige los errores antes de mergear.")
    sys.exit(1)
else:
    print()
    print("Smoke test OK — deploy autorizado.")
    sys.exit(0)
