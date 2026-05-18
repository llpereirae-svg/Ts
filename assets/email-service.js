/* email-service.js — Envío del email de bienvenida con resumen del registro.

   Misma arquitectura de capas que token-service.js:

     Capa 1 pública (no tocar al integrar backend):
       - enviarEmailRegistro({ destino, asunto?, datosRegistro }) → { ok, error? }

     Capa 2 reemplazable (mock por ahora):
       - sendEmailHtml(destino, asunto, htmlBody) → { ok }
       Cuando esté listo el backend, cambiar esta función para hacer
       fetch a /api/email/registro con el HTML pre-renderizado.

   El email incluye:
     - Header con marca TributaSoft
     - Sección destacada con USUARIO + CLAVE de acceso al portal
     - Tabla con todos los datos del registro
     - Link al portal
     - Aviso de seguridad sobre la clave */

import { formatCelular } from './wizard.js?v=20260517n';

const PORTAL_URL = 'https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml?faces-redirect=true';
const LOGO_URL = 'https://llpereirae-svg.github.io/Ts/assets/Logo%20TributaSoft.png';

// ============================================================
//   CAPA 2 — Envío real (REEMPLAZAR AL INTEGRAR BACKEND)
// ============================================================

/**
 * Envía un email con HTML al destino. Mock por ahora.
 *
 * Ejemplo de implementación real:
 *   const res = await fetch('/api/email/registro', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ destino, asunto, html: htmlBody })
 *   });
 *   if (!res.ok) throw new Error('Falló el envío del email');
 *   return { ok: true };
 */
async function sendEmailHtml(destino, asunto, htmlBody) {
  console.log(`[email-service MOCK] → ${destino}`);
  console.log(`  Asunto: ${asunto}`);
  console.log(`  HTML (${htmlBody.length} chars):`);
  console.log(htmlBody);
  // Simular latencia
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true };
}

// ============================================================
//   CAPA 1 — Interfaz pública
// ============================================================

/**
 * @param {{
 *   destino: string,
 *   asunto?: string,
 *   datosRegistro: object  // wizardData sanitizado
 * }} opts
 */
export async function enviarEmailRegistro({ destino, asunto, datosRegistro }) {
  if (!destino) throw new Error('Falta el destino del email');
  const subjectFinal = asunto || 'Bienvenido a TributaSoft — Tus credenciales';
  const html = buildHtml(datosRegistro);
  return sendEmailHtml(destino, subjectFinal, html);
}

/**
 * Genera el HTML del email a partir de los datos del wizard ya sanitizados.
 */
