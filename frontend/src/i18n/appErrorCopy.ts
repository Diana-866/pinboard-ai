/**
 * Error text for code that is not a React component.
 *
 * Components read `t` from `useI18n()`. A few failures are raised inside plain modules —
 * payment link creation, response validation — where no hook is available, and the
 * language has to come from the same place the request layer already reads it from. The
 * map is kept small on purpose: every entry here is a message a customer can actually see,
 * so it is worth a translation in all seven locales.
 */
import { readLocalStorageValue } from '../lib/authStorage';

type Language = 'en' | 'ru' | 'es' | 'pt' | 'de' | 'fr' | 'zh';

const MESSAGES: Record<Language, { paymentLinkMissing: string }> = {
  en: {
    paymentLinkMissing: 'The server did not return a payment link. Try again or contact support.',
  },
  ru: {
    paymentLinkMissing: 'Сервер не вернул ссылку на оплату. Попробуйте ещё раз или напишите в поддержку.',
  },
  es: {
    paymentLinkMissing: 'El servidor no devolvió ningún enlace de pago. Inténtalo de nuevo o escribe al soporte.',
  },
  pt: {
    paymentLinkMissing: 'O servidor não devolveu qualquer link de pagamento. Tente novamente ou contacte o suporte.',
  },
  de: {
    paymentLinkMissing: 'Der Server hat keinen Zahlungslink zurückgegeben. Versuchen Sie es erneut oder wenden Sie sich an den Support.',
  },
  fr: {
    paymentLinkMissing: 'Le serveur n’a pas renvoyé de lien de paiement. Réessayez ou contactez le support.',
  },
  zh: {
    paymentLinkMissing: '服务器未返回支付链接，请重试或联系客服。',
  },
};

export function currentInterfaceLanguage(): Language {
  const stored = String(readLocalStorageValue('pinposy_lang') || '').toLowerCase().split('-')[0];
  return (Object.prototype.hasOwnProperty.call(MESSAGES, stored) ? stored : 'en') as Language;
}

export function getAppErrorMessage(key: keyof (typeof MESSAGES)['en']): string {
  return MESSAGES[currentInterfaceLanguage()][key];
}
