import type { i18n as I18n } from 'i18next';

/**
 * App-local copy for the mobile app, keyed per supported locale. These keys live
 * in the mobile app (not in @padel/i18n, which we must not modify) but are still
 * surfaced exclusively through the i18n instance so no copy is hard-coded in JSX.
 * Mirrors apps/web/src/lib/i18n-web.ts.
 */
const mobileAuth = {
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
    secondaryEmailPlaceholder: 'nome@exemplo.com',
    secondaryPhonePlaceholder: '+351…',
    passwordLabel: 'Palavra-passe',
    createAccountTitle: 'Complete a sua conta',
    createAccount: 'Criar conta',
    cooldown: 'Reenviar em {{seconds}}s',
    locked: 'Demasiadas tentativas. Tente de outra forma.',
    welcomeTitle1: 'Encontre o seu jogo',
    welcomeBody1: 'Junte-se a jogos de padel perto de si, ao seu nível.',
    welcomeTitle2: 'Conheça a sua comunidade',
    welcomeBody2: 'Clubes, grupos e jogadores numa só app.',
    welcomeTitle3: 'Jogue mais',
    welcomeBody3: 'Reserve, marque e acompanhe os seus jogos.',
    startNow: 'Começar agora',
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
    secondaryEmailPlaceholder: 'nome@exemplo.com',
    secondaryPhonePlaceholder: '+55…',
    passwordLabel: 'Senha',
    createAccountTitle: 'Complete sua conta',
    createAccount: 'Criar conta',
    cooldown: 'Reenviar em {{seconds}}s',
    locked: 'Muitas tentativas. Tente de outra forma.',
    welcomeTitle1: 'Encontre seu jogo',
    welcomeBody1: 'Participe de jogos de padel perto de você, no seu nível.',
    welcomeTitle2: 'Conheça sua comunidade',
    welcomeBody2: 'Clubes, grupos e jogadores em um só app.',
    welcomeTitle3: 'Jogue mais',
    welcomeBody3: 'Reserve, marque e acompanhe seus jogos.',
    startNow: 'Começar agora',
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
    secondaryEmailPlaceholder: 'name@example.com',
    secondaryPhonePlaceholder: '+1…',
    passwordLabel: 'Password',
    createAccountTitle: 'Complete your account',
    createAccount: 'Create account',
    cooldown: 'Resend in {{seconds}}s',
    locked: 'Too many attempts. Try another way.',
    welcomeTitle1: 'Find your game',
    welcomeBody1: 'Join padel games near you, at your level.',
    welcomeTitle2: 'Meet your community',
    welcomeBody2: 'Clubs, groups and players in one app.',
    welcomeTitle3: 'Play more',
    welcomeBody3: 'Book, score and track your games.',
    startNow: 'Start now',
  },
} as const;

const mobileOnboarding = {
  'pt-PT': {
    locationTitle: 'Onde joga?',
    locationBody: 'Ajuda-nos a mostrar jogos perto de si.',
    handTitle: 'Mão dominante',
    handBody: 'Para equilibrar as equipas.',
    sideTitle: 'Lado preferido',
    sideBody: 'Esquerda ou direita?',
    jammerPlusTitle: 'Jammer+',
    jammerPlusBody: 'Desbloqueie tudo. Pode fazer isto mais tarde.',
    continue: 'Continuar',
    finish: 'Concluir',
    handLeft: 'Esquerda',
    handRight: 'Direita',
    sideLeft: 'Esquerda',
    sideRight: 'Direita',
  },
  'pt-BR': {
    locationTitle: 'Onde você joga?',
    locationBody: 'Ajuda a mostrar jogos perto de você.',
    handTitle: 'Mão dominante',
    handBody: 'Para equilibrar os times.',
    sideTitle: 'Lado preferido',
    sideBody: 'Esquerda ou direita?',
    jammerPlusTitle: 'Jammer+',
    jammerPlusBody: 'Desbloqueie tudo. Você pode fazer isso depois.',
    continue: 'Continuar',
    finish: 'Concluir',
    handLeft: 'Esquerda',
    handRight: 'Direita',
    sideLeft: 'Esquerda',
    sideRight: 'Direita',
  },
  en: {
    locationTitle: 'Where do you play?',
    locationBody: 'Helps us show games near you.',
    handTitle: 'Dominant hand',
    handBody: 'To balance the teams.',
    sideTitle: 'Preferred side',
    sideBody: 'Left or right?',
    jammerPlusTitle: 'Jammer+',
    jammerPlusBody: 'Unlock everything. You can do this later.',
    continue: 'Continue',
    finish: 'Finish',
    handLeft: 'Left',
    handRight: 'Right',
    sideLeft: 'Left',
    sideRight: 'Right',
  },
} as const;

export type MobileLocale = keyof typeof mobileAuth;

/**
 * Merges the mobile-only auth + onboarding keys into the shared namespaces of an
 * already-initialised i18n instance, for every supported locale.
 */
export function registerMobileCopy(instance: I18n): void {
  (Object.keys(mobileAuth) as MobileLocale[]).forEach((locale) => {
    instance.addResourceBundle(locale, 'auth', mobileAuth[locale], true, false);
    instance.addResourceBundle(locale, 'onboarding', mobileOnboarding[locale], true, false);
  });
}
