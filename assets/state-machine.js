// state-machine.js — Máquina de estados explícita del flujo de registro.
// Sin estado oculto en el DOM. Toda transición se dispara con `send(event, payload)`.

export const STATES = Object.freeze({
  IDLE: 'IDLE',
  VALIDATING_FORMAT: 'VALIDATING_FORMAT',
  ERROR_FORMAT: 'ERROR_FORMAT',
  CHECKING_DB: 'CHECKING_DB',
  REDIRECT_COTIZADOR: 'REDIRECT_COTIZADOR',
  QUERYING_SRI: 'QUERYING_SRI',
  FORM_OPEN_PREFILLED: 'FORM_OPEN_PREFILLED',
  FORM_OPEN_EMPTY: 'FORM_OPEN_EMPTY',
  SENDING_TOKEN: 'SENDING_TOKEN',
  TOKEN_INPUT: 'TOKEN_INPUT',
  ERROR_TOKEN: 'ERROR_TOKEN',
  TOKEN_LOCKED: 'TOKEN_LOCKED',
  PASSWORD_INPUT: 'PASSWORD_INPUT',
  FIRMA_OPTIONAL: 'FIRMA_OPTIONAL',
  VALIDATING_FIRMA: 'VALIDATING_FIRMA',
  ERROR_FIRMA: 'ERROR_FIRMA',
  SUCCESS: 'SUCCESS',
});

export const EVENTS = Object.freeze({
  RUC_TYPED: 'RUC_TYPED',
  RUC_FORMAT_OK: 'RUC_FORMAT_OK',
  RUC_FORMAT_BAD: 'RUC_FORMAT_BAD',
  RUC_EDIT: 'RUC_EDIT',
  DB_EXISTS: 'DB_EXISTS',
  DB_NEW: 'DB_NEW',
  SRI_OK: 'SRI_OK',
  SRI_FAIL: 'SRI_FAIL',
  FORM_SUBMIT: 'FORM_SUBMIT',
  TOKEN_SENT: 'TOKEN_SENT',
  TOKEN_OK: 'TOKEN_OK',
  TOKEN_WRONG: 'TOKEN_WRONG',
  TOKEN_LOCKED: 'TOKEN_LOCKED',
  PASSWORD_OK: 'PASSWORD_OK',
  FIRMA_UPLOAD: 'FIRMA_UPLOAD',
  FIRMA_OK: 'FIRMA_OK',
  FIRMA_BAD: 'FIRMA_BAD',
  FIRMA_SKIP: 'FIRMA_SKIP',
  FINALIZED: 'FINALIZED',
  RESET: 'RESET',
});

