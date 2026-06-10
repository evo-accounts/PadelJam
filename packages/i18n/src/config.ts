import i18next, { type i18n as I18n } from 'i18next';
import enAuth from './resources/en/auth.json';
import enCommon from './resources/en/common.json';
import enOnboarding from './resources/en/onboarding.json';
import ptPTAuth from './resources/pt-PT/auth.json';
import ptPTCommon from './resources/pt-PT/common.json';
import ptPTOnboarding from './resources/pt-PT/onboarding.json';
import ptBRAuth from './resources/pt-BR/auth.json';
import ptBRCommon from './resources/pt-BR/common.json';
import ptBROnboarding from './resources/pt-BR/onboarding.json';

const resources = {
  en: { auth: enAuth, common: enCommon, onboarding: enOnboarding },
  'pt-PT': { auth: ptPTAuth, common: ptPTCommon, onboarding: ptPTOnboarding },
  'pt-BR': { auth: ptBRAuth, common: ptBRCommon, onboarding: ptBROnboarding },
} as const;

export const createI18n = async (locale: 'pt-PT' | 'pt-BR' | 'en'): Promise<I18n> => {
  const instance = i18next.createInstance();
  await instance.init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    ns: ['auth', 'common', 'onboarding'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
  return instance;
};
