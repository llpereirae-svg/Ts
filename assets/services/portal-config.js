// URL ya utilizada por el correo de bienvenida. BACKEND/CONFIG_REQUIRED si se retira.
export const TRIBUTASOFT_LOGIN_URL = 'https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml?faces-redirect=true';

const configuredTutorial = globalThis.document
  ?.querySelector('meta[name="tributasoft:sri-authorization-tutorial"]')
  ?.getAttribute('content')?.trim();

// Placeholder centralizado: reemplazar el contenido del meta cuando se publique
// el tutorial definitivo, sin cambiar el flujo ni el componente.
export const SRI_AUTHORIZATION_TUTORIAL_URL = configuredTutorial || 'https://tributasoft.com.ec/';