// Mapa de transiciones: { estado: { evento: estadoSiguiente } }
const TRANSITIONS = {
  [STATES.IDLE]: {
    [EVENTS.RUC_TYPED]: STATES.VALIDATING_FORMAT,
  },
  [STATES.VALIDATING_FORMAT]: {
    [EVENTS.RUC_FORMAT_BAD]: STATES.ERROR_FORMAT,
    [EVENTS.RUC_FORMAT_OK]: STATES.CHECKING_DB,
  },
  [STATES.ERROR_FORMAT]: {
    [EVENTS.RUC_EDIT]: STATES.IDLE,
    [EVENTS.RUC_TYPED]: STATES.VALIDATING_FORMAT,
  },
  [STATES.CHECKING_DB]: {
    [EVENTS.DB_EXISTS]: STATES.REDIRECT_COTIZADOR,
    [EVENTS.DB_NEW]: STATES.QUERYING_SRI,
  },
  [STATES.QUERYING_SRI]: {
    [EVENTS.SRI_OK]: STATES.FORM_OPEN_PREFILLED,
    [EVENTS.SRI_FAIL]: STATES.FORM_OPEN_EMPTY,
  },
  [STATES.FORM_OPEN_PREFILLED]: {
    [EVENTS.FORM_SUBMIT]: STATES.SENDING_TOKEN,
    [EVENTS.RUC_EDIT]: STATES.IDLE,
  },
  [STATES.FORM_OPEN_EMPTY]: {
    [EVENTS.FORM_SUBMIT]: STATES.SENDING_TOKEN,
    [EVENTS.RUC_EDIT]: STATES.IDLE,
  },
  [STATES.SENDING_TOKEN]: {
    [EVENTS.TOKEN_SENT]: STATES.TOKEN_INPUT,
  },
  [STATES.TOKEN_INPUT]: {
    [EVENTS.TOKEN_WRONG]: STATES.ERROR_TOKEN,
    [EVENTS.TOKEN_OK]: STATES.PASSWORD_INPUT,
    [EVENTS.TOKEN_LOCKED]: STATES.TOKEN_LOCKED,
  },
  [STATES.ERROR_TOKEN]: {
    [EVENTS.TOKEN_WRONG]: STATES.ERROR_TOKEN,
    [EVENTS.TOKEN_OK]: STATES.PASSWORD_INPUT,
    [EVENTS.TOKEN_LOCKED]: STATES.TOKEN_LOCKED,
  },
  [STATES.TOKEN_LOCKED]: {
    [EVENTS.RESET]: STATES.IDLE,
  },
  [STATES.PASSWORD_INPUT]: {
    [EVENTS.PASSWORD_OK]: STATES.FIRMA_OPTIONAL,
  },
  [STATES.FIRMA_OPTIONAL]: {
    [EVENTS.FIRMA_UPLOAD]: STATES.VALIDATING_FIRMA,
    [EVENTS.FIRMA_SKIP]: STATES.SUCCESS,
  },
  [STATES.VALIDATING_FIRMA]: {
    [EVENTS.FIRMA_OK]: STATES.SUCCESS,
    [EVENTS.FIRMA_BAD]: STATES.ERROR_FIRMA,
  },
  [STATES.ERROR_FIRMA]: {
    [EVENTS.FIRMA_UPLOAD]: STATES.VALIDATING_FIRMA,
    [EVENTS.FIRMA_SKIP]: STATES.SUCCESS,
  },
  [STATES.SUCCESS]: {
    [EVENTS.RESET]: STATES.IDLE,
  },
  [STATES.REDIRECT_COTIZADOR]: {
    [EVENTS.RESET]: STATES.IDLE,
  },
};

export function createMachine(initialContext = {}) {
  let state = STATES.IDLE;
  let context = { ...initialContext, tokenAttempts: 0, tokenMaxAttempts: 5 };
  const listeners = new Set();

  function emit(eventName) {
    for (const cb of listeners) {
      try {
        cb({ state, context, event: eventName });
      } catch (err) {
        console.error('Listener error:', err);
      }
    }
  }

  return {
    get state() { return state; },
    get context() { return context; },

    subscribe(cb) {
      listeners.add(cb);
      cb({ state, context, event: 'INIT' });
      return () => listeners.delete(cb);
    },

    send(event, payload = {}) {
      const next = TRANSITIONS[state]?.[event];
      if (!next) {
        console.warn(`[SM] Transición inválida: ${state} + ${event} → (ignorada)`);
        return false;
      }
      // Mezcla payload al contexto
      context = { ...context, ...payload };

      // Reglas particulares de TOKEN: contar intentos y bloquear al 5º.
      if (event === EVENTS.TOKEN_WRONG) {
        context.tokenAttempts = (context.tokenAttempts || 0) + 1;
        if (context.tokenAttempts >= context.tokenMaxAttempts) {
          state = STATES.TOKEN_LOCKED;
          emit(EVENTS.TOKEN_LOCKED);
          return true;
        }
      }
      if (event === EVENTS.TOKEN_OK) {
        context.tokenAttempts = 0;
      }
      if (event === EVENTS.RESET) {
        context = { tokenAttempts: 0, tokenMaxAttempts: 5 };
      }

      state = next;
      emit(event);
      return true;
    },

    can(event) {
      return Boolean(TRANSITIONS[state]?.[event]);
    },

    reset() {
      this.send(EVENTS.RESET);
    },
  };
}
