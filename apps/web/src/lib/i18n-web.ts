import type { i18n as I18n } from 'i18next';

/**
 * App-local auth-form copy, keyed per supported locale. These keys live in the
 * web app (not in @padel/i18n, which we must not modify) but are still surfaced
 * exclusively through the i18n instance so no copy is hard-coded in JSX.
 */
const webAuth = {
  'pt-PT': {
    identifierLabel: 'E-mail ou telemóvel',
    identifierPlaceholder: 'nome@exemplo.com ou +351…',
    otpLabel: 'Código de 6 dígitos',
    otpPlaceholder: '••••••',
    otpHelp: 'Enviámos um código para {{identifier}}.',
    verify: 'Confirmar',
    fullNameLabel: 'Nome completo',
    fullNamePlaceholder: 'O seu nome',
    secondaryEmailLabel: 'E-mail',
    secondaryPhoneLabel: 'Telemóvel',
    passwordLabel: 'Palavra-passe',
    createAccountTitle: 'Complete a sua conta',
    createAccount: 'Criar conta',
    cooldown: 'Reenviar em {{seconds}}s',
    locked: 'Demasiadas tentativas. Tente de outra forma.',
  },
  'pt-BR': {
    identifierLabel: 'E-mail ou celular',
    identifierPlaceholder: 'nome@exemplo.com ou +55…',
    otpLabel: 'Código de 6 dígitos',
    otpPlaceholder: '••••••',
    otpHelp: 'Enviamos um código para {{identifier}}.',
    verify: 'Confirmar',
    fullNameLabel: 'Nome completo',
    fullNamePlaceholder: 'Seu nome',
    secondaryEmailLabel: 'E-mail',
    secondaryPhoneLabel: 'Celular',
    passwordLabel: 'Senha',
    createAccountTitle: 'Complete sua conta',
    createAccount: 'Criar conta',
    cooldown: 'Reenviar em {{seconds}}s',
    locked: 'Muitas tentativas. Tente de outra forma.',
  },
  en: {
    identifierLabel: 'Email or phone',
    identifierPlaceholder: 'name@example.com or +1…',
    otpLabel: '6-digit code',
    otpPlaceholder: '••••••',
    otpHelp: 'We sent a code to {{identifier}}.',
    verify: 'Verify',
    fullNameLabel: 'Full name',
    fullNamePlaceholder: 'Your name',
    secondaryEmailLabel: 'Email',
    secondaryPhoneLabel: 'Phone',
    passwordLabel: 'Password',
    createAccountTitle: 'Complete your account',
    createAccount: 'Create account',
    cooldown: 'Resend in {{seconds}}s',
    locked: 'Too many attempts. Try another way.',
  },
} as const;

export type WebLocale = keyof typeof webAuth;

/**
 * Merges the web-only auth-form keys into the shared `auth` namespace of an
 * already-initialised i18n instance, for every supported locale.
 */
export function registerWebAuthCopy(instance: I18n): void {
  (Object.keys(webAuth) as WebLocale[]).forEach((locale) => {
    instance.addResourceBundle(locale, 'auth', webAuth[locale], true, false);
  });
}

/**
 * App-shell copy (nav labels + a few shared strings), surfaced through the `app`
 * i18n namespace. Lives in the web app for the same reason as the auth copy above.
 */
const webApp = {
  'pt-PT': {
    nav: { home: 'Início', events: 'Eventos', explore: 'Explorar', community: 'Comunidade', profile: 'Perfil' },
    chat: 'Conversas',
    notifications: 'Notificações',
    comingSoon: 'Em breve',
    welcome: 'Bem-vindo, {{name}}',
    noCommunities: 'Ainda não pertences a nenhuma comunidade.',
  },
  'pt-BR': {
    nav: { home: 'Início', events: 'Eventos', explore: 'Explorar', community: 'Comunidade', profile: 'Perfil' },
    chat: 'Conversas',
    notifications: 'Notificações',
    comingSoon: 'Em breve',
    welcome: 'Bem-vindo, {{name}}',
    noCommunities: 'Você ainda não participa de nenhuma comunidade.',
  },
  en: {
    nav: { home: 'Home', events: 'Events', explore: 'Explore', community: 'Community', profile: 'Profile' },
    chat: 'Chat',
    notifications: 'Notifications',
    comingSoon: 'Coming soon',
    welcome: 'Welcome, {{name}}',
    noCommunities: "You're not in any communities yet.",
  },
} as const;

/**
 * Merges the web-only app-shell keys into the `app` namespace for every locale.
 */
export function registerWebAppCopy(instance: I18n): void {
  (Object.keys(webApp) as WebLocale[]).forEach((locale) => {
    instance.addResourceBundle(locale, 'app', webApp[locale], true, false);
  });
}