function buildHtml(d) {
  const usuario = derivarUsuario(d.rucManual);
  const tipoLabel = mapTipo(d.tipoContribuyente);
  const modoLabel = d.modoFacturacion === 'continuar' ? 'Continuar con mi facturación' : 'Empezar desde cero';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Bienvenido a TributaSoft</title>
</head>
<body style="margin:0;padding:0;background:#f3f3f3;font-family:Arial,Helvetica,sans-serif;color:#1a1c1c">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f3f3;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,35,111,.08);max-width:600px;width:100%">

        <!-- HEADER -->
        <tr><td style="background:#00236f;padding:24px;text-align:center">
          <img src="${LOGO_URL}" alt="TributaSoft" width="56" height="56" style="display:inline-block;vertical-align:middle">
          <span style="color:#ffffff;font-size:24px;font-weight:600;vertical-align:middle;margin-left:8px">TributaSoft</span>
        </td></tr>

        <!-- SALUDO -->
        <tr><td style="padding:28px 28px 8px">
          <h1 style="margin:0 0 8px;font-size:22px;color:#00236f">¡Tu cuenta está lista!</h1>
          <p style="margin:0;color:#444651;font-size:15px;line-height:1.5">
            Hola${d.razonSocial ? ' <strong>' + escapeHtml(d.razonSocial) + '</strong>' : ''}, completamos tu registro en TributaSoft.
            Guarda este correo: tiene tus credenciales y un resumen de los datos con los que te registramos.
          </p>
        </td></tr>

        <!-- CREDENCIALES -->
        <tr><td style="padding:20px 28px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e3f2f8;border:1px solid #2E7A95;border-radius:10px">
            <tr><td style="padding:18px 20px">
              <p style="margin:0 0 14px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#2E7A95;font-weight:700">Tus credenciales de acceso</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:4px 0;color:#444651;font-size:14px;width:80px">Usuario</td>
                  <td style="padding:4px 0;color:#00236f;font-size:16px;font-weight:700;font-family:'Courier New',monospace">${escapeHtml(usuario)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#444651;font-size:14px">Clave</td>
                  <td style="padding:4px 0;color:#00236f;font-size:16px;font-weight:700;font-family:'Courier New',monospace">${escapeHtml(d.clave || '')}</td>
                </tr>
              </table>
              <p style="margin:14px 0 0;font-size:12px;color:#9d4300;background:#fdecde;padding:8px 10px;border-radius:6px">
                Por seguridad, te recomendamos cambiar la clave la primera vez que ingreses al portal.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- BOTÓN PORTAL -->
        <tr><td style="padding:0 28px 24px;text-align:center">
          <a href="${PORTAL_URL}" style="display:inline-block;background:#EF7306;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px">
            Ingresar al portal
          </a>
        </td></tr>

        <!-- RESUMEN -->
        ${seccion('Datos personales', [
          ['Razón social / Nombre', d.razonSocial],
          ['Nombre comercial', (d.nombreComercial && d.nombreComercial.trim()) ? d.nombreComercial : 'NO APLICA'],
          ['RUC', d.rucManual],
          ['Dirección', d.direccion],
          ['Provincia', d.provincia],
          ['Ciudad', d.ciudad],
          ['Correo electrónico', d.email],
          ['Celular', formatCelular(d.celular, d.celularPais)],
        ])}

        ${seccion('Información tributaria', [
          ['Régimen', d.regimen],
          ['Tipo de contribuyente', tipoLabel],
          ['No. de Resolución', d.noResolucion || '—'],
        ])}

        ${seccion('Facturación', [
          ['Modo', modoLabel],
          ['Establecimiento', d.codEstablecimiento],
          ['Punto de emisión', d.codPunto],
          ['Descripción', d.nombrePunto],
          ['Próxima factura', d.secuencias?.factura || '000000001'],
        ])}

        <!-- FOOTER -->
        <tr><td style="background:#f9f9f9;padding:18px 28px;border-top:1px solid #e2e2e2">
          <p style="margin:0 0 6px;font-size:12px;color:#444651">
            Si no fuiste tú quien creó esta cuenta, contáctanos de inmediato:
            <a href="mailto:soporte@tributasoft.ec" style="color:#00236f">soporte@tributasoft.ec</a>
          </p>
          <p style="margin:0;font-size:11px;color:#9a9a9a">
            © 2026 TributaSoft S.A. — Todos los derechos reservados.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function seccion(titulo, filas) {
  const rowsHtml = filas
    .filter(([_, v]) => v && String(v).trim())
    .map(([k, v]) => `
      <tr>
        <td style="padding:8px 16px;color:#444651;font-size:13px;width:40%;border-bottom:1px solid #f3f3f3">${escapeHtml(k)}</td>
        <td style="padding:8px 16px;color:#1a1c1c;font-size:13px;font-weight:600;border-bottom:1px solid #f3f3f3">${escapeHtml(v)}</td>
      </tr>
    `).join('');
  if (!rowsHtml) return '';
  return `
    <tr><td style="padding:0 28px 16px">
      <h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#2E7A95;font-weight:700">${escapeHtml(titulo)}</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e2e2e2;border-radius:8px">
        ${rowsHtml}
      </table>
    </td></tr>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Usuario derivado del RUC: primeros 10 dígitos (sin el "001" terminal).
 */
export function derivarUsuario(ruc) {
  if (!ruc || ruc.length < 10) return '';
  return ruc.slice(0, 10);
}

function mapTipo(t) {
  const m = {
    NO_OBLIGADO: 'No Obligado a Llevar Contabilidad',
    OBLIGADO: 'Obligado a Llevar Contabilidad',
    AGENTE_RETENCION: 'Agente de Retención',
    CONTRIBUYENTE_ESPECIAL: 'Contribuyente Especial',
    GRAN_CONTRIBUYENTE: 'Gran Contribuyente',
  };
  return m[t] || t || '';
}
