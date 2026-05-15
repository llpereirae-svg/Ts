/* screen-clave.js — Pantalla 6 del wizard.
   Creación de la clave con la que el usuario ingresará al portal.
   - Mínimo 4 caracteres
   - Confirmación obligatoria
   - Medidor Shannon de 3 niveles (Baja / Media / Alta)
   - Validación inline en rojo con mensaje breve
   El nivel es informativo: no bloquea el flujo, solo guía al usuario. */

import { validarClave } from './validators.js?v=20260517b';

const LABELS_FUERZA = ['Baja', 'Media', 'Alta'];

export function renderPantallaClave(body, wizardData) {
  body.innerHTML = `
    <p class="datos-intro">
      Esta clave te servirá para ingresar al portal de TributaSoft.
      Usa mínimo 4 caracteres. La barra te indica qué tan segura es.
    </p>

    <div class="field">
      <label for="c-clave">Clave</label>
      <div class="field-password">
        <input id="c-clave" type="password" autocomplete="new-password" value="${escapeAttr(wizardData.clave || '')}">
        <button type="button" class="pwd-toggle" data-target="c-clave" aria-label="Mostrar clave">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
      <div id="c-clave-error" class="error" role="alert" aria-live="polite"></div>
    </div>

    <div class="fuerza-clave" id="c-fuerza" data-nivel="0" role="status" aria-live="polite"></div>
    <p class="fuerza-clave-label" id="c-fuerza-label" data-nivel="0">
      Nivel de seguridad: <strong id="c-fuerza-text">—</strong>
    </p>

    <div class="field">
      <label for="c-confirmar">Confirma tu clave</label>
      <div class="field-password">
        <input id="c-confirmar" type="password" autocomplete="new-password">
        <button type="button" class="pwd-toggle" data-target="c-confirmar" aria-label="Mostrar clave">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
      <div id="c-confirmar-error" class="error" role="alert" aria-live="polite"></div>
    </div>
  `;

  wireClaveScreen(body, wizardData);
}

function wireClaveScreen(root, wd) {
  const claveInput = root.querySelector('#c-clave');
  const claveError = root.querySelector('#c-clave-error');
  const confirmInput = root.querySelector('#c-confirmar');
  const confirmError = root.querySelector('#c-confirmar-error');
  const bar = root.querySelector('#c-fuerza');
  const labelP = root.querySelector('#c-fuerza-label');
  const labelText = root.querySelector('#c-fuerza-text');

  // -------- Toggle mostrar/ocultar clave --------
  root.querySelectorAll('.pwd-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const showing = target.type === 'text';
      target.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-label', showing ? 'Mostrar clave' : 'Ocultar clave');
    });
  });

  // -------- Actualización del medidor + validación --------
  const refrescar = () => {
    const c = claveInput.value;
    wd.clave = c;
    const v = validarClave(c);

    // Medidor
    bar.dataset.nivel = String(v.fuerza);
    bar.setAttribute('aria-label', `Nivel de seguridad: ${LABELS_FUERZA[v.fuerza] || 'Baja'}`);
    if (labelP) labelP.dataset.nivel = String(v.fuerza);
    if (labelText) labelText.textContent = LABELS_FUERZA[v.fuerza] || 'Baja';

    // Validación inline de la clave
    if (!c) {
      claveInput.removeAttribute('aria-invalid');
      claveError.textContent = '';
    } else if (!v.valid) {
      claveInput.setAttribute('aria-invalid', 'true');
      claveError.textContent = v.reason || 'Clave inválida.';
    } else {
      claveInput.removeAttribute('aria-invalid');
      claveError.textContent = '';
    }

    // Validación de la confirmación (siempre)
    refrescarConfirm();
  };

  const refrescarConfirm = () => {
    const c = claveInput.value;
    const conf = confirmInput.value;
    if (!conf) {
      confirmInput.removeAttribute('aria-invalid');
      confirmError.textContent = '';
      return;
    }
    if (conf !== c) {
      confirmInput.setAttribute('aria-invalid', 'true');
      confirmError.textContent = 'Las claves no coinciden.';
    } else {
      confirmInput.removeAttribute('aria-invalid');
      confirmError.textContent = '';
    }
  };

  claveInput.addEventListener('input', refrescar);
  claveInput.addEventListener('blur', refrescar);
  confirmInput.addEventListener('input', refrescarConfirm);
  confirmInput.addEventListener('blur', refrescarConfirm);

  // Render inicial si ya había clave (volvió desde resumen)
  if (wd.clave) {
    confirmInput.value = wd.clave; // si ya pasó por aquí, asumimos confirmada
    refrescar();
  }
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/"/g, '&quot;');
}

export function validarPantallaClave(wd) {
  const v = validarClave(wd.clave);
  if (!v.valid) {
    alert(v.reason || 'Tu clave no cumple los requisitos.');
    return false;
  }
  // La confirmación está en el DOM, no en wd. La leemos directo del input.
  const confirm = document.getElementById('c-confirmar')?.value || '';
  if (confirm !== wd.clave) {
    alert('Las claves no coinciden. Confirma escribiéndola de nuevo abajo.');
    return false;
  }
  return true;
}
